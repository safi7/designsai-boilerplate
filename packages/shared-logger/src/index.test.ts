import { describe, expect, it } from 'vitest';
import { createLogger, safeStringify } from './index.js';

describe('safeStringify', () => {
  it('serialises BigInt values as strings', () => {
    expect(safeStringify({ id: 10n })).toBe('{"id":"10"}');
  });

  it('replaces circular references instead of throwing', () => {
    const node: Record<string, unknown> = { name: 'a' };
    node.self = node;
    expect(safeStringify(node)).toContain('[Circular Reference]');
  });

  it('keeps error name, message and stack', () => {
    const parsed = JSON.parse(safeStringify({ err: new Error('boom') }));
    expect(parsed.err.message).toBe('boom');
    expect(parsed.err.name).toBe('Error');
  });
});

describe('createLogger', () => {
  it('only logs errors in the test environment', () => {
    const logger = createLogger({ service: 'test', environment: 'test' });
    expect(logger.level).toBe('error');
  });

  it('defaults to debug in development', () => {
    const logger = createLogger({ service: 'dev', environment: 'development', enableConsole: false });
    expect(logger.level).toBe('debug');
  });
});
