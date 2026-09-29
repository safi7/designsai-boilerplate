import { z } from 'zod';
import { PageInfoSchema } from './common.js';

export const ASK_AI_MESSAGE_MAX_LENGTH = 8000;

export const AgentThreadStatusSchema = z.enum(['idle', 'running', 'failed']);
export type AgentThreadStatus = z.infer<typeof AgentThreadStatusSchema>;

export const MessageContentSchema = z.string().trim().min(1).max(ASK_AI_MESSAGE_MAX_LENGTH);

// ---------------------------------------------------------------------------
// Public (web ↔ api) contract
// ---------------------------------------------------------------------------

export const CreateThreadRequestSchema = z.object({ content: MessageContentSchema });
export type CreateThreadRequest = z.infer<typeof CreateThreadRequestSchema>;

export const SendMessageRequestSchema = z.object({ content: MessageContentSchema });
export type SendMessageRequest = z.infer<typeof SendMessageRequestSchema>;

export const UpdateThreadRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(191).optional(),
    isFavorite: z.boolean().optional(),
  })
  .refine(v => v.title !== undefined || v.isFavorite !== undefined, { message: 'Nothing to update' });
export type UpdateThreadRequest = z.infer<typeof UpdateThreadRequestSchema>;

export const AgentThreadSchema = z.object({
  id: z.string(),
  domain: z.literal('ask_ai'),
  title: z.string(),
  status: AgentThreadStatusSchema,
  isFavorite: z.boolean(),
  lastMessageAt: z.string(),
  createdAt: z.string(),
});
export type AgentThread = z.infer<typeof AgentThreadSchema>;

export const AgentThreadListResponseSchema = z.object({
  items: z.array(AgentThreadSchema),
  pageInfo: PageInfoSchema,
});
export type AgentThreadListResponse = z.infer<typeof AgentThreadListResponseSchema>;

export const TurnUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  creditsCharged: z.string(),
});
export type TurnUsage = z.infer<typeof TurnUsageSchema>;

/**
 * Durable thread events. Persisted with a monotonically increasing cursor, so a
 * client that reconnects with `?cursor=N` receives exactly the events after N.
 */
export const ThreadEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('message.user'),
    cursor: z.number().int(),
    createdAt: z.string(),
    payload: z.object({ messageId: z.string(), turnId: z.string(), content: z.string() }),
  }),
  z.object({
    type: z.literal('message.assistant'),
    cursor: z.number().int(),
    createdAt: z.string(),
    payload: z.object({ messageId: z.string(), turnId: z.string(), content: z.string(), usage: TurnUsageSchema.nullable() }),
  }),
  z.object({
    type: z.literal('turn.started'),
    cursor: z.number().int(),
    createdAt: z.string(),
    payload: z.object({ turnId: z.string() }),
  }),
  z.object({
    type: z.literal('turn.failed'),
    cursor: z.number().int(),
    createdAt: z.string(),
    payload: z.object({ turnId: z.string(), code: z.string(), message: z.string() }),
  }),
  z.object({
    type: z.literal('turn.cancelled'),
    cursor: z.number().int(),
    createdAt: z.string(),
    payload: z.object({ turnId: z.string(), partialContent: z.string() }),
  }),
  z.object({
    type: z.literal('thread.title'),
    cursor: z.number().int(),
    createdAt: z.string(),
    payload: z.object({ title: z.string() }),
  }),
]);
export type ThreadEvent = z.infer<typeof ThreadEventSchema>;
export type ThreadEventType = ThreadEvent['type'];

/**
 * Ephemeral streaming frames. Never persisted: `delta` carries the assistant
 * text as it is generated and `snapshot` lets a late subscriber catch up with
 * the text generated before it connected. `seq` orders them within a turn.
 */
export const StreamFrameSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('message.delta'), turnId: z.string(), seq: z.number().int(), delta: z.string() }),
  z.object({ type: z.literal('message.snapshot'), turnId: z.string(), seq: z.number().int(), content: z.string() }),
]);
export type StreamFrame = z.infer<typeof StreamFrameSchema>;

export const ThreadDetailResponseSchema = z.object({
  thread: AgentThreadSchema,
  events: z.array(ThreadEventSchema),
  cursor: z.number().int(),
  activeTurnId: z.string().nullable(),
});
export type ThreadDetailResponse = z.infer<typeof ThreadDetailResponseSchema>;

export const CreateThreadResponseSchema = z.object({
  threadId: z.string(),
  turnId: z.string(),
});
export type CreateThreadResponse = z.infer<typeof CreateThreadResponseSchema>;

export const SendMessageResponseSchema = z.object({ turnId: z.string() });
export type SendMessageResponse = z.infer<typeof SendMessageResponseSchema>;

// ---------------------------------------------------------------------------
// Internal (api ↔ agents) contract
// ---------------------------------------------------------------------------

export const AskAiTurnRequestSchema = z.object({
  userId: z.string().min(1),
  threadId: z.string().min(1),
  mastraThreadId: z.string().min(1),
  turnId: z.string().min(1),
  message: MessageContentSchema,
  locale: z.string().max(10).optional(),
  userName: z.string().max(200).optional(),
});
export type AskAiTurnRequest = z.infer<typeof AskAiTurnRequestSchema>;

/** NDJSON frames the agents service streams back for one turn. */
export const AskAiTurnFrameSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text-delta'), delta: z.string() }),
  z.object({
    type: z.literal('finish'),
    text: z.string(),
    modelId: z.string(),
    usage: z.object({ inputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative() }),
  }),
  z.object({ type: z.literal('error'), code: z.string(), message: z.string() }),
]);
export type AskAiTurnFrame = z.infer<typeof AskAiTurnFrameSchema>;

export const ThreadTitleRequestSchema = z.object({
  userId: z.string().min(1),
  messages: z.array(z.string().max(ASK_AI_MESSAGE_MAX_LENGTH)).min(1).max(5),
  locale: z.string().max(10).optional(),
});
export type ThreadTitleRequest = z.infer<typeof ThreadTitleRequestSchema>;

export const ThreadTitleResponseSchema = z.object({ title: z.string().min(1).max(100) });
export type ThreadTitleResponse = z.infer<typeof ThreadTitleResponseSchema>;
