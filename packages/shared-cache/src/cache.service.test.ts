import { describe, expect, it, vi } from 'vitest';
import { CacheService } from './cache.service.js';
import { isClusterUrl, type RedisClient } from './index.js';

function createFakeRedis() {
  const store = new Map<string, string>();
  return {
    store,
    client: {
      get: vi.fn(async (k: string) => store.get(k) ?? null),
      setex: vi.fn(async (k: string, _ttl: number, v: string) => {
        store.set(k, v);
        return 'OK';
      }),
      del: vi.fn(async (k: string) => (store.delete(k) ? 1 : 0)),
    } as unknown as RedisClient,
  };
}

describe('CacheService', () => {
  it('prefixes keys and round-trips JSON', async () => {
    const { client, store } = createFakeRedis();
    const cache = new CacheService(client, { keyPrefix: 'test:' });
    await cache.set('user:1', { id: 1 });
    expect(store.has('test:user:1')).toBe(true);
    expect(await cache.get('user:1')).toEqual({ id: 1 });
  });

  it('only calls the loader on a miss', async () => {
    const { client } = createFakeRedis();
    const cache = new CacheService(client);
    const loader = vi.fn(async () => 'value');
    expect(await cache.getOrSet('k', loader)).toBe('value');
    expect(await cache.getOrSet('k', loader)).toBe('value');
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('degrades to a miss when Redis fails', async () => {
    const client = { get: vi.fn().mockRejectedValue(new Error('down')) } as unknown as RedisClient;
    const cache = new CacheService(client);
    expect(await cache.get('k')).toBeNull();
  });
});

describe('isClusterUrl', () => {
  it('detects ElastiCache configuration endpoints', () => {
    expect(isClusterUrl('rediss://clustercfg.my-cache.abc.use1.cache.amazonaws.com:6379')).toBe(true);
    expect(isClusterUrl('redis://valkey:6379')).toBe(false);
  });
});
