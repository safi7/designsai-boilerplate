import { ThreadEventSchema } from '@boilerplate/shared-schemas';
import { isUniqueViolation } from '../../../lib/prisma-errors.js';
export function toThreadEvent(row) {
    return ThreadEventSchema.parse({
        type: row.type,
        cursor: row.eventCursor,
        createdAt: row.createdAt.toISOString(),
        payload: row.payload,
    });
}
/**
 * Append-only event log per conversation.
 *
 * `append` increments the conversation's cursor and inserts the event in one
 * transaction; the UPDATE takes the row lock, so concurrent appends get
 * strictly increasing, gap-free cursors. `dedupeKey` makes appends
 * idempotent: replaying the same logical event returns the stored row.
 */
export class AskAiEventStore {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async append(conversationId, type, payload, dedupeKey) {
        const existing = await this.prisma.askAiThreadEvent.findUnique({
            where: { conversationId_dedupeKey: { conversationId, dedupeKey } },
        });
        if (existing)
            return toThreadEvent(existing);
        try {
            const row = await this.prisma.$transaction(async (tx) => {
                const conversation = await tx.askAiConversation.update({
                    where: { id: conversationId },
                    data: { eventCursor: { increment: 1 } },
                    select: { eventCursor: true },
                });
                return tx.askAiThreadEvent.create({
                    data: { conversationId, eventCursor: conversation.eventCursor, type, payload: payload, dedupeKey },
                });
            });
            return toThreadEvent(row);
        }
        catch (error) {
            if (!isUniqueViolation(error))
                throw error;
            const winner = await this.prisma.askAiThreadEvent.findUniqueOrThrow({ where: { conversationId_dedupeKey: { conversationId, dedupeKey } } });
            return toThreadEvent(winner);
        }
    }
    async listAfter(conversationId, cursor, limit = 200) {
        const rows = await this.prisma.askAiThreadEvent.findMany({
            where: { conversationId, eventCursor: { gt: cursor } },
            orderBy: { eventCursor: 'asc' },
            take: limit,
        });
        return rows.map(toThreadEvent);
    }
    /** Recent user messages, oldest first — the input for title generation. */
    async recentUserMessages(conversationId, limit) {
        const rows = await this.prisma.askAiThreadEvent.findMany({
            where: { conversationId, type: 'message.user' },
            orderBy: { eventCursor: 'asc' },
            take: limit,
        });
        return rows.map(r => r.payload.content);
    }
}
//# sourceMappingURL=event-store.js.map