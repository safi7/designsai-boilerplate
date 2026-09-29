import { describe, expect, it } from 'vitest';
import { computeTurnCredits, estimateTokens } from './pricing.js';

const pricing = { minBalance: 1, creditsPer1kInputTokens: 0.05, creditsPer1kOutputTokens: 0.2, minTurnCredits: 0.1, turnTimeoutMs: 60_000 };

describe('computeTurnCredits', () => {
  it('charges per 1k tokens', () => {
    expect(computeTurnCredits({ inputTokens: 10_000, outputTokens: 5_000 }, pricing).toString()).toBe('1.5');
  });

  it('applies the per-turn floor', () => {
    expect(computeTurnCredits({ inputTokens: 10, outputTokens: 10 }, pricing).toString()).toBe('0.1');
  });

  it('rounds up at the ledger scale', () => {
    expect(computeTurnCredits({ inputTokens: 1, outputTokens: 2_999 }, { ...pricing, minTurnCredits: 0 }).toString()).toBe('0.59985');
  });
});

describe('estimateTokens', () => {
  it('uses ~4 characters per token', () => {
    expect(estimateTokens('abcdefgh')).toBe(2);
    expect(estimateTokens('abc')).toBe(1);
  });
});
