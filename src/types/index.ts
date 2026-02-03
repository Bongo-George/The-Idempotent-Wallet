export enum TransactionStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

export interface TransferRequest {
  fromWalletId: string;
  toWalletId: string;
  amount: string; // String to preserve precision
  idempotencyKey: string;
}

export interface TransferResponse {
  success: boolean;
  transactionId: string;
  message: string;
  fromBalance?: string;
  toBalance?: string;
}

export class TransferError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400,
    public code?: string
  ) {
    super(message);
    this.name = 'TransferError';
  }
}