import { Transaction as SequelizeTransaction, Op } from 'sequelize';
import sequelize from '../config/database';
import { Wallet, TransactionLog } from '../models';
import { TransactionStatus, TransferRequest, TransferResponse, TransferError } from '../types';
import RedisService from './RedisService';

/**
 * TransferService with Redis Integration
 * 
 * EXECUTION FLOW WITH REDIS:
 * 
 * 1. CHECK REDIS CACHE (0.1ms)
 *    - If hit: Return cached result immediately
 *    - If miss: Continue to step 2
 * 
 * 2. ACQUIRE REDIS LOCK (prevents duplicate processing)
 *    - If acquired: Continue to step 3
 *    - If locked: Retry or check database
 * 
 * 3. CHECK POSTGRESQL (10-50ms)
 *    - If exists: Return result and cache in Redis
 *    - If not exists: Continue to step 4
 * 
 * 4. EXECUTE TRANSFER (database transaction)
 *    - Create PENDING log
 *    - Lock wallets
 *    - Update balances
 *    - Mark SUCCESS/FAILED
 * 
 * 5. CACHE RESULT IN REDIS
 *    - Store for 24 hours
 *    - Future requests skip database entirely
 * 
 * 6. RELEASE REDIS LOCK
 */
class TransferService {
  async executeTransfer(request: TransferRequest): Promise<TransferResponse> {
    const { fromWalletId, toWalletId, amount, idempotencyKey } = request;

    // Input validation
    this.validateTransferRequest(request);

    // ============================================================
    // STEP 1: CHECK REDIS CACHE FIRST (FAST PATH)
    // ============================================================
    const cachedResult = await RedisService.getCachedResult(idempotencyKey);
    if (cachedResult) {
      console.log(`[REDIS HIT] Idempotency key: ${idempotencyKey}`);
      return {
        ...cachedResult,
        message: 'Transfer already processed (idempotent request) (from cache)',
      };
    }

    // ============================================================
    // STEP 2: ACQUIRE DISTRIBUTED LOCK
    // ============================================================
    // Prevents multiple app instances from processing same request
    const lockAcquired = await RedisService.acquireLockWithRetry(idempotencyKey);
    
    if (!lockAcquired) {
      // Could not acquire lock - another instance is processing
      // Check database for result (might be complete by now)
      const existingTransaction = await TransactionLog.findOne({
        where: { idempotencyKey },
      });

      if (existingTransaction) {
        const result = this.buildResponseFromLog(existingTransaction);
        // Cache for future requests
        await RedisService.cacheResult(idempotencyKey, result);
        return result;
      }

      throw new TransferError(
        'Request is being processed by another instance. Please retry.',
        409,
        'CONCURRENT_PROCESSING'
      );
    }

    try {
      // ============================================================
      // STEP 3: CHECK POSTGRESQL (REDIS MISS)
      // ============================================================
      const existingTransaction = await TransactionLog.findOne({
        where: { idempotencyKey },
      });

      if (existingTransaction) {
        // Found in database but not in cache
        // Cache it for next time
        const result = this.buildResponseFromLog(existingTransaction);
        await RedisService.cacheResult(idempotencyKey, result);
        return result;
      }

      // ============================================================
      // STEP 4: EXECUTE TRANSFER (NO EXISTING RECORD)
      // ============================================================
      const result = await sequelize.transaction(
        {
          isolationLevel: SequelizeTransaction.ISOLATION_LEVELS.READ_COMMITTED,
        },
        async (t: SequelizeTransaction) => {
          // Create PENDING log entry
          let transactionLog: TransactionLog;
          try {
            transactionLog = await TransactionLog.create(
              {
                fromWalletId,
                toWalletId,
                amount,
                status: TransactionStatus.PENDING,
                idempotencyKey,
                metadata: {
                  requestedAt: new Date().toISOString(),
                },
              },
              { transaction: t }
            );
          } catch (error: any) {
            if (error.name === 'SequelizeUniqueConstraintError') {
              throw new TransferError(
                'Duplicate request detected',
                409,
                'DUPLICATE_REQUEST'
              );
            }
            throw error;
          }

          // Lock wallet rows in consistent order
          const [firstLockId, secondLockId] =
            fromWalletId < toWalletId
              ? [fromWalletId, toWalletId]
              : [toWalletId, fromWalletId];

          const firstWallet = await Wallet.findByPk(firstLockId, {
            lock: t.LOCK.UPDATE,
            transaction: t,
          });

          const secondWallet = await Wallet.findByPk(secondLockId, {
            lock: t.LOCK.UPDATE,
            transaction: t,
          });

          const fromWallet = fromWalletId === firstLockId ? firstWallet : secondWallet;
          const toWallet = toWalletId === firstLockId ? firstWallet : secondWallet;

          if (!fromWallet || !toWallet) {
            throw new TransferError('One or both wallets not found', 404, 'WALLET_NOT_FOUND');
          }

          // Validate sufficient balance
          const fromBalanceNum = parseFloat(fromWallet.balance);
          const amountNum = parseFloat(amount);

          if (fromBalanceNum < amountNum) {
            throw new TransferError(
              `Insufficient balance. Available: ${fromWallet.balance}, Required: ${amount}`,
              400,
              'INSUFFICIENT_BALANCE'
            );
          }

          // Update balances
          const newFromBalance = (fromBalanceNum - amountNum).toFixed(4);
          const toBalanceNum = parseFloat(toWallet.balance);
          const newToBalance = (toBalanceNum + amountNum).toFixed(4);

          await fromWallet.update(
            {
              balance: newFromBalance,
              version: fromWallet.version + 1,
            },
            { transaction: t }
          );

          await toWallet.update(
            {
              balance: newToBalance,
              version: toWallet.version + 1,
            },
            { transaction: t }
          );

          // Mark transaction SUCCESS
          await transactionLog.update(
            {
              status: TransactionStatus.SUCCESS,
              metadata: {
                ...transactionLog.metadata,
                completedAt: new Date().toISOString(),
                fromBalanceAfter: newFromBalance,
                toBalanceAfter: newToBalance,
              },
            },
            { transaction: t }
          );

          return {
            transactionLog,
            fromBalance: newFromBalance,
            toBalance: newToBalance,
          };
        }
      );

      // ============================================================
      // STEP 5: CACHE RESULT IN REDIS
      // ============================================================
      const successResponse = {
        success: true,
        transactionId: result.transactionLog.id,
        message: 'Transfer completed successfully',
        fromBalance: result.fromBalance,
        toBalance: result.toBalance,
      };

      // Cache asynchronously (don't block response)
      RedisService.cacheResult(idempotencyKey, successResponse).catch((error) => {
        console.error('Failed to cache result:', error);
      });

      return successResponse;
    } catch (error: any) {
      // Mark transaction failed
      await this.markTransactionFailed(idempotencyKey, error.message);

      if (error instanceof TransferError) {
        throw error;
      }

      throw new TransferError(
        error.message || 'Transfer failed due to unexpected error',
        500,
        'TRANSFER_FAILED'
      );
    } finally {
      // ============================================================
      // STEP 6: ALWAYS RELEASE LOCK
      // ============================================================
      await RedisService.releaseLock(idempotencyKey);
    }
  }

