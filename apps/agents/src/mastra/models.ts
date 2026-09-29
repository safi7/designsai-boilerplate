import type { LanguageModelV3, LanguageModelV3StreamPart } from '@ai-sdk/provider';
import { MockLanguageModelV3, simulateReadableStream } from 'ai/test';
import type { AgentsConfig } from '../lib/config.js';

/**
 * Model selection lives in one place. `openrouter/<vendor>/<model>` strings
 * are resolved by Mastra's model router (reads OPENROUTER_API_KEY), so moving
 * to another model or provider is a config change, not a code change.
 */
export type ModelInput = string | LanguageModelV3;

export function resolveModel(config: AgentsConfig, role: 'chat' | 'title'): ModelInput {
  if (config.models.provider === 'mock') return createMockModel(role);
  return role === 'chat' ? config.models.chat : config.models.title;
}

function lastUserText(prompt: unknown): string {
  const messages = Array.isArray(prompt) ? (prompt as { role: string; content: unknown }[]) : [];
  const user = [...messages].reverse().find(m => m.role === 'user');
  if (!user) return '';
  if (typeof user.content === 'string') return user.content;
  return (user.content as { type: string; text?: string }[])
    .filter(p => p.type === 'text')
    .map(p => p.text ?? '')
    .join(' ');
}

/** Deterministic offline model: streams word by word and reports token usage like a real provider. */
export function createMockModel(role: 'chat' | 'title'): LanguageModelV3 {
  const usage = (input: number, output: number) => ({
    inputTokens: { total: input, noCache: input, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: output, text: output, reasoning: 0 },
  });
  const reply = (prompt: unknown) => {
    const question = lastUserText(prompt).trim();
    if (role === 'title') {
      // The title prompt lists user messages as "1. …"; title the first one.
      const first = question.match(/^1\.\s*(.+)$/m)?.[1] ?? question;
      return JSON.stringify({ title: first.split(/\s+/).slice(0, 6).join(' ') || 'New conversation' });
    }
    return `You said: "${question.slice(0, 200)}". This is the offline mock model — set AGENTS_MODEL_PROVIDER=openrouter and OPENROUTER_API_KEY for real answers.`;
  };

  return new MockLanguageModelV3({
    provider: 'mock',
    modelId: `mock-${role}`,
    doGenerate: async ({ prompt }) => {
      const text = reply(prompt);
      return {
        content: [{ type: 'text', text }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage: usage(Math.ceil(JSON.stringify(prompt).length / 4), Math.ceil(text.length / 4)),
        warnings: [],
      };
    },
    doStream: async ({ prompt }) => {
      const text = reply(prompt);
      const words = text.split(/(?<=\s)/);
      const chunks: LanguageModelV3StreamPart[] = [
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: 't1' },
        ...words.map(delta => ({ type: 'text-delta' as const, id: 't1', delta })),
        { type: 'text-end', id: 't1' },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: 'stop' },
          usage: usage(Math.ceil(JSON.stringify(prompt).length / 4), Math.ceil(text.length / 4)),
        },
      ];
      return { stream: simulateReadableStream({ chunks, chunkDelayInMs: 25 }) };
    },
  });
}
