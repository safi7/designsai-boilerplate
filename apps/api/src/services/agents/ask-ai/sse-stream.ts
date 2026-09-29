import type { Context } from 'hono';
import { streamSSE, type SSEStreamingApi } from 'hono/streaming';
import type { PrismaClient } from '@boilerplate/shared-prisma';
import type { Logger } from '@boilerplate/shared-logger';
import type { AskAiEventStore } from './event-store.js';
import type { HubMessage, StreamHub } from './stream-hub.js';

const HEARTBEAT_MS = 15_000;
const DRAIN_PAGE_SIZE = 200;

interface StreamDeps {
  prisma: PrismaClient;
  events: AskAiEventStore;
  hub: StreamHub;
  logger: Logger;
}

/**
 * Resumable Server-Sent Events for one thread.
 *
 * Ordering guarantee without gaps or duplicates:
 *   1. SUBSCRIBE first and buffer live messages,
 *   2. drain the durable log after the client's cursor,
 *   3. send the in-flight answer snapshot (if a turn is streaming),
 *   4. flush the buffer, dropping durable events already sent.
 * Durable events carry `id: <cursor>`, so the browser's EventSource resumes
 * from the right place automatically via `Last-Event-ID` after a reconnect.
 */
export function streamThreadEvents(c: Context, deps: StreamDeps, params: { threadId: string; conversationId: string; fromCursor: number }) {
  c.header('X-Accel-Buffering', 'no');

  return streamSSE(
    c,
    async stream => {
      let lastCursor = params.fromCursor;
      let buffering = true;
      const buffered: HubMessage[] = [];
      let chain: Promise<void> = Promise.resolve();

      const deliver = async (message: HubMessage) => {
        if (stream.aborted) return;
        if (message.kind === 'event') {
          if (message.event.cursor <= lastCursor) return;
          lastCursor = message.event.cursor;
          await stream.writeSSE({ event: message.event.type, id: String(message.event.cursor), data: JSON.stringify(message.event) });
        } else {
          await stream.writeSSE({ event: message.frame.type, data: JSON.stringify(message.frame) });
        }
      };
      // Serialise writes so live messages can never interleave out of order.
      const enqueue = (message: HubMessage) => {
        chain = chain
          .then(() => deliver(message))
          .catch(error => {
            deps.logger.debug('SSE write failed', { error: String(error) });
          });
      };

      const unsubscribe = await deps.hub.subscribe(params.threadId, message => {
        if (buffering) buffered.push(message);
        else enqueue(message);
      });

      const heartbeat = setInterval(() => {
        chain = chain.then(() => stream.writeSSE({ event: 'heartbeat', data: '{}' })).catch(() => undefined);
      }, HEARTBEAT_MS);

      try {
        await drain(
          stream,
          deps,
          params.conversationId,
          () => lastCursor,
          cursor => (lastCursor = cursor)
        );

        const conversation = await deps.prisma.askAiConversation.findUnique({ where: { id: params.conversationId }, select: { activeTurnId: true } });
        if (conversation?.activeTurnId) {
          const snapshot = await deps.hub.readSnapshot(conversation.activeTurnId);
          await stream.writeSSE({
            event: 'message.snapshot',
            data: JSON.stringify({
              type: 'message.snapshot',
              turnId: conversation.activeTurnId,
              seq: snapshot?.seq ?? 0,
              content: snapshot?.content ?? '',
            }),
          });
        }

        buffering = false;
        for (const message of buffered.splice(0)) enqueue(message);

        await new Promise<void>(resolve => stream.onAbort(resolve));
      } finally {
        clearInterval(heartbeat);
        await unsubscribe();
      }
    },
    async (error, stream) => {
      deps.logger.warn('SSE stream error', { threadId: params.threadId, error: error.message });
      await stream.writeSSE({ event: 'error', data: JSON.stringify({ error: 'stream_error' }) }).catch(() => undefined);
    }
  );
}

async function drain(
  stream: SSEStreamingApi,
  deps: StreamDeps,
  conversationId: string,
  getCursor: () => number,
  setCursor: (cursor: number) => void
) {
  while (!stream.aborted) {
    const page = await deps.events.listAfter(conversationId, getCursor(), DRAIN_PAGE_SIZE);
    for (const event of page) {
      await stream.writeSSE({ event: event.type, id: String(event.cursor), data: JSON.stringify(event) });
      setCursor(event.cursor);
    }
    if (page.length < DRAIN_PAGE_SIZE) return;
  }
}
