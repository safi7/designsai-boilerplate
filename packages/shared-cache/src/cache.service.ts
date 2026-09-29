import type { Logger } from '@boilerplate/shared-logger';
import type { RedisClient } from './redis.js';

export interface CacheServiceOptions {
  /** Prepended to every key, e.g. `app:` — keeps environments sharing one Redis apart. */
  keyPrefix?: string;
  defaultTtlSeconds?: number;
  logger?: Logger;
}

/**
 * JSON cache-aside helper.
 *
 * Cache failures are never fatal: a Redis outage degrades to "always miss"
 * and the caller falls through to the source of truth.
 */
export class CacheService {
  private readonly prefix: string;
  private readonly defaultTtl: number;

  constructor(
    private readonly redis: RedisClient,
    private readonly options: CacheServiceOptions = {}
  ) {
    this.prefix = options.keyPrefix ?? '';
    this.defaultTtl = options.defaultTtlSeconds ?? 300;
  }

  private key(key: string): string {
    return `${this.prefix}${key}`;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.redis.get(this.key(key));
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (error) {
      this.options.logger?.warn('Cache read failed', { key, error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds = this.defaultTtl): Promise<void> {
    try {
      await this.redis.setex(this.key(key), ttlSeconds, JSON.stringify(value));
    } catch (error) {
      this.options.logger?.warn('Cache write failed', { key, error: error instanceof Error ? error.message : String(error) });
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.redis.del(this.key(key));
    } catch (error) {
      this.options.logger?.warn('Cache delete failed', { key, error: error instanceof Error ? error.message : String(error) });
    }
  }

  /** Read-through: return the cached value or compute, store and return it. */
  async getOrSet<T>(key: string, loader: () => Promise<T>, ttlSeconds = this.defaultTtl): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;
    const fresh = await loader();
    if (fresh !== null && fresh !== undefined) await this.set(key, fresh, ttlSeconds);
    return fresh;
  }
}
