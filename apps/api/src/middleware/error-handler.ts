import type { ErrorHandler, NotFoundHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { ZodError } from 'zod';
import { AppError, ERROR_CODES, ERROR_MESSAGES } from '@boilerplate/shared-utils';
import { log } from '../lib/logger.js';
import type { AppEnv } from '../types/hono.js';

/**
 * The single place where exceptions become HTTP responses. Clients always get
 * `{ success: false, error, message }`; stack traces and `AppError.context`
 * stay in the logs.
 */
export const errorHandler: ErrorHandler<AppEnv> = (err, c) => {
  const requestId = c.get('requestId');

  if (err instanceof AppError) {
    const level = err.statusCode >= 500 ? 'error' : 'debug';
    log[level]('Request failed', { requestId, code: err.code, path: c.req.path, context: err.context, error: err.message });
    if (err.code === ERROR_CODES.RATE_LIMIT_EXCEEDED && typeof err.details?.retryAfterSeconds === 'number') {
      c.header('Retry-After', String(err.details.retryAfterSeconds));
    }
    return c.json(
      { success: false as const, error: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
      err.statusCode as ContentfulStatusCode
    );
  }

  if (err instanceof ZodError) {
    return c.json({ success: false as const, error: ERROR_CODES.VALIDATION_ERROR, message: ERROR_MESSAGES.validation_error }, 400);
  }

  if (err instanceof HTTPException) {
    const status = err.status as ContentfulStatusCode;
    const code =
      status === 401
        ? ERROR_CODES.NOT_AUTHENTICATED
        : status === 403
          ? ERROR_CODES.FORBIDDEN
          : status === 404
            ? ERROR_CODES.NOT_FOUND
            : ERROR_CODES.VALIDATION_ERROR;
    return c.json({ success: false as const, error: code, message: err.message || ERROR_MESSAGES[code] }, status);
  }

  log.error('Unhandled error', { requestId, path: c.req.path, method: c.req.method, error: err.message, stack: err.stack });
  return c.json({ success: false as const, error: ERROR_CODES.INTERNAL_ERROR, message: ERROR_MESSAGES.internal_error }, 500);
};

export const notFoundHandler: NotFoundHandler<AppEnv> = c =>
  c.json({ success: false as const, error: ERROR_CODES.NOT_FOUND, message: `Route ${c.req.method} ${c.req.path} not found` }, 404);
