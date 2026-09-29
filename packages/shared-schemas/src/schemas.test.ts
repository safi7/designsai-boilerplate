import { describe, expect, it } from 'vitest';
import { AskAiTurnFrameSchema, EmailSchema, PasswordSchema, ThreadEventSchema, UpdateProfileRequestSchema } from './index.js';

describe('EmailSchema', () => {
  it('trims and lower-cases', () => {
    expect(EmailSchema.parse('  Jane@Example.COM ')).toBe('jane@example.com');
  });
});

describe('PasswordSchema', () => {
  it.each(['short1', 'lettersonly', '12345678'])('rejects %s', value => {
    expect(PasswordSchema.safeParse(value).success).toBe(false);
  });

  it('accepts a letter + digit password of 8+ chars', () => {
    expect(PasswordSchema.safeParse('correct1horse').success).toBe(true);
  });
});

describe('UpdateProfileRequestSchema', () => {
  it('rejects an empty patch', () => {
    expect(UpdateProfileRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe('ThreadEventSchema', () => {
  it('discriminates on type', () => {
    const parsed = ThreadEventSchema.parse({
      type: 'thread.title',
      cursor: 3,
      createdAt: new Date().toISOString(),
      payload: { title: 'Trip to Lisbon' },
    });
    expect(parsed.type).toBe('thread.title');
  });

  it('rejects unknown event types', () => {
    expect(ThreadEventSchema.safeParse({ type: 'nope', cursor: 1, createdAt: '', payload: {} }).success).toBe(false);
  });
});

describe('AskAiTurnFrameSchema', () => {
  it('parses a finish frame with usage', () => {
    const frame = AskAiTurnFrameSchema.parse({ type: 'finish', text: 'hi', modelId: 'm', usage: { inputTokens: 1, outputTokens: 2 } });
    expect(frame.type).toBe('finish');
  });
});
