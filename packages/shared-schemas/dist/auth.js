import { z } from 'zod';
import { EmailSchema, LocaleSchema, OtpCodeSchema, PasswordSchema } from './common.js';
import { UserResponseSchema } from './users.js';
export const RegisterRequestSchema = z.object({
    name: z.string().trim().min(1).max(100),
    lastName: z.string().trim().max(100).optional(),
    email: EmailSchema,
    password: PasswordSchema,
    language: LocaleSchema.optional(),
});
export const LoginRequestSchema = z.object({
    email: EmailSchema,
    password: z.string().min(1).max(128),
});
/** Purposes an emailed one-time code can be issued for. */
export const OtpPurposeSchema = z.enum(['verify-email', 'sign-in', 'reset-password']);
export const OtpSendRequestSchema = z.object({
    email: EmailSchema,
    purpose: OtpPurposeSchema,
});
export const OtpSendResponseSchema = z.object({
    success: z.literal(true),
    /** Seconds before another code can be requested. */
    resendAfterSeconds: z.number().int(),
});
export const VerifyEmailRequestSchema = z.object({ email: EmailSchema, code: OtpCodeSchema });
export const OtpSignInRequestSchema = z.object({ email: EmailSchema, code: OtpCodeSchema });
export const ResetPasswordRequestSchema = z.object({
    email: EmailSchema,
    code: OtpCodeSchema,
    password: PasswordSchema,
});
export const ChangePasswordRequestSchema = z.object({
    currentPassword: z.string().min(1).max(128).optional(),
    newPassword: PasswordSchema,
});
export const GoogleSignInRequestSchema = z.object({
    /** Google Identity Services ID token (JWT). */
    credential: z.string().min(20).max(4096),
});
export const AuthResponseSchema = z.object({
    success: z.literal(true),
    user: UserResponseSchema,
});
export const RegisterResponseSchema = z.object({
    success: z.literal(true),
    email: z.string(),
    /** Always true: the account must be verified before it can sign in. */
    verificationRequired: z.literal(true),
});
export const SessionSchema = z.object({
    id: z.string(),
    userAgent: z.string().nullable(),
    ipAddress: z.string().nullable(),
    createdAt: z.string(),
    lastUsedAt: z.string(),
    expiresAt: z.string(),
    current: z.boolean(),
});
export const SessionListResponseSchema = z.object({ sessions: z.array(SessionSchema) });
export const AuthProvidersResponseSchema = z.object({
    google: z.object({ enabled: z.boolean(), clientId: z.string().nullable() }),
});
//# sourceMappingURL=auth.js.map