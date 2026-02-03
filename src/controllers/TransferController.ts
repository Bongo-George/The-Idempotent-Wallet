import { Request, Response, NextFunction } from 'express';
import TransferService from '../services/TransferService';
import { TransferRequest } from '../types';

/**
 * TransferController handles HTTP layer for transfer operations
 
 */
class TransferController {
  /**
   * POST /transfer
   * Execute a wallet-to-wallet transfer
   */
  async transfer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const transferRequest: TransferRequest = {
        fromWalletId: req.body.fromWalletId,
        toWalletId: req.body.toWalletId,
        amount: req.body.amount?.toString(), // Ensure string
        idempotencyKey: req.body.idempotencyKey,
      };

      const result = await TransferService.executeTransfer(transferRequest);

      // Return appropriate status code
      const statusCode = result.success ? 200 : 400;
      res.status(statusCode).json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /wallet/:walletId/balance
   * Get current wallet balance
   */
  async getBalance(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { walletId } = req.params;
      const balance = await TransferService.getWalletBalance(walletId);
      
      res.status(200).json({
        walletId,
        balance,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /wallet/:walletId/transactions
   * Get transaction history for a wallet
   */
  async getTransactions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { walletId } = req.params;
      const transactions = await TransferService.getTransactionHistory(walletId);
      
      res.status(200).json({
        walletId,
        transactions,
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new TransferController();