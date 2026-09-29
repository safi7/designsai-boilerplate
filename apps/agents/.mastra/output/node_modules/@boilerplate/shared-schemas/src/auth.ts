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
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

export const LoginRequestSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1).max(128),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

/** Purposes an emailed one-time code can be issued for. */
export const OtpPurposeSchema = z.enum(['verify-email', 'sign-in', 'reset-password']);
export type OtpPurpose = z.infer<typeof OtpPurposeSchema>;

export const OtpSendRequestSchema = z.object({
  email: EmailSchema,
  purpose: OtpPurposeSchema,
});
export type OtpSendRequest = z.infer<typeof OtpSendRequestSchema>;

export const OtpSendResponseSchema = z.object({
  success: z.literal(true),
  /** Seconds before another code can be requested. */
  resendAfterSeconds: z.number().int(),
});

export const VerifyEmailRequestSchema = z.object({ email: EmailSchema, code: OtpCodeSchema });
export type VerifyEmailRequest = z.infer<typeof VerifyEmailRequestSchema>;

export const OtpSignInRequestSchema = z.object({ email: EmailSchema, code: OtpCodeSchema });
export type OtpSignInRequest = z.infer<typeof OtpSignInRequestSchema>;

export const ResetPasswordRequestSchema = z.object({
  email: EmailSchema,
  code: OtpCodeSchema,
  password: PasswordSchema,
});
export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequestSchema>;

export const ChangePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1).max(128).optional(),
  newPassword: PasswordSchema,
});
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;

export const GoogleSignInRequestSchema = z.object({
  /** Google Identity Services ID token (JWT). */
  credential: z.string().min(20).max(4096),
});
export type GoogleSignInRequest = z.infer<typeof GoogleSignInRequestSchema>;

export const AuthResponseSchema = z.object({
  success: z.literal(true),
  user: UserResponseSchema,
});
export type AuthResponse = z.infer<typeof AuthResponseSchema>;

export const RegisterResponseSchema = z.object({
  success: z.literal(true),
  email: z.string(),
  /** Always true: the account must be verified before it can sign in. */
  verificationRequired: z.literal(true),
});
export type RegisterResponse = z.infer<typeof RegisterResponseSchema>;

export const SessionSchema = z.object({
  id: z.string(),
  userAgent: z.string().nullable(),
  ipAddress: z.string().nullable(),
  createdAt: z.string(),
  lastUsedAt: z.string(),
  expiresAt: z.string(),
  current: z.boolean(),
});
export type Session = z.infer<typeof SessionSchema>;

export const SessionListResponseSchema = z.object({ sessions: z.array(SessionSchema) });

export const AuthProvidersResponseSchema = z.object({
  google: z.object({ enabled: z.boolean(), clientId: z.string().nullable() }),
});
export type AuthProvidersResponse = z.infer<typeof AuthProvidersResponseSchema>;
