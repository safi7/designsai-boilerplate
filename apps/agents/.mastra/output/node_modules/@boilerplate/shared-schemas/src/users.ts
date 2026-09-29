import { z } from 'zod';
import { LocaleSchema } from './common.js';

export const UserStatusSchema = z.enum(['pending', 'active', 'banned', 'deactivated']);

export const UserResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  lastName: z.string().nullable(),
  email: z.string(),
  status: UserStatusSchema,
  emailVerified: z.boolean(),
  hasPassword: z.boolean(),
  language: z.string(),
  avatarUrl: z.string().nullable(),
  createdAt: z.string(),
});
export type UserResponse = z.infer<typeof UserResponseSchema>;

export const UpdateProfileRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    lastName: z.string().trim().max(100).nullable().optional(),
    language: LocaleSchema.optional(),
  })
  .refine(value => Object.keys(value).length > 0, { message: 'At least one field is required' });
export type UpdateProfileRequest = z.infer<typeof UpdateProfileRequestSchema>;

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_CONTENT_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
