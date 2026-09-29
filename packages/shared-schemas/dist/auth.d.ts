import { z } from 'zod';
export declare const RegisterRequestSchema: z.ZodObject<{
    name: z.ZodString;
    lastName: z.ZodOptional<z.ZodString>;
    email: z.ZodString;
    password: z.ZodString;
    language: z.ZodOptional<z.ZodEnum<["en", "es"]>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    email: string;
    password: string;
    lastName?: string | undefined;
    language?: "en" | "es" | undefined;
}, {
    name: string;
    email: string;
    password: string;
    lastName?: string | undefined;
    language?: "en" | "es" | undefined;
}>;
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;
export declare const LoginRequestSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    password: string;
}, {
    email: string;
    password: string;
}>;
export type LoginRequest = z.infer<typeof LoginRequestSchema>;
/** Purposes an emailed one-time code can be issued for. */
export declare const OtpPurposeSchema: z.ZodEnum<["verify-email", "sign-in", "reset-password"]>;
export type OtpPurpose = z.infer<typeof OtpPurposeSchema>;
export declare const OtpSendRequestSchema: z.ZodObject<{
    email: z.ZodString;
    purpose: z.ZodEnum<["verify-email", "sign-in", "reset-password"]>;
}, "strip", z.ZodTypeAny, {
    email: string;
    purpose: "verify-email" | "sign-in" | "reset-password";
}, {
    email: string;
    purpose: "verify-email" | "sign-in" | "reset-password";
}>;
export type OtpSendRequest = z.infer<typeof OtpSendRequestSchema>;
export declare const OtpSendResponseSchema: z.ZodObject<{
    success: z.ZodLiteral<true>;
    /** Seconds before another code can be requested. */
    resendAfterSeconds: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    success: true;
    resendAfterSeconds: number;
}, {
    success: true;
    resendAfterSeconds: number;
}>;
export declare const VerifyEmailRequestSchema: z.ZodObject<{
    email: z.ZodString;
    code: z.ZodString;
}, "strip", z.ZodTypeAny, {
    code: string;
    email: string;
}, {
    code: string;
    email: string;
}>;
export type VerifyEmailRequest = z.infer<typeof VerifyEmailRequestSchema>;
export declare const OtpSignInRequestSchema: z.ZodObject<{
    email: z.ZodString;
    code: z.ZodString;
}, "strip", z.ZodTypeAny, {
    code: string;
    email: string;
}, {
    code: string;
    email: string;
}>;
export type OtpSignInRequest = z.infer<typeof OtpSignInRequestSchema>;
export declare const ResetPasswordRequestSchema: z.ZodObject<{
    email: z.ZodString;
    code: z.ZodString;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    code: string;
    email: string;
    password: string;
}, {
    code: string;
    email: string;
    password: string;
}>;
export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequestSchema>;
export declare const ChangePasswordRequestSchema: z.ZodObject<{
    currentPassword: z.ZodOptional<z.ZodString>;
    newPassword: z.ZodString;
}, "strip", z.ZodTypeAny, {
    newPassword: string;
    currentPassword?: string | undefined;
}, {
    newPassword: string;
    currentPassword?: string | undefined;
}>;
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;
export declare const GoogleSignInRequestSchema: z.ZodObject<{
    /** Google Identity Services ID token (JWT). */
    credential: z.ZodString;
}, "strip", z.ZodTypeAny, {
    credential: string;
}, {
    credential: string;
}>;
export type GoogleSignInRequest = z.infer<typeof GoogleSignInRequestSchema>;
export declare const AuthResponseSchema: z.ZodObject<{
    success: z.ZodLiteral<true>;
    user: z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        lastName: z.ZodNullable<z.ZodString>;
        email: z.ZodString;
        status: z.ZodEnum<["pending", "active", "banned", "deactivated"]>;
        emailVerified: z.ZodBoolean;
        hasPassword: z.ZodBoolean;
        language: z.ZodString;
        avatarUrl: z.ZodNullable<z.ZodString>;
        createdAt: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        status: "pending" | "active" | "banned" | "deactivated";
        id: string;
        createdAt: string;
        name: string;
        lastName: string | null;
        email: string;
        emailVerified: boolean;
        hasPassword: boolean;
        language: string;
        avatarUrl: string | null;
    }, {
        status: "pending" | "active" | "banned" | "deactivated";
        id: string;
        createdAt: string;
        name: string;
        lastName: string | null;
        email: string;
        emailVerified: boolean;
        hasPassword: boolean;
        language: string;
        avatarUrl: string | null;
    }>;
}, "strip", z.ZodTypeAny, {
    success: true;
    user: {
        status: "pending" | "active" | "banned" | "deactivated";
        id: string;
        createdAt: string;
        name: string;
        lastName: string | null;
        email: string;
        emailVerified: boolean;
        hasPassword: boolean;
        language: string;
        avatarUrl: string | null;
    };
}, {
    success: true;
    user: {
        status: "pending" | "active" | "banned" | "deactivated";
        id: string;
        createdAt: string;
        name: string;
        lastName: string | null;
        email: string;
        emailVerified: boolean;
        hasPassword: boolean;
        language: string;
        avatarUrl: string | null;
    };
}>;
export type AuthResponse = z.infer<typeof AuthResponseSchema>;
export declare const RegisterResponseSchema: z.ZodObject<{
    success: z.ZodLiteral<true>;
    email: z.ZodString;
    /** Always true: the account must be verified before it can sign in. */
    verificationRequired: z.ZodLiteral<true>;
}, "strip", z.ZodTypeAny, {
    success: true;
    email: string;
    verificationRequired: true;
}, {
    success: true;
    email: string;
    verificationRequired: true;
}>;
export type RegisterResponse = z.infer<typeof RegisterResponseSchema>;
export declare const SessionSchema: z.ZodObject<{
    id: z.ZodString;
    userAgent: z.ZodNullable<z.ZodString>;
    ipAddress: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodString;
    lastUsedAt: z.ZodString;
    expiresAt: z.ZodString;
    current: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: string;
    userAgent: string | null;
    ipAddress: string | null;
    lastUsedAt: string;
    expiresAt: string;
    current: boolean;
}, {
    id: string;
    createdAt: string;
    userAgent: string | null;
    ipAddress: string | null;
    lastUsedAt: string;
    expiresAt: string;
    current: boolean;
}>;
export type Session = z.infer<typeof SessionSchema>;
export declare const SessionListResponseSchema: z.ZodObject<{
    sessions: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        userAgent: z.ZodNullable<z.ZodString>;
        ipAddress: z.ZodNullable<z.ZodString>;
        createdAt: z.ZodString;
        lastUsedAt: z.ZodString;
        expiresAt: z.ZodString;
        current: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        id: string;
        createdAt: string;
        userAgent: string | null;
        ipAddress: string | null;
        lastUsedAt: string;
        expiresAt: string;
        current: boolean;
    }, {
        id: string;
        createdAt: string;
        userAgent: string | null;
        ipAddress: string | null;
        lastUsedAt: string;
        expiresAt: string;
        current: boolean;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    sessions: {
        id: string;
        createdAt: string;
        userAgent: string | null;
        ipAddress: string | null;
        lastUsedAt: string;
        expiresAt: string;
        current: boolean;
    }[];
}, {
    sessions: {
        id: string;
        createdAt: string;
        userAgent: string | null;
        ipAddress: string | null;
        lastUsedAt: string;
        expiresAt: string;
        current: boolean;
    }[];
}>;
export declare const AuthProvidersResponseSchema: z.ZodObject<{
    google: z.ZodObject<{
        enabled: z.ZodBoolean;
        clientId: z.ZodNullable<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        enabled: boolean;
        clientId: string | null;
    }, {
        enabled: boolean;
        clientId: string | null;
    }>;
}, "strip", z.ZodTypeAny, {
    google: {
        enabled: boolean;
        clientId: string | null;
    };
}, {
    google: {
        enabled: boolean;
        clientId: string | null;
    };
}>;
export type AuthProvidersResponse = z.infer<typeof AuthProvidersResponseSchema>;
//# sourceMappingURL=auth.d.ts.map