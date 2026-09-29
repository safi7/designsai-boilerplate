import { Agent } from '@mastra/core/agent';
import { describe, expect, it } from 'vitest';
import { createAgentsConfig } from '../lib/config.js';
import { safeTokenEqual } from '../lib/internal-auth.js';
import { buildAskAiInstructions } from './agents/ask-ai-agent.js';
import { cleanThreadTitle } from './agents/thread-title-agent.js';
import { createMockModel } from './models.js';
import { buildTurnSystemContext } from './routes/ask-ai-turn.js';
import { readUsage, requireInternalToken, textDelta } from './routes/shared.js';
import { buildTitlePrompt } from './routes/thread-title.js';
import { currentTimeTool } from './tools/current-time.tool.js';

describe('config', () => {
  it('requires an OpenRouter key unless the mock provider is selected', () => {
    const base = { API_TO_AGENTS_INTERNAL_TOKEN: 'x'.repeat(32), AGENTS_STORAGE_DATABASE_URL: 'postgresql://x' };
    expect(() => createAgentsConfig({ ...base, AGENTS_MODEL_PROVIDER: 'openrouter' })).toThrow(/OPENROUTER_API_KEY/);
    expect(createAgentsConfig({ ...base, AGENTS_MODEL_PROVIDER: 'mock' }).models.provider).toBe('mock');
  });
});

describe('internal auth', () => {
  it('compares tokens exactly', () => {
    expect(safeTokenEqual('abc', 'abc')).toBe(true);
    expect(safeTokenEqual('abc', 'abcd')).toBe(false);
  });

  it('guards built-in Mastra routes outside development', async () => {
    const token = 'x'.repeat(32);
    const guard = requireInternalToken({ env: 'production', internalToken: token });
    const call = async (path: string, header?: string) => {
      let passed = false;
      const c = {
        req: { path, header: (name: string) => (name === 'x-internal-service-token' ? header : undefined) },
        json: (_body: unknown, status: number) => ({ status }),
      };
      const result = await guard(c, async () => {
        passed = true;
      });
      return passed ? 'next' : (result as unknown as { status: number }).status;
    };
    expect(await call('/api/agents')).toBe(401);
    expect(await call('/api/memory/threads', 'wrong')).toBe(401);
    expect(await call('/api/agents', token)).toBe('next');
    expect(await call('/health/live')).toBe('next');
    const devGuard = requireInternalToken({ env: 'development', internalToken: token });
    let devPassed = false;
    await devGuard({ req: { path: '/api/agents', header: () => undefined } }, async () => {
      devPassed = true;
    });
    expect(devPassed).toBe(true);
  });
});

describe('cleanThreadTitle', () => {
  it('strips labels, quotes, markdown and trailing punctuation', () => {
    expect(cleanThreadTitle('Title: "**Lisbon weekend itinerary**."')).toBe('Lisbon weekend itinerary');
  });

  it('never cuts a word in half', () => {
    const title = cleanThreadTitle('A very long conversation title about distributed systems consensus algorithms in practice');
    expect(title.length).toBeLessThanOrEqual(60);
    expect(title.endsWith(' ')).toBe(false);
    expect('A very long conversation title about distributed systems consensus algorithms in practice'.startsWith(title)).toBe(true);
  });
});

describe('stream helpers', () => {
  it('reads usage in every provider shape', () => {
    expect(readUsage({ inputTokens: 10, outputTokens: 5 })).toEqual({ inputTokens: 10, outputTokens: 5 });
    expect(readUsage({ promptTokens: 3, completionTokens: 4 })).toEqual({ inputTokens: 3, outputTokens: 4 });
    expect(readUsage({ inputTokens: { total: 7 }, outputTokens: { total: 8 } })).toEqual({ inputTokens: 7, outputTokens: 8 });
    expect(readUsage(undefined)).toEqual({ inputTokens: 0, outputTokens: 0 });
  });

  it('extracts text deltas from Mastra chunks', () => {
    expect(textDelta({ type: 'text-delta', payload: { text: 'hi' } })).toBe('hi');
    expect(textDelta({ type: 'tool-call', payload: {} })).toBeNull();
  });

  it('builds per-turn context and title prompts', () => {
    expect(buildTurnSystemContext({ userName: 'Jane', locale: 'es' })).toContain('Jane');
    expect(buildTitlePrompt({ userId: '1', messages: ['plan a trip'], locale: 'en' })).toContain('1. plan a trip');
  });
});

describe('prompts and tools', () => {
  it('names the product in the instructions', () => {
    expect(buildAskAiInstructions('Acme')).toContain('inside Acme');
  });

  it('current_time falls back to UTC for invalid zones', async () => {
    const result = await currentTimeTool.execute!({ timeZone: 'Not/AZone' }, {} as never);
    expect(result).toMatchObject({ timeZone: 'UTC' });
  });
});

describe('mock model through a real Mastra agent', () => {
  it('streams text and reports usage', async () => {
    const agent = new Agent({ id: 'test', name: 'Test', instructions: 'Be brief.', model: createMockModel('chat') });
    const result = await agent.stream('hello there');
    let streamed = '';
    for await (const chunk of result.fullStream as AsyncIterable<{ type: string; [key: string]: unknown }>) {
      streamed += textDelta(chunk) ?? '';
    }
    expect(streamed).toContain('hello there');
    expect(await result.text).toBe(streamed);
    expect(readUsage(await result.totalUsage).outputTokens).toBeGreaterThan(0);
  });
});
