/**
 * POST /internal/agents/thread-title/generate
 *
 * Synchronous title generation. The API owns the thread record and decides
 * when to ask; this route only runs the (small, cheap) title model.
 */
import { registerApiRoute } from '@mastra/core/server';
import { z } from 'zod';
import { ThreadTitleRequestSchema, type ThreadTitleRequest } from '@boilerplate/shared-schemas';
import { cleanThreadTitle, THREAD_TITLE_AGENT_ID } from '../agents/thread-title-agent.js';
import { getMastra, readBody, rejectIfNotInternal } from './shared.js';

const TitleOutputSchema = z.object({ title: z.string().min(1) });

export function buildTitlePrompt(body: ThreadTitleRequest): string {
  return [
    'Write a title for a conversation that starts with these user messages:',
    ...body.messages.map((m, i) => `${i + 1}. ${m.slice(0, 1000)}`),
    body.locale ? `Interface language hint: ${body.locale}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export const threadTitleRoute = registerApiRoute('/internal/agents/thread-title/generate', {
  method: 'POST',
  requiresAuth: false,
  handler: async c => {
    const unauthorized = rejectIfNotInternal(c, 'Thread title');
    if (unauthorized) return unauthorized;
    const parsed = await readBody(c, ThreadTitleRequestSchema);
    if (!parsed.ok) return parsed.response;

    const mastra = getMastra(c);
    try {
      const result = await mastra.getAgent(THREAD_TITLE_AGENT_ID).generate(buildTitlePrompt(parsed.data), {
        structuredOutput: { schema: TitleOutputSchema },
      });
      const fromObject = TitleOutputSchema.safeParse(result.object);
      const title = cleanThreadTitle(fromObject.success ? fromObject.data.title : (result.text ?? ''));
      if (!title) return c.json({ error: 'empty_title' }, 422);
      return c.json({ title }, 200);
    } catch (error) {
      mastra.getLogger().error('Thread title generation failed', { error: error instanceof Error ? error.message : String(error) });
      return c.json({ error: 'title_generation_failed' }, 502);
    }
  },
});
