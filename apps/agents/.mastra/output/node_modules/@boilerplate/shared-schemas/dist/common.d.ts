import { z } from 'zod';
/** Every error response from the API has this shape. `error` is a stable, machine-readable code. */
export declare const ErrorResponseSchema: z.ZodObject<{
    success: z.ZodLiteral<false>;
    error: z.ZodString;
    message: z.ZodOptional<z.ZodString>;
    details: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    success: false;
    error: string;
    message?: string | undefined;
    details?: Record<string, unknown> | undefined;
}, {
    success: false;
    error: string;
    message?: string | undefined;
    details?: Record<string, unknown> | undefined;
}>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
export declare const SuccessResponseSchema: z.ZodObject<{
    success: z.ZodLiteral<true>;
}, "strip", z.ZodTypeAny, {
    success: true;
}, {
    success: true;
}>;
export declare const EmailSchema: z.ZodString;
/**
 * Password policy: 8–128 chars with at least one letter and one digit.
 * bcrypt silently truncates past 72 bytes, so the upper bound is enforced by
 * the API too (see hashPassword) rather than relying on this alone.
 */
export declare const PasswordSchema: z.ZodString;
export declare const OtpCodeSchema: z.ZodString;
export declare const LocaleSchema: z.ZodEnum<["en", "es"]>;
export type Locale = z.infer<typeof LocaleSchema>;
/** Opaque keyset cursor + page size, shared by every list endpoint. */
export declare const CursorPaginationQuerySchema: z.ZodObject<{
    cursor: z.ZodOptional<z.ZodString>;
    limit: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    cursor?: string | undefined;
}, {
    cursor?: string | undefined;
    limit?: number | undefined;
}>;
export declare const PageInfoSchema: z.ZodObject<{
    nextCursor: z.ZodNullable<z.ZodString>;
    hasMore: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    nextCursor: string | null;
    hasMore: boolean;
}, {
    nextCursor: string | null;
    hasMore: boolean;
}>;
export type PageInfo = z.infer<typeof PageInfoSchema>;
//# sourceMappingURL=common.d.ts.map