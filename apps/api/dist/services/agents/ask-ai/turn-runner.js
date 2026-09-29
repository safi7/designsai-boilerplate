import { AppError, ERROR_CODES } from '@boilerplate/shared-utils';
import { DEFAULT_THREAD_TITLE } from '../thread-directory.js';
import { computeTurnCredits, estimateTokens } from './pricing.js';
const ASK_AI_AGENT_ID = 'askAiAgent';
const SNAPSHOT_INTERVAL_MS = 250;
const TITLE_FALLBACK_LENGTH = 60;
/**
 * Runs Ask AI turns: API → agents (NDJSON) → Redis fan-out → SSE.
 *
 * Lifecycle of a turn:
 *   1. claim     — a conditional UPDATE sets `activeTurnId`; a second
 *                  concurrent turn on the same thread loses and gets 409.
 *   2. record    — `message.user` + `turn.started` are committed before any
 *                  model work, so the UI never shows a message we lost.
 *   3. stream    — deltas are published live (never persisted); a throttled
 *                  snapshot lets late subscribers catch up mid-answer.
 *   4. settle    — charge credits (idempotent per turn), persist the
 *                  assistant message, release the claim.
 * Failure, cancellation, timeout and shutdown all settle through the same
 * `finally`, so a thread can never be left locked by this process.
 * A crash is covered by `sweepStaleTurns`.
 */
