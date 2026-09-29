/**
 * Stable, machine-readable error codes returned in `{ success: false, error }`.
 *
 * Codes are part of the public API contract: the web app maps them to
 * localized messages, so rename = breaking change. Each code is specific
 * enough to be actionable on the client without leaking internals.
 */
export const ERROR_CODES = {
    // Request
    VALIDATION_ERROR: 'validation_error',
    NOT_FOUND: 'not_found',
    CONFLICT: 'conflict',
    PAYLOAD_TOO_LARGE: 'payload_too_large',
    UNSUPPORTED_MEDIA_TYPE: 'unsupported_media_type',
    RATE_LIMIT_EXCEEDED: 'rate_limit_exceeded',
    // Authentication
    NOT_AUTHENTICATED: 'not_authenticated',
    SESSION_EXPIRED: 'session_expired',
    INVALID_CREDENTIALS: 'invalid_credentials',
    EMAIL_NOT_VERIFIED: 'email_not_verified',
    EMAIL_ALREADY_EXISTS: 'email_already_exists',
    ACCOUNT_INACTIVE: 'account_inactive',
    INVALID_OTP: 'invalid_otp',
    OTP_COOLDOWN: 'otp_cooldown',
    SSO_FAILED: 'sso_failed',
    SSO_NOT_CONFIGURED: 'sso_not_configured',
    PASSWORD_NOT_SET: 'password_not_set',
    // Authorization
    FORBIDDEN: 'forbidden',
    // Credits & payments
    INSUFFICIENT_CREDITS: 'insufficient_credits',
    PAYMENTS_NOT_CONFIGURED: 'payments_not_configured',
    PAYMENT_FAILED: 'payment_failed',
    // Agents
    THREAD_BUSY: 'thread_busy',
    AGENT_UNAVAILABLE: 'agent_unavailable',
    AGENT_ERROR: 'agent_error',
    // Infrastructure
    EMAIL_DELIVERY_FAILED: 'email_delivery_failed',
    STORAGE_ERROR: 'storage_error',
    SERVICE_UNAVAILABLE: 'service_unavailable',
    INTERNAL_ERROR: 'internal_error',
};
const STATUS_BY_CODE = {
    validation_error: 400,
    not_found: 404,
    conflict: 409,
    payload_too_large: 413,
    unsupported_media_type: 415,
    rate_limit_exceeded: 429,
    not_authenticated: 401,
    session_expired: 401,
    invalid_credentials: 401,
    email_not_verified: 403,
    email_already_exists: 409,
    account_inactive: 403,
    invalid_otp: 400,
    otp_cooldown: 429,
    sso_failed: 401,
    sso_not_configured: 501,
    password_not_set: 400,
    forbidden: 403,
    insufficient_credits: 402,
    payments_not_configured: 501,
    payment_failed: 402,
    thread_busy: 409,
    agent_unavailable: 503,
    agent_error: 502,
    email_delivery_failed: 502,
    storage_error: 502,
    service_unavailable: 503,
    internal_error: 500,
};
export function errorCodeToHttpStatus(code) {
    return STATUS_BY_CODE[code] ?? 500;
}
export const ERROR_MESSAGES = {
    validation_error: 'The request is invalid.',
    not_found: 'The requested resource was not found.',
    conflict: 'The request conflicts with the current state.',
    payload_too_large: 'The uploaded file is too large.',
    unsupported_media_type: 'This file type is not supported.',
    rate_limit_exceeded: 'Too many requests. Please try again later.',
    not_authenticated: 'Please sign in to continue.',
    session_expired: 'Your session has expired. Please sign in again.',
    invalid_credentials: 'Email or password is incorrect.',
    email_not_verified: 'Please verify your email address.',
    email_already_exists: 'An account with this email already exists.',
    account_inactive: 'This account is not active.',
    invalid_otp: 'The code is invalid or has expired.',
    otp_cooldown: 'Please wait before requesting another code.',
    sso_failed: 'Single sign-on failed.',
    sso_not_configured: 'This sign-in method is not available.',
    password_not_set: 'This account does not have a password yet.',
    forbidden: 'You do not have permission to do this.',
    insufficient_credits: 'You do not have enough credits.',
    payments_not_configured: 'Payments are not available.',
    payment_failed: 'The payment could not be completed.',
    thread_busy: 'A response is already being generated in this conversation.',
    agent_unavailable: 'The assistant is temporarily unavailable.',
    agent_error: 'The assistant failed to respond.',
    email_delivery_failed: 'We could not send the email. Please try again.',
    storage_error: 'File storage failed. Please try again.',
    service_unavailable: 'The service is temporarily unavailable.',
    internal_error: 'Something went wrong.',
};
//# sourceMappingURL=error-codes.js.map