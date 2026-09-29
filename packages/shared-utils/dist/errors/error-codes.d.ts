/**
 * Stable, machine-readable error codes returned in `{ success: false, error }`.
 *
 * Codes are part of the public API contract: the web app maps them to
 * localized messages, so rename = breaking change. Each code is specific
 * enough to be actionable on the client without leaking internals.
 */
export declare const ERROR_CODES: {
    readonly VALIDATION_ERROR: "validation_error";
    readonly NOT_FOUND: "not_found";
    readonly CONFLICT: "conflict";
    readonly PAYLOAD_TOO_LARGE: "payload_too_large";
    readonly UNSUPPORTED_MEDIA_TYPE: "unsupported_media_type";
    readonly RATE_LIMIT_EXCEEDED: "rate_limit_exceeded";
    readonly NOT_AUTHENTICATED: "not_authenticated";
    readonly SESSION_EXPIRED: "session_expired";
    readonly INVALID_CREDENTIALS: "invalid_credentials";
    readonly EMAIL_NOT_VERIFIED: "email_not_verified";
    readonly EMAIL_ALREADY_EXISTS: "email_already_exists";
    readonly ACCOUNT_INACTIVE: "account_inactive";
    readonly INVALID_OTP: "invalid_otp";
    readonly OTP_COOLDOWN: "otp_cooldown";
    readonly SSO_FAILED: "sso_failed";
    readonly SSO_NOT_CONFIGURED: "sso_not_configured";
    readonly PASSWORD_NOT_SET: "password_not_set";
    readonly FORBIDDEN: "forbidden";
    readonly INSUFFICIENT_CREDITS: "insufficient_credits";
    readonly PAYMENTS_NOT_CONFIGURED: "payments_not_configured";
    readonly PAYMENT_FAILED: "payment_failed";
    readonly THREAD_BUSY: "thread_busy";
    readonly AGENT_UNAVAILABLE: "agent_unavailable";
    readonly AGENT_ERROR: "agent_error";
    readonly EMAIL_DELIVERY_FAILED: "email_delivery_failed";
    readonly STORAGE_ERROR: "storage_error";
    readonly SERVICE_UNAVAILABLE: "service_unavailable";
    readonly INTERNAL_ERROR: "internal_error";
};
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
export declare function errorCodeToHttpStatus(code: ErrorCode): number;
export declare const ERROR_MESSAGES: Record<ErrorCode, string>;
//# sourceMappingURL=error-codes.d.ts.map