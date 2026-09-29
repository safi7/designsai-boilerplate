import { vi } from 'vitest';
import type { RedisClient } from '@boilerplate/shared-cache';
import type { Logger } from '@boilerplate/shared-logger';

/** In-memory subset of the Redis API used by the services under test. */
export function createFakeRedis() {
  const values = new Map<string, { value: string; expiresAt: number | null }>();
  const alive = (key: string) => {
    const entry = values.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      values.delete(key);
      return undefined;
    }
    return entry;
  };

  const client = {
    get: vi.fn(async (key: string) => alive(key)?.value ?? null),
    setex: vi.fn(async (key: string, ttl: number, value: string) => {
      values.set(key, { value, expiresAt: Date.now() + ttl * 1000 });
      return 'OK';
    }),
    set: vi.fn(async (key: string, value: string, ...args: (string | number)[]) => {
      if (args.includes('NX') && alive(key)) return null;
      const exIndex = args.indexOf('EX');
      const ttl = exIndex >= 0 ? Number(args[exIndex + 1]) : null;
      values.set(key, { value, expiresAt: ttl ? Date.now() + ttl * 1000 : null });
      return 'OK';
    }),
    del: vi.fn(async (key: string) => (values.delete(key) ? 1 : 0)),
    incr: vi.fn(async (key: string) => {
      const entry = alive(key);
      const next = Number(entry?.value ?? 0) + 1;
      values.set(key, { value: String(next), expiresAt: entry?.expiresAt ?? null });
      return next;
    }),
    expire: vi.fn(async (key: string, ttl: number) => {
      const entry = alive(key);
      if (!entry) return 0;
      entry.expiresAt = Date.now() + ttl * 1000;
      return 1;
    }),
    ttl: vi.fn(async (key: string) => {
      const entry = alive(key);
      if (!entry) return -2;
      return entry.expiresAt === null ? -1 : Math.ceil((entry.expiresAt - Date.now()) / 1000);
    }),
  };
  return { client: client as unknown as RedisClient, values, mock: client };
}

export function createSilentLogger(): Logger {
  const noop = vi.fn();
  return { info: noop, warn: noop, error: noop, debug: noop } as unknown as Logger;
}
