/**
 * JSON cache-aside helper.
 *
 * Cache failures are never fatal: a Redis outage degrades to "always miss"
 * and the caller falls through to the source of truth.
 */
export class CacheService {
    redis;
    options;
    prefix;
    defaultTtl;
    constructor(redis, options = {}) {
        this.redis = redis;
        this.options = options;
        this.prefix = options.keyPrefix ?? '';
        this.defaultTtl = options.defaultTtlSeconds ?? 300;
    }
    key(key) {
        return `${this.prefix}${key}`;
    }
    async get(key) {
        try {
            const raw = await this.redis.get(this.key(key));
            return raw ? JSON.parse(raw) : null;
        }
        catch (error) {
            this.options.logger?.warn('Cache read failed', { key, error: error instanceof Error ? error.message : String(error) });
            return null;
        }
    }
    async set(key, value, ttlSeconds = this.defaultTtl) {
        try {
            await this.redis.setex(this.key(key), ttlSeconds, JSON.stringify(value));
        }
        catch (error) {
            this.options.logger?.warn('Cache write failed', { key, error: error instanceof Error ? error.message : String(error) });
        }
    }
    async delete(key) {
        try {
            await this.redis.del(this.key(key));
        }
        catch (error) {
            this.options.logger?.warn('Cache delete failed', { key, error: error instanceof Error ? error.message : String(error) });
        }
    }
    /** Read-through: return the cached value or compute, store and return it. */
    async getOrSet(key, loader, ttlSeconds = this.defaultTtl) {
        const cached = await this.get(key);
        if (cached !== null)
            return cached;
        const fresh = await loader();
        if (fresh !== null && fresh !== undefined)
            await this.set(key, fresh, ttlSeconds);
        return fresh;
    }
}
//# sourceMappingURL=cache.service.js.map