import { z } from 'zod';

/** Every error response from the API has this shape. `error` is a stable, machine-readable code. */
export const ErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  message: z.string().optional(),
  details: z.record(z.unknown()).optional(),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

export const SuccessResponseSchema = z.object({ success: z.literal(true) });

export const EmailSchema = z.string().trim().toLowerCase().email().max(255);

/**
 * Password policy: 8–128 chars with at least one letter and one digit.
 * bcrypt silently truncates past 72 bytes, so the upper bound is enforced by
 * the API too (see hashPassword) rather than relying on this alone.
 */
export const PasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/\d/, 'Password must contain a number');

export const OtpCodeSchema = z.string().regex(/^\d{6}$/, 'Code must be 6 digits');

export const LocaleSchema = z.enum(['en', 'es']);
export type Locale = z.infer<typeof LocaleSchema>;

/** Opaque keyset cursor + page size, shared by every list endpoint. */
export const CursorPaginationQuerySchema = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const PageInfoSchema = z.object({
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});
export type PageInfo = z.infer<typeof PageInfoSchema>;
