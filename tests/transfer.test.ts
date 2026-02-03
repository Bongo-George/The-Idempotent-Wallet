import sequelize from '../src/config/database';
import { Wallet, TransactionLog } from '../src/models';
import TransferService from '../src/services/TransferService';
import { TransactionStatus, TransferError } from '../src/types';

describe('TransferService', () => {
  let wallet1: Wallet;
  let wallet2: Wallet;

  beforeAll(async () => {
    // Connect to test database
    await sequelize.authenticate();
    await sequelize.sync({ force: true });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  beforeEach(async () => {
    // Clean database
    await TransactionLog.destroy({ where: {}, force: true });
    await Wallet.destroy({ where: {}, force: true });

    // Create test wallets
    wallet1 = await Wallet.create({
      userId: 'user1',
      balance: '1000.0000',
    });

    wallet2 = await Wallet.create({
      userId: 'user2',
      balance: '500.0000',
    });
  });

  describe('Basic Transfer', () => {
    it('should successfully transfer money between wallets', async () => {
      const result = await TransferService.executeTransfer({
        fromWalletId: wallet1.id,
        toWalletId: wallet2.id,
        amount: '100.0000',
        idempotencyKey: 'test-transfer-1',
      });

      expect(result.success).toBe(true);
      expect(result.fromBalance).toBe('900.0000');
      expect(result.toBalance).toBe('600.0000');

      // Verify database state
      const updatedWallet1 = await Wallet.findByPk(wallet1.id);
      const updatedWallet2 = await Wallet.findByPk(wallet2.id);

      expect(updatedWallet1?.balance).toBe('900.0000');
      expect(updatedWallet2?.balance).toBe('600.0000');
    });

    it('should create transaction log with SUCCESS status', async () => {
      await TransferService.executeTransfer({
        fromWalletId: wallet1.id,
        toWalletId: wallet2.id,
        amount: '100.0000',
        idempotencyKey: 'test-transfer-2',
      });

      const log = await TransactionLog.findOne({
        where: { idempotencyKey: 'test-transfer-2' },
      });

      expect(log).not.toBeNull();
      expect(log?.status).toBe(TransactionStatus.SUCCESS);
      expect(log?.amount).toBe('100.0000');
    });
  });

  describe('Idempotency', () => {
    it('should return same result for duplicate idempotency key', async () => {
      const firstResult = await TransferService.executeTransfer({
        fromWalletId: wallet1.id,
        toWalletId: wallet2.id,
        amount: '100.0000',
        idempotencyKey: 'duplicate-key',
      });

      const secondResult = await TransferService.executeTransfer({
        fromWalletId: wallet1.id,
        toWalletId: wallet2.id,
        amount: '100.0000',
        idempotencyKey: 'duplicate-key',
      });

      expect(firstResult.transactionId).toBe(secondResult.transactionId);
      expect(secondResult.message).toContain('already processed');

      // Verify balance only changed once
      const finalWallet1 = await Wallet.findByPk(wallet1.id);
      expect(finalWallet1?.balance).toBe('900.0000');
    });

    it('should handle concurrent requests with same idempotency key', async () => {
      // Fire two concurrent requests
      const promises = [
        TransferService.executeTransfer({
          fromWalletId: wallet1.id,
          toWalletId: wallet2.id,
          amount: '100.0000',
          idempotencyKey: 'concurrent-key',
        }),
        TransferService.executeTransfer({
          fromWalletId: wallet1.id,
          toWalletId: wallet2.id,
          amount: '100.0000',
          idempotencyKey: 'concurrent-key',
        }),
      ];

      const results = await Promise.allSettled(promises);

      // At least one should succeed
      const successCount = results.filter((r) => r.status === 'fulfilled').length;
      expect(successCount).toBeGreaterThanOrEqual(1);

      // Final balance should reflect only one transfer
      const finalWallet1 = await Wallet.findByPk(wallet1.id);
      expect(finalWallet1?.balance).toBe('900.0000');

      // Should have exactly one transaction log
      const logCount = await TransactionLog.count({
        where: { idempotencyKey: 'concurrent-key' },
      });
      expect(logCount).toBe(1);
    });
  });

  describe('Validation', () => {
    it('should reject transfer with insufficient balance', async () => {
      await expect(
        TransferService.executeTransfer({
          fromWalletId: wallet1.id,
          toWalletId: wallet2.id,
          amount: '2000.0000',
          idempotencyKey: 'insufficient-balance',
        })
      ).rejects.toThrow(TransferError);

      // Verify balances unchanged
      const wallet1After = await Wallet.findByPk(wallet1.id);
      expect(wallet1After?.balance).toBe('1000.0000');
    });

    it('should reject transfer to same wallet', async () => {
      await expect(
        TransferService.executeTransfer({
          fromWalletId: wallet1.id,
          toWalletId: wallet1.id,
          amount: '100.0000',
          idempotencyKey: 'same-wallet',
        })
      ).rejects.toThrow(TransferError);
    });

    it('should reject negative amount', async () => {
      await expect(
        TransferService.executeTransfer({
          fromWalletId: wallet1.id,
          toWalletId: wallet2.id,
          amount: '-100.0000',
          idempotencyKey: 'negative-amount',
        })
      ).rejects.toThrow(TransferError);
    });

    it('should reject zero amount', async () => {
      await expect(
        TransferService.executeTransfer({
          fromWalletId: wallet1.id,
          toWalletId: wallet2.id,
          amount: '0.0000',
          idempotencyKey: 'zero-amount',
        })
      ).rejects.toThrow(TransferError);
    });
  });

  describe('Race Condition Safety', () => {
    it('should handle concurrent transfers from same wallet', async () => {
      // Start with 1000 balance, try three concurrent 400 transfers
      // Only two should succeed (total 800), third should fail
      const promises = [
        TransferService.executeTransfer({
          fromWalletId: wallet1.id,
          toWalletId: wallet2.id,
          amount: '400.0000',
          idempotencyKey: 'race-1',
        }),
        TransferService.executeTransfer({
          fromWalletId: wallet1.id,
          toWalletId: wallet2.id,
          amount: '400.0000',
          idempotencyKey: 'race-2',
        }),
        TransferService.executeTransfer({
          fromWalletId: wallet1.id,
          toWalletId: wallet2.id,
          amount: '400.0000',
          idempotencyKey: 'race-3',
        }),
      ];

      const results = await Promise.allSettled(promises);

      const successful = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.filter((r) => r.status === 'rejected').length;

      expect(successful).toBe(2);
      expect(failed).toBe(1);

      // Final balance should be exactly 200 (1000 - 400 - 400)
      const finalWallet1 = await Wallet.findByPk(wallet1.id);
      expect(finalWallet1?.balance).toBe('200.0000');
    });
  });

  describe('Transaction Atomicity', () => {
    it('should rollback all changes on failure', async () => {
      // Force a failure by using invalid wallet ID partway through
      await expect(
        TransferService.executeTransfer({
          fromWalletId: wallet1.id,
          toWalletId: '00000000-0000-0000-0000-000000000000',
          amount: '100.0000',
          idempotencyKey: 'rollback-test',
        })
      ).rejects.toThrow();

      // Verify original balance unchanged
      const wallet1After = await Wallet.findByPk(wallet1.id);
      expect(wallet1After?.balance).toBe('1000.0000');

      // Verify FAILED transaction log was created
      const log = await TransactionLog.findOne({
        where: { idempotencyKey: 'rollback-test' },
      });
      
      // The PENDING log should exist and be marked FAILED
      expect(log).not.toBeNull();
      expect(log?.status).toBe(TransactionStatus.FAILED);
    });
  });

  describe('Precision Handling', () => {
    it('should handle decimal amounts with precision', async () => {
      const result = await TransferService.executeTransfer({
        fromWalletId: wallet1.id,
        toWalletId: wallet2.id,
        amount: '123.4567',
        idempotencyKey: 'precision-test',
      });

      expect(result.success).toBe(true);
      
      // Should maintain 4 decimal places
      const wallet1After = await Wallet.findByPk(wallet1.id);
      const wallet2After = await Wallet.findByPk(wallet2.id);
      
      expect(wallet1After?.balance).toBe('876.5433');
      expect(wallet2After?.balance).toBe('623.4567');
    });
  });
});