import { createRoute, z } from '@hono/zod-openapi';
import { AgentThreadListResponseSchema, AgentThreadSchema, CreateThreadRequestSchema, CreateThreadResponseSchema, CursorPaginationQuerySchema, SendMessageRequestSchema, SendMessageResponseSchema, SuccessResponseSchema, ThreadDetailResponseSchema, UpdateThreadRequestSchema, } from '@boilerplate/shared-schemas';
import { createRouter } from '../../lib/openapi-hono.js';
import { RATE_LIMITS } from '../../lib/rate-limiter.js';
import { getAuth, requireAuth } from '../../middleware/auth.js';
import { enforceRateLimits } from '../../middleware/rate-limit.js';
import { streamThreadEvents } from '../../services/agents/ask-ai/sse-stream.js';
import { toThreadDto } from '../../services/agents/thread-directory.js';
import { cookieAuth, errorResponses, jsonBody, jsonContent } from '../openapi-helpers.js';
const ThreadParams = z.object({ threadId: z.string().min(1).max(64) });
/**
 * Agent facade. `/agents/threads/*` is domain-agnostic (list, rename, delete,
 * send, cancel); `/agents/ask-ai/*` holds what is specific to Ask AI. A new
 * agent domain would add its own `/agents/<domain>/*` next to it.
 */
export function createAgentRoutes(container) {
    const { threads, askAi, redis, prisma, events, hub, log } = container;
    const router = createRouter();
    router.use('*', requireAuth);
    // ---- Thread directory ----------------------------------------------------
    router.openapi(createRoute({
        method: 'get',
        path: '/threads',
        tags: ['Threads'],
        summary: 'List threads (newest activity first)',
        security: cookieAuth,
        request: {
            query: CursorPaginationQuerySchema.extend({
                search: z.string().trim().max(100).optional(),
                favorites: z.enum(['true', 'false']).optional(),
            }),
        },
        responses: { 200: jsonContent(AgentThreadListResponseSchema, 'Threads'), ...errorResponses(401) },
    }), async (c) => {
        const { cursor, limit, search, favorites } = c.req.valid('query');
        const page = await threads.list(getAuth(c).userId, { cursor, limit, search: search || undefined, favorites: favorites === 'true' });
        return c.json({ items: page.items.map(toThreadDto), pageInfo: { nextCursor: page.nextCursor, hasMore: page.hasMore } }, 200);
    });
    router.openapi(createRoute({
        method: 'get',
        path: '/threads/{threadId}',
        tags: ['Threads'],
        summary: 'Thread with its full event log',
        security: cookieAuth,
        request: { params: ThreadParams },
        responses: { 200: jsonContent(ThreadDetailResponseSchema, 'Thread detail'), ...errorResponses(401, 404) },
    }), async (c) => c.json(await askAi.getDetail(getAuth(c).userId, c.req.valid('param').threadId), 200));
    router.openapi(createRoute({
        method: 'patch',
        path: '/threads/{threadId}',
        tags: ['Threads'],
        summary: 'Rename or (un)favourite a thread',
        security: cookieAuth,
        request: { params: ThreadParams, ...jsonBody(UpdateThreadRequestSchema) },
        responses: { 200: jsonContent(AgentThreadSchema, 'Updated thread'), ...errorResponses(400, 401, 404) },
    }), async (c) => {
        const thread = await threads.update(getAuth(c).userId, c.req.valid('param').threadId, c.req.valid('json'));
        return c.json(toThreadDto(thread), 200);
    });
    router.openapi(createRoute({
        method: 'delete',
        path: '/threads/{threadId}',
        tags: ['Threads'],
        summary: 'Delete a thread',
        security: cookieAuth,
        request: { params: ThreadParams },
        responses: { 200: jsonContent(SuccessResponseSchema, 'Deleted'), ...errorResponses(401, 404) },
    }), async (c) => {
        const { userId } = getAuth(c);
        const { threadId } = c.req.valid('param');
        await askAi.cancel(userId, threadId);
        await threads.softDelete(userId, threadId);
        return c.json({ success: true }, 200);
    });
    router.openapi(createRoute({
        method: 'post',
        path: '/threads/{threadId}/messages',
        tags: ['Threads'],
        summary: 'Send a message (the answer streams over the events endpoint)',
        security: cookieAuth,
        request: { params: ThreadParams, ...jsonBody(SendMessageRequestSchema) },
        responses: { 202: jsonContent(SendMessageResponseSchema, 'Turn started'), ...errorResponses(400, 401, 402, 404, 409, 429) },
    }), async (c) => {
        const { userId } = getAuth(c);
        await enforceRateLimits(redis, c, [RATE_LIMITS.askAiPerUser(userId.toString())]);
        const result = await askAi.sendMessage(userId, c.req.valid('param').threadId, c.req.valid('json').content);
        return c.json(result, 202);
    });
    router.openapi(createRoute({
        method: 'post',
        path: '/threads/{threadId}/cancel',
        tags: ['Threads'],
        summary: 'Stop the answer being generated',
        security: cookieAuth,
        request: { params: ThreadParams },
        responses: { 200: jsonContent(z.object({ cancelled: z.boolean() }), 'Cancel requested'), ...errorResponses(401, 404) },
    }), async (c) => c.json(await askAi.cancel(getAuth(c).userId, c.req.valid('param').threadId), 200));
    // ---- Ask AI --------------------------------------------------------------
    router.openapi(createRoute({
        method: 'post',
        path: '/ask-ai/threads',
        tags: ['Ask AI'],
        summary: 'Start a conversation with a first message',
        security: cookieAuth,
        request: jsonBody(CreateThreadRequestSchema),
        responses: { 201: jsonContent(CreateThreadResponseSchema, 'Thread created, first turn started'), ...errorResponses(400, 401, 402, 429) },
    }), async (c) => {
        const { userId } = getAuth(c);
        await enforceRateLimits(redis, c, [RATE_LIMITS.askAiPerUser(userId.toString())]);
        return c.json(await askAi.createThread(userId, c.req.valid('json').content), 201);
    });
    // SSE is not an OpenAPI JSON route; documented in docs/architecture.
    router.get('/ask-ai/threads/:threadId/events', async (c) => {
        const { userId } = getAuth(c);
        const threadId = c.req.param('threadId');
        const conversation = await askAi.getStreamContext(userId, threadId);
        const rawCursor = c.req.header('last-event-id') ?? c.req.query('cursor') ?? '0';
        const fromCursor = /^\d+$/.test(rawCursor) ? Number(rawCursor) : 0;
        return streamThreadEvents(c, { prisma, events, hub, logger: log }, { threadId, conversationId: conversation.id, fromCursor });
    });
    return router;
}
//# sourceMappingURL=agents.js.map