  private async markTransactionFailed(
    idempotencyKey: string,
    errorMessage: string
  ): Promise<void> {
    try {
      await TransactionLog.update(
        {
          status: TransactionStatus.FAILED,
          errorMessage,
          metadata: sequelize.literal(
            `metadata || '{"failedAt": "${new Date().toISOString()}"}'::jsonb`
          ),
        },
        {
          where: { idempotencyKey },
        }
      );
    } catch (updateError) {
      console.error('Failed to mark transaction as failed:', updateError);
    }
  }

  private buildResponseFromLog(log: TransactionLog): TransferResponse {
    const baseResponse = {
      transactionId: log.id,
      success: log.status === TransactionStatus.SUCCESS,
      message:
        log.status === TransactionStatus.SUCCESS
          ? 'Transfer already processed (idempotent request)'
          : log.status === TransactionStatus.PENDING
          ? 'Transfer is being processed'
          : 'Transfer previously failed',
    };

    if (log.status === TransactionStatus.SUCCESS && log.metadata) {
      const metadata = log.metadata as any;
      return {
        ...baseResponse,
        fromBalance: metadata.fromBalanceAfter,
        toBalance: metadata.toBalanceAfter,
      };
    }

    return baseResponse;
  }

  private validateTransferRequest(request: TransferRequest): void {
    const { fromWalletId, toWalletId, amount, idempotencyKey } = request;

    if (!fromWalletId || !toWalletId || !amount || !idempotencyKey) {
      throw new TransferError('Missing required fields', 400, 'INVALID_REQUEST');
    }

    if (fromWalletId === toWalletId) {
      throw new TransferError(
        'Cannot transfer to the same wallet',
        400,
        'SAME_WALLET_TRANSFER'
      );
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      throw new TransferError(
        'Amount must be a positive number',
        400,
        'INVALID_AMOUNT'
      );
    }

    if (amountNum < 0.0001) {
      throw new TransferError(
        'Amount must be at least 0.0001',
        400,
        'AMOUNT_TOO_SMALL'
      );
    }

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(fromWalletId) || !uuidRegex.test(toWalletId)) {
      throw new TransferError('Invalid wallet ID format', 400, 'INVALID_WALLET_ID');
    }
  }

  async getWalletBalance(walletId: string): Promise<string> {
    const wallet = await Wallet.findByPk(walletId);
    if (!wallet) {
      throw new TransferError('Wallet not found', 404, 'WALLET_NOT_FOUND');
    }
    return wallet.balance;
  }

  async getTransactionHistory(walletId: string): Promise<TransactionLog[]> {
    return await TransactionLog.findAll({
      where: {
        [Op.or]: [
          { fromWalletId: walletId },
          { toWalletId: walletId },
        ],
      },
      order: [['createdAt', 'DESC']],
      limit: 100,
    });
  }
}

export default new TransferService();