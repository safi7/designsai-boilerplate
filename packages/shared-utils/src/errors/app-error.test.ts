import { describe, expect, it } from 'vitest';
import { AppError, ERROR_CODES, ERROR_MESSAGES } from '../index.js';

describe('AppError', () => {
  it('derives status and message from the code', () => {
    const error = new AppError(ERROR_CODES.INSUFFICIENT_CREDITS);
    expect(error.statusCode).toBe(402);
    expect(error.message).toBe(ERROR_MESSAGES.insufficient_credits);
  });

  it('carries client-safe details separately from log context', () => {
    const error = AppError.rateLimited(30);
    expect(error.statusCode).toBe(429);
    expect(error.details).toEqual({ retryAfterSeconds: 30 });
    expect(error.context).toBeUndefined();
  });

  it('is an Error', () => {
    expect(AppError.notFound('Thread')).toBeInstanceOf(Error);
  });
});
