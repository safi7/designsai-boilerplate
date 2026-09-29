import { ERROR_CODES, ERROR_MESSAGES, errorCodeToHttpStatus } from './error-codes.js';
/**
 * The single error type services throw. The API error handler turns it into
 * `{ success: false, error: code, message }` with the mapped HTTP status.
 *
 * `context` is for logs only and is never serialised to the client.
 */
export class AppError extends Error {
    code;
    statusCode;
    context;
    /** Extra client-safe fields (e.g. `retryAfterSeconds`). */
    details;
    constructor(code, options = {}) {
        super(options.message ?? ERROR_MESSAGES[code], options.cause !== undefined ? { cause: options.cause } : undefined);
        this.name = 'AppError';
        this.code = code;
        this.statusCode = options.statusCode ?? errorCodeToHttpStatus(code);
        this.context = options.context;
        this.details = options.details;
    }
    static notFound(what = 'Resource') {
        return new AppError(ERROR_CODES.NOT_FOUND, { message: `${what} not found` });
    }
    static validation(message, details) {
        return new AppError(ERROR_CODES.VALIDATION_ERROR, { message, details });
    }
    static unauthorized(code = ERROR_CODES.NOT_AUTHENTICATED) {
        return new AppError(code);
    }
    static forbidden(message) {
        return new AppError(ERROR_CODES.FORBIDDEN, { message });
    }
    static rateLimited(retryAfterSeconds) {
        return new AppError(ERROR_CODES.RATE_LIMIT_EXCEEDED, { details: { retryAfterSeconds } });
    }
    static internal(message, context, cause) {
        return new AppError(ERROR_CODES.INTERNAL_ERROR, { message, context, cause });
    }
}
export function isAppError(error) {
    return error instanceof AppError;
}
//# sourceMappingURL=app-error.js.map