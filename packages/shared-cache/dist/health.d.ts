import type { RedisClient } from './redis.js';
/**
 * Round-trip health check (SETEX + GET) with a hard timeout.
 *
 * PING alone does not prove the write path works (e.g. a read-only replica
 * after failover), so we write a short-lived, pod-scoped key and read it back.
 */
export declare function checkRedisHealth(redis: RedisClient, serviceName: string, timeoutMs?: number): Promise<void>;
//# sourceMappingURL=health.d.ts.map