export class TurnRunner {
    deps;
    running = new Map();
    constructor(deps) {
        this.deps = deps;
    }
    get activeTurnCount() {
        return this.running.size;
    }
    async start(input) {
        const { prisma, threads } = this.deps;
        const claimed = await prisma.askAiConversation.updateMany({
            where: { id: input.conversationId, activeTurnId: null },
            data: { activeTurnId: input.turnId },
        });
        if (claimed.count === 0)
            throw new AppError(ERROR_CODES.THREAD_BUSY);
        try {
            await this.emit(input, 'message.user', { messageId: `${input.turnId}:user`, turnId: input.turnId, content: input.content }, 'user');
            await this.emit(input, 'turn.started', { turnId: input.turnId }, 'started');
            await threads.setStatus(input.threadId, 'running', true);
        }
        catch (error) {
            await this.release(input);
            throw error;
        }
        void this.execute(input).catch(error => {
            this.deps.logger.error('Turn execution crashed', { turnId: input.turnId, error: error instanceof Error ? error.message : String(error) });
        });
    }
    /** Abort in-flight turns on shutdown; each settles as `turn.failed`. */
    async shutdown(timeoutMs = 10_000) {
        for (const controller of this.running.values())
            controller.abort('shutdown');
        const deadline = Date.now() + timeoutMs;
        while (this.running.size > 0 && Date.now() < deadline)
            await new Promise(r => setTimeout(r, 100));
    }
    async execute(input) {
        const { agents, hub, logger, config } = this.deps;
        const controller = new AbortController();
        this.running.set(input.turnId, controller);
        const timeout = setTimeout(() => controller.abort('timeout'), config.turnTimeoutMs);
        const stopCancelListener = await hub.onCancel(input.turnId, () => controller.abort('cancelled'));
        let text = '';
        let seq = 0;
        let lastSnapshotAt = 0;
        let finish;
        let outcome = 'failed';
        try {
            const stream = agents.streamTurn({
                userId: input.user.id.toString(),
                threadId: input.threadId,
                mastraThreadId: input.mastraThreadId,
                turnId: input.turnId,
                message: input.content,
                locale: input.user.language,
                userName: input.user.name,
            }, controller.signal);
            for await (const frame of stream) {
                if (frame.type === 'text-delta') {
                    text += frame.delta;
                    seq += 1;
                    void hub.publish(input.threadId, { kind: 'frame', frame: { type: 'message.delta', turnId: input.turnId, seq, delta: frame.delta } }).catch(() => undefined);
                    if (Date.now() - lastSnapshotAt >= SNAPSHOT_INTERVAL_MS) {
                        lastSnapshotAt = Date.now();
                        void hub.writeSnapshot(input.turnId, { seq, content: text }).catch(() => undefined);
                    }
                }
                else if (frame.type === 'finish') {
                    finish = frame;
                }
                else {
                    throw new AppError(ERROR_CODES.AGENT_ERROR, { message: frame.message, context: { agentCode: frame.code } });
                }
            }
            if (!finish)
                throw new AppError(ERROR_CODES.AGENT_ERROR, { message: 'The assistant stopped before finishing its answer.' });
            const content = finish.text || text;
            const creditsCharged = await this.charge(input, finish.usage, finish.modelId);
            await this.emit(input, 'message.assistant', {
                messageId: `${input.turnId}:assistant`,
                turnId: input.turnId,
                content,
                usage: { inputTokens: finish.usage.inputTokens, outputTokens: finish.usage.outputTokens, creditsCharged },
            }, 'assistant');
            outcome = 'completed';
        }
        catch (error) {
            const reason = controller.signal.aborted ? controller.signal.reason : undefined;
            if (reason === 'cancelled') {
                // Tokens already generated were paid for upstream; bill an estimate.
                if (text)
                    await this.charge(input, { inputTokens: estimateTokens(input.content), outputTokens: estimateTokens(text) }, 'estimate').catch(() => undefined);
                await this.emit(input, 'turn.cancelled', { turnId: input.turnId, partialContent: text }, 'cancelled').catch(() => undefined);
                outcome = 'completed';
            }
            else {
                const code = reason === 'timeout' ? 'turn_timeout' : reason === 'shutdown' ? 'turn_interrupted' : error instanceof AppError ? error.code : ERROR_CODES.AGENT_ERROR;
                const message = reason === 'timeout'
                    ? 'The assistant took too long to respond.'
                    : reason === 'shutdown'
                        ? 'The response was interrupted. Please try again.'
                        : error instanceof AppError
                            ? error.message
                            : 'The assistant failed to respond.';
                logger.warn('Turn failed', { turnId: input.turnId, code, error: error instanceof Error ? error.message : String(error) });
                await this.emit(input, 'turn.failed', { turnId: input.turnId, code, message }, 'failed').catch(() => undefined);
            }
        }
        finally {
            clearTimeout(timeout);
            this.running.delete(input.turnId);
            await stopCancelListener().catch(() => undefined);
            await hub.clearSnapshot(input.turnId).catch(() => undefined);
            await this.release(input);
            await this.deps.threads.setStatus(input.threadId, outcome === 'completed' ? 'idle' : 'failed', true).catch(() => undefined);
        }
        if (outcome === 'completed')
            await this.maybeGenerateTitle(input);
    }
    /** Idempotent per turn: the ledger key makes a retried settle a no-op. */
    async charge(input, usage, modelId) {
        const { credits, prisma, config } = this.deps;
        const amount = computeTurnCredits(usage, config);
        const result = await credits.debit({
            userId: input.user.id,
            amount,
            idempotencyKey: `ask-ai:turn:${input.turnId}`,
            feature: 'ask_ai',
            description: 'Ask AI message',
            referenceType: 'agent_thread',
            referenceId: input.threadId,
            usage: { provider: 'openrouter', model: modelId, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, threadId: input.threadId },
            allowPartial: true,
        });
        await prisma.agentTokenUsage
            .upsert({
            where: { turnId: input.turnId },
            update: {},
            create: {
                userId: input.user.id,
                agentId: ASK_AI_AGENT_ID,
                threadId: input.threadId,
                turnId: input.turnId,
                modelId,
                inputTokens: usage.inputTokens,
                outputTokens: usage.outputTokens,
                totalTokens: usage.inputTokens + usage.outputTokens,
                creditsCharged: result.amount,
            },
        })
            .catch(error => this.deps.logger.warn('Token usage record failed', { error: error instanceof Error ? error.message : String(error) }));
        return result.amount.toString();
    }
    async maybeGenerateTitle(input) {
        const { prisma, agents, events, logger } = this.deps;
        const thread = await prisma.agentThread.findUnique({ where: { id: input.threadId }, select: { title: true } });
        if (!thread || thread.title !== DEFAULT_THREAD_TITLE)
            return;
        let title;
        try {
            const messages = await events.recentUserMessages(input.conversationId, 3);
            title = await agents.generateTitle({ userId: input.user.id.toString(), messages, locale: input.user.language });
        }
        catch (error) {
            logger.warn('Title generation failed, using fallback', { error: error instanceof Error ? error.message : String(error) });
            title = input.content.replace(/\s+/g, ' ').trim().slice(0, TITLE_FALLBACK_LENGTH);
        }
        // Conditional: never overwrite a title the user renamed in the meantime.
        const { count } = await prisma.agentThread.updateMany({ where: { id: input.threadId, title: DEFAULT_THREAD_TITLE }, data: { title } });
        if (count > 0)
            await this.emit(input, 'thread.title', { title }, 'title').catch(() => undefined);
    }
    async emit(input, type, payload, suffix) {
        const event = await this.deps.events.append(input.conversationId, type, payload, `turn:${input.turnId}:${suffix}`);
        await this.deps.hub.publish(input.threadId, { kind: 'event', event }).catch(error => {
            // Durable already; a reconnecting client will read it from the log.
            this.deps.logger.warn('Live publish failed', { type, error: error instanceof Error ? error.message : String(error) });
        });
        return event;
    }
    async release(input) {
        await this.deps.prisma.askAiConversation.updateMany({
            where: { id: input.conversationId, activeTurnId: input.turnId },
            data: { activeTurnId: null },
        });
    }
}
/**
 * Recover turns orphaned by a crashed process: any conversation still claimed
 * well past the turn timeout is failed and unlocked. Safe to run on every
 * replica — the conditional update means only one of them wins per turn.
 */
export async function sweepStaleTurns(deps) {
    const cutoff = new Date(Date.now() - deps.config.turnTimeoutMs - 60_000);
    const stale = await deps.prisma.askAiConversation.findMany({
        where: { activeTurnId: { not: null }, updatedAt: { lt: cutoff } },
        select: { id: true, agentThreadId: true, activeTurnId: true },
        take: 100,
    });
    let recovered = 0;
    for (const conversation of stale) {
        const turnId = conversation.activeTurnId;
        const { count } = await deps.prisma.askAiConversation.updateMany({ where: { id: conversation.id, activeTurnId: turnId }, data: { activeTurnId: null } });
        if (count === 0)
            continue;
        recovered += 1;
        const event = await deps.events.append(conversation.id, 'turn.failed', { turnId, code: 'turn_interrupted', message: 'The response was interrupted. Please try again.' }, `turn:${turnId}:failed`);
        await deps.prisma.agentThread.update({ where: { id: conversation.agentThreadId }, data: { status: 'failed' } });
        await deps.hub.publish(conversation.agentThreadId, { kind: 'event', event }).catch(() => undefined);
    }
    if (recovered > 0)
        deps.logger.warn('Recovered stale Ask AI turns', { recovered });
    return recovered;
}
//# sourceMappingURL=turn-runner.js.map