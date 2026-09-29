import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import type { AgentsConfig } from '../../lib/config.js';
import type { ModelInput } from '../models.js';
import { currentTimeTool } from '../tools/current-time.tool.js';

export const ASK_AI_AGENT_ID = 'askAiAgent';

/**
 * Structured, resource-scoped working memory: facts the user shares about
 * themselves persist across all of their conversations, while message history
 * stays per thread.
 */
const WORKING_MEMORY_TEMPLATE = `# User profile
- Name:
- Preferred language:
- Role / occupation:
- Interests and ongoing projects:
- Communication preferences (tone, length, format):
`;

export function buildAskAiInstructions(appName: string): string {
  return `
You are Ask AI, the assistant inside ${appName}.

Goals:
- Give accurate, direct and useful answers. Lead with the answer, then the detail.
- Ask one short clarifying question only when the request is genuinely ambiguous.
- Say so plainly when you do not know something; never invent facts, links or citations.

Style:
- Reply in the user's language.
- Use Markdown: short paragraphs, lists for steps, fenced code blocks with a language tag for code.
- Keep answers proportional to the question.

Tools and memory:
- Use the current_time tool whenever the answer depends on today's date or the time.
- Update working memory when the user shares durable facts about themselves or their preferences; never store secrets such as passwords or keys.
`.trim();
}

export function createAskAiAgent(config: AgentsConfig, model: ModelInput): Agent {
  return new Agent({
    id: ASK_AI_AGENT_ID,
    name: 'Ask AI',
    description: 'General-purpose conversational assistant with per-user memory.',
    instructions: buildAskAiInstructions(config.appName),
    model,
    tools: { current_time: currentTimeTool },
    memory: new Memory({
      options: {
        lastMessages: config.askAi.lastMessages,
        workingMemory: { enabled: true, scope: 'resource', template: WORKING_MEMORY_TEMPLATE },
        generateTitle: false,
      },
    }),
  });
}
