import { Request, Response, NextFunction } from 'express';
import { TransferError } from '../types';

/**
 * Global error handler middleware
 * Formats errors consistently and prevents leaking stack traces in production
 */
export function errorHandler(
  err: Error | TransferError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log error for debugging
  console.error('Error occurred:', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    path: req.path,
    method: req.method,
  });

  // Handle custom TransferError
  if (err instanceof TransferError) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code || 'TRANSFER_ERROR',
        message: err.message,
      },
    });
    return;
  }

  // Handle Sequelize errors
  if (err.name === 'SequelizeValidationError') {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: (err as any).errors?.map((e: any) => e.message),
      },
    });
    return;
  }

  if (err.name === 'SequelizeUniqueConstraintError') {
    res.status(409).json({
      success: false,
      error: {
        code: 'DUPLICATE_ENTRY',
        message: 'Resource already exists',
      },
    });
    return;
  }

  // Generic error response
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message:
        process.env.NODE_ENV === 'production'
          ? 'An unexpected error occurred'
          : err.message,
    },
  });
}