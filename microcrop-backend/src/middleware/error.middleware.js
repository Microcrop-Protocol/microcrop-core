import logger from '../utils/logger.js';
import { AppError } from '../utils/errors.js';

export function errorHandler(err, req, res, _next) {
  // Log the error with request context
  const errorContext = {
    method: req.method,
    path: req.path,
    userId: req.user?.id,
    organizationId: req.organization?.id || req.user?.organizationId,
    code: err.code,
    statusCode: err.statusCode,
  };

  if (err.isOperational) {
    logger.warn(err.message, errorContext);
  } else {
    logger.error('Unexpected error', {
      ...errorContext,
      message: err.message,
      stack: err.stack,
    });
  }

  // Prisma known errors
  if (err.code === 'P2002') {
    return res.status(409).json({
      success: false,
      error: {
        code: 'CONFLICT',
        message: 'Resource already exists',
        details: { fields: err.meta?.target },
      },
    });
  }

  if (err.code === 'P2025') {
    return res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Resource not found',
      },
    });
  }

  // Operational errors
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.details && { details: err.details }),
      },
    });
  }

  // Unknown errors
  const statusCode = err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : err.message;

  res.status(statusCode).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message,
    },
  });
}
