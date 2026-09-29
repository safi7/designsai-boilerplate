/**
 * POST /internal/agents/ask-ai/turn/stream
 *
 * Runs one Ask AI turn and streams it back as NDJSON:
 *   {"type":"text-delta","delta":"…"}   zero or more
 *   {"type":"finish","text":"…","modelId":"…","usage":{…}}   exactly one on success
 *   {"type":"error","code":"…","message":"…"}   exactly one on failure
 *
 * Conversation history lives in Mastra memory, keyed by `mastraThreadId`
 * (thread) and `userId` (resource), so the API only ever sends the new
 * message. Credits and persistence are the API's job; this route only runs
 * the model. If the API disconnects (user pressed Stop), the request signal
 * aborts the model call.
 */
import { registerApiRoute } from '@mastra/core/server';
import { AskAiTurnRequestSchema, type AskAiTurnFrame, type AskAiTurnRequest } from '@boilerplate/shared-schemas';
import { getConfig } from '../../lib/config.js';
import { ASK_AI_AGENT_ID } from '../agents/ask-ai-agent.js';
import { getMastra, readBody, readUsage, rejectIfNotInternal, textDelta } from './shared.js';

export function buildTurnSystemContext(body: Pick<AskAiTurnRequest, 'userName' | 'locale'>): string {
  const lines = [`Current date (UTC): ${new Date().toISOString().slice(0, 10)}`];
  if (body.userName) lines.push(`The user's display name is ${body.userName}.`);
  if (body.locale) lines.push(`The user's interface language is "${body.locale}"; reply in the language the user writes in.`);
  return lines.join('\n');
}

export const askAiTurnStreamRoute = registerApiRoute('/internal/agents/ask-ai/turn/stream', {
  method: 'POST',
  requiresAuth: false,
  handler: async c => {
    const unauthorized = rejectIfNotInternal(c, 'Ask AI turn');
    if (unauthorized) return unauthorized;
    const parsed = await readBody(c, AskAiTurnRequestSchema);
    if (!parsed.ok) return parsed.response;

    const body = parsed.data;
    const mastra = getMastra(c);
    const logger = mastra.getLogger();
    const agent = mastra.getAgent(ASK_AI_AGENT_ID);
    const config = getConfig();
    const signal = c.req.raw.signal;
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (frame: AskAiTurnFrame) => controller.enqueue(encoder.encode(`${JSON.stringify(frame)}\n`));
        const startedAt = Date.now();
        try {
          const result = await agent.stream(body.message, {
            memory: { thread: body.mastraThreadId, resource: body.userId },
            system: buildTurnSystemContext(body),
            maxSteps: config.askAi.maxSteps,
            abortSignal: signal,
          });

          let streamed = '';
          for await (const chunk of result.fullStream as AsyncIterable<{ type: string; [key: string]: unknown }>) {
            const delta = textDelta(chunk);
            if (delta) {
              streamed += delta;
              send({ type: 'text-delta', delta });
            } else if (chunk.type === 'error') {
              const error = (chunk.payload as { error?: unknown } | undefined)?.error;
              throw error instanceof Error ? error : new Error(String(error ?? 'Model stream error'));
            }
          }

          const [text, usage] = await Promise.all([result.text, result.totalUsage]);
          const modelId = config.models.provider === 'mock' ? 'mock-chat' : config.models.chat;
          send({ type: 'finish', text: text || streamed, modelId, usage: readUsage(usage) });
          logger.info('Ask AI turn completed', { turnId: body.turnId, durationMs: Date.now() - startedAt, ...readUsage(usage) });
        } catch (error) {
          if (signal.aborted) {
            logger.info('Ask AI turn aborted by caller', { turnId: body.turnId });
          } else {
            const message = error instanceof Error ? error.message : String(error);
            logger.error('Ask AI turn failed', { turnId: body.turnId, error: message });
            send({ type: 'error', code: 'model_error', message: 'The model failed to produce an answer.' });
          }
        } finally {
          try {
            controller.close();
          } catch {
            // already closed by an aborted client
          }
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' },
    });
  },
});
