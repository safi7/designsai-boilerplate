import { randomUUID } from 'node:crypto';
import { AppError, ERROR_CODES } from '@boilerplate/shared-utils';
import { DEFAULT_THREAD_TITLE, toThreadDto } from '../thread-directory.js';
const DETAIL_EVENT_LIMIT = 1000;
/** Ask AI use-cases exposed to the routes. */
export class AskAiConversationService {
    deps;
    constructor(deps) {
        this.deps = deps;
    }
    async createThread(userId, content) {
        const { prisma } = this.deps;
        await this.assertCanAfford(userId);
        const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, name: true, language: true } });
        const thread = await prisma.agentThread.create({
            data: {
                userId,
                domain: 'ask_ai',
                title: DEFAULT_THREAD_TITLE,
                conversation: { create: { mastraThreadId: `ask-ai-${randomUUID()}` } },
            },
            include: { conversation: true },
        });
        const turnId = randomUUID();
        await this.deps.runner.start({
            user,
            threadId: thread.id,
            conversationId: thread.conversation.id,
            mastraThreadId: thread.conversation.mastraThreadId,
            turnId,
            content,
        });
        return { threadId: thread.id, turnId };
    }
    async sendMessage(userId, threadId, content) {
        const { prisma, threads } = this.deps;
        await threads.getOwned(userId, threadId);
        const conversation = await this.getConversation(threadId);
        if (conversation.activeTurnId)
            throw new AppError(ERROR_CODES.THREAD_BUSY);
        await this.assertCanAfford(userId);
        const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, name: true, language: true } });
        const turnId = randomUUID();
        await this.deps.runner.start({ user, threadId, conversationId: conversation.id, mastraThreadId: conversation.mastraThreadId, turnId, content });
        return { turnId };
    }
    async getDetail(userId, threadId) {
        const thread = await this.deps.threads.getOwned(userId, threadId);
        const conversation = await this.getConversation(threadId);
        const events = await this.deps.events.listAfter(conversation.id, 0, DETAIL_EVENT_LIMIT);
        return {
            thread: toThreadDto(thread),
            events,
            cursor: events.at(-1)?.cursor ?? 0,
            activeTurnId: conversation.activeTurnId,
        };
    }
    /** Signals whichever replica runs the turn; a no-op when nothing is running. */
    async cancel(userId, threadId) {
        await this.deps.threads.getOwned(userId, threadId);
        const conversation = await this.getConversation(threadId);
        if (!conversation.activeTurnId)
            return { cancelled: false };
        await this.deps.hub.requestCancel(conversation.activeTurnId);
        return { cancelled: true };
    }
    async getStreamContext(userId, threadId) {
        await this.deps.threads.getOwned(userId, threadId);
        return this.getConversation(threadId);
    }
    async getConversation(threadId) {
        const conversation = await this.deps.prisma.askAiConversation.findUnique({ where: { agentThreadId: threadId } });
        if (!conversation)
            throw AppError.notFound('Conversation');
        return conversation;
    }
    async assertCanAfford(userId) {
        if (!(await this.deps.credits.hasAtLeast(userId, this.deps.config.minBalance))) {
            throw new AppError(ERROR_CODES.INSUFFICIENT_CREDITS, { details: { required: String(this.deps.config.minBalance) } });
        }
    }
}
//# sourceMappingURL=conversation.service.js.map