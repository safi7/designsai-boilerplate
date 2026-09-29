import { createRoute, z } from '@hono/zod-openapi';
import { AVATAR_MAX_BYTES, UpdateProfileRequestSchema, UserResponseSchema } from '@boilerplate/shared-schemas';
import { AppError, ERROR_CODES } from '@boilerplate/shared-utils';
import { createRouter } from '../../lib/openapi-hono.js';
import { RATE_LIMITS } from '../../lib/rate-limiter.js';
import { requestMeta } from '../../lib/request.js';
import { getAuth, requireAuth } from '../../middleware/auth.js';
import { enforceRateLimits } from '../../middleware/rate-limit.js';
import { cookieAuth, errorResponses, jsonBody, jsonContent } from '../openapi-helpers.js';
const tags = ['Users'];
export function createUserRoutes(container) {
    const { users, audit, redis } = container;
    const router = createRouter();
    router.use('*', requireAuth);
    router.openapi(createRoute({
        method: 'patch',
        path: '/me',
        tags,
        summary: 'Update profile',
        security: cookieAuth,
        request: jsonBody(UpdateProfileRequestSchema),
        responses: { 200: jsonContent(UserResponseSchema, 'Updated user'), ...errorResponses(400, 401) },
    }), async (c) => {
        const { userId } = getAuth(c);
        const patch = c.req.valid('json');
        const user = await users.updateProfile(userId, patch);
        audit.record({ userId, action: 'UPDATE', resourceType: 'Profile', resourceId: userId.toString(), changes: patch, ...requestMeta(c) });
        return c.json(await users.toResponse(user), 200);
    });
    router.openapi(createRoute({
        method: 'post',
        path: '/me/avatar',
        tags,
        summary: 'Upload an avatar (PNG, JPEG or WebP, max 2 MB)',
        security: cookieAuth,
        request: {
            body: {
                required: true,
                content: { 'multipart/form-data': { schema: z.object({ file: z.any().openapi({ type: 'string', format: 'binary' }) }) } },
            },
        },
        responses: { 200: jsonContent(UserResponseSchema, 'Updated user'), ...errorResponses(400, 401, 413, 415, 429) },
    }), async (c) => {
        const { userId } = getAuth(c);
        await enforceRateLimits(redis, c, [RATE_LIMITS.uploadPerUser(userId.toString())]);
        // Reject oversized bodies before buffering the multipart payload.
        const declared = Number(c.req.header('content-length') ?? 0);
        if (declared > AVATAR_MAX_BYTES + 64 * 1024)
            throw new AppError(ERROR_CODES.PAYLOAD_TOO_LARGE);
        const form = await c.req.formData();
        const file = form.get('file');
        if (!(file instanceof File))
            throw AppError.validation('Expected a file field named "file"');
        const user = await users.setAvatar(userId, file);
        audit.record({ userId, action: 'UPLOAD', resourceType: 'Profile', resourceId: userId.toString(), description: 'Avatar updated', ...requestMeta(c) });
        return c.json(await users.toResponse(user), 200);
    });
    router.openapi(createRoute({
        method: 'delete',
        path: '/me/avatar',
        tags,
        summary: 'Remove the avatar',
        security: cookieAuth,
        responses: { 200: jsonContent(UserResponseSchema, 'Updated user'), ...errorResponses(401) },
    }), async (c) => c.json(await users.toResponse(await users.removeAvatar(getAuth(c).userId)), 200));
    return router;
}
//# sourceMappingURL=users.js.map