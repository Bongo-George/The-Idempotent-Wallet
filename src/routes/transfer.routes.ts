import { Router } from 'express';
import TransferController from '../controllers/TransferController';

const router = Router();

/**
 * Transfer routes
 */

router.post('/transfer', TransferController.transfer.bind(TransferController));

// Get wallet balance
router.get('/wallet/:walletId/balance', TransferController.getBalance.bind(TransferController));

// Get transaction history
router.get('/wallet/:walletId/transactions', TransferController.getTransactions.bind(TransferController));

export default router;