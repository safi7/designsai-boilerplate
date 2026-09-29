import { ERROR_CODES, ERROR_MESSAGES, errorCodeToHttpStatus, type ErrorCode } from './error-codes.js';

/**
 * The single error type services throw. The API error handler turns it into
 * `{ success: false, error: code, message }` with the mapped HTTP status.
 *
 * `context` is for logs only and is never serialised to the client.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly context?: Record<string, unknown>;
  /** Extra client-safe fields (e.g. `retryAfterSeconds`). */
  readonly details?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    options: { message?: string; statusCode?: number; context?: Record<string, unknown>; details?: Record<string, unknown>; cause?: unknown } = {}
  ) {
    super(options.message ?? ERROR_MESSAGES[code], options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = options.statusCode ?? errorCodeToHttpStatus(code);
    this.context = options.context;
    this.details = options.details;
  }

  static notFound(what = 'Resource'): AppError {
    return new AppError(ERROR_CODES.NOT_FOUND, { message: `${what} not found` });
  }

  static validation(message?: string, details?: Record<string, unknown>): AppError {
    return new AppError(ERROR_CODES.VALIDATION_ERROR, { message, details });
  }

  static unauthorized(code: ErrorCode = ERROR_CODES.NOT_AUTHENTICATED): AppError {
    return new AppError(code);
  }

  static forbidden(message?: string): AppError {
    return new AppError(ERROR_CODES.FORBIDDEN, { message });
  }

  static rateLimited(retryAfterSeconds: number): AppError {
    return new AppError(ERROR_CODES.RATE_LIMIT_EXCEEDED, { details: { retryAfterSeconds } });
  }

  static internal(message?: string, context?: Record<string, unknown>, cause?: unknown): AppError {
    return new AppError(ERROR_CODES.INTERNAL_ERROR, { message, context, cause });
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
