import { z } from 'zod';
export declare const UserStatusSchema: z.ZodEnum<["pending", "active", "banned", "deactivated"]>;
export declare const UserResponseSchema: z.ZodObject<{
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
export type UserResponse = z.infer<typeof UserResponseSchema>;
export declare const UpdateProfileRequestSchema: z.ZodEffects<z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    lastName: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    language: z.ZodOptional<z.ZodEnum<["en", "es"]>>;
}, "strip", z.ZodTypeAny, {
    name?: string | undefined;
    lastName?: string | null | undefined;
    language?: "en" | "es" | undefined;
}, {
    name?: string | undefined;
    lastName?: string | null | undefined;
    language?: "en" | "es" | undefined;
}>, {
    name?: string | undefined;
    lastName?: string | null | undefined;
    language?: "en" | "es" | undefined;
}, {
    name?: string | undefined;
    lastName?: string | null | undefined;
    language?: "en" | "es" | undefined;
}>;
export type UpdateProfileRequest = z.infer<typeof UpdateProfileRequestSchema>;
export declare const AVATAR_MAX_BYTES: number;
export declare const AVATAR_CONTENT_TYPES: readonly ["image/png", "image/jpeg", "image/webp"];
//# sourceMappingURL=users.d.ts.map