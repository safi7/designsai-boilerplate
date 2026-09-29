import { Agent } from '@mastra/core/agent';
import type { ModelInput } from '../models.js';

export const THREAD_TITLE_AGENT_ID = 'threadTitleAgent';

export const THREAD_TITLE_INSTRUCTIONS = `
You write short titles for chat conversations.

Rules:
- 2 to 6 words, under 60 characters.
- Name the concrete subject (product, place, technology, task), not the action ("Help with", "Question about").
- Same language as the user's messages.
- No quotes, emojis, markdown or trailing punctuation.
`.trim();

/** Stateless classifier-style agent: no tools, no memory. */
export function createThreadTitleAgent(model: ModelInput): Agent {
  return new Agent({
    id: THREAD_TITLE_AGENT_ID,
    name: 'Thread Title',
    description: 'Generates concise titles for conversations.',
    instructions: THREAD_TITLE_INSTRUCTIONS,
    model,
  });
}

const MAX_TITLE_CHARS = 60;

/** Normalise model output into a clean, bounded title without cutting words. */
export function cleanThreadTitle(raw: string): string {
  const cleaned = raw
    .replace(/^title:\s*/i, '')
    .replace(/[*_`~#]/g, '')
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .replace(/[.!?。！？]+$/u, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length <= MAX_TITLE_CHARS) return cleaned;
  const clipped = cleaned.slice(0, MAX_TITLE_CHARS);
  const lastSpace = clipped.lastIndexOf(' ');
  return (lastSpace > MAX_TITLE_CHARS * 0.6 ? clipped.slice(0, lastSpace) : clipped).trim();
}
