import { type ErrorCode } from './error-codes.js';
/**
 * The single error type services throw. The API error handler turns it into
 * `{ success: false, error: code, message }` with the mapped HTTP status.
 *
 * `context` is for logs only and is never serialised to the client.
 */
export declare class AppError extends Error {
    readonly code: ErrorCode;
    readonly statusCode: number;
    readonly context?: Record<string, unknown>;
    /** Extra client-safe fields (e.g. `retryAfterSeconds`). */
    readonly details?: Record<string, unknown>;
    constructor(code: ErrorCode, options?: {
        message?: string;
        statusCode?: number;
        context?: Record<string, unknown>;
        details?: Record<string, unknown>;
        cause?: unknown;
    });
    static notFound(what?: string): AppError;
    static validation(message?: string, details?: Record<string, unknown>): AppError;
    static unauthorized(code?: ErrorCode): AppError;
    static forbidden(message?: string): AppError;
    static rateLimited(retryAfterSeconds: number): AppError;
    static internal(message?: string, context?: Record<string, unknown>, cause?: unknown): AppError;
}
export declare function isAppError(error: unknown): error is AppError;
//# sourceMappingURL=app-error.d.ts.map