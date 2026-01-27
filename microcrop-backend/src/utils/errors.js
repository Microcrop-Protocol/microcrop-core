export class AppError extends Error {
  constructor(message, statusCode, code) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message, details) {
    super(message, 400, 'INVALID_INPUT');
    this.details = details;
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource already exists') {
    super(message, 409, 'CONFLICT');
  }
}

export class BlockchainError extends AppError {
  constructor(message = 'Blockchain operation failed', originalError) {
    super(message, 502, 'BLOCKCHAIN_ERROR');
    this.originalError = originalError;
  }
}

export class PaymentError extends AppError {
  constructor(message = 'Payment operation failed', originalError) {
    super(message, 502, 'PAYMENT_ERROR');
    this.originalError = originalError;
  }
}
