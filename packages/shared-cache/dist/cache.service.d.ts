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
export declare class CacheService {
    private readonly redis;
    private readonly options;
    private readonly prefix;
    private readonly defaultTtl;
    constructor(redis: RedisClient, options?: CacheServiceOptions);
    private key;
    get<T>(key: string): Promise<T | null>;
    set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
    delete(key: string): Promise<void>;
    /** Read-through: return the cached value or compute, store and return it. */
    getOrSet<T>(key: string, loader: () => Promise<T>, ttlSeconds?: number): Promise<T>;
}
//# sourceMappingURL=cache.service.d.ts.map