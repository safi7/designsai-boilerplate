import type { RedisClient } from './redis.js';

/**
 * Round-trip health check (SETEX + GET) with a hard timeout.
 *
 * PING alone does not prove the write path works (e.g. a read-only replica
 * after failover), so we write a short-lived, pod-scoped key and read it back.
 */
export async function checkRedisHealth(redis: RedisClient, serviceName: string, timeoutMs = 3000): Promise<void> {
  const key = `healthcheck:${serviceName}:${process.env.HOSTNAME ?? 'local'}`;
  const value = String(Date.now());

  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Redis health check timed out after ${timeoutMs}ms`)), timeoutMs);
  });

  try {
    await Promise.race([
      (async () => {
        await redis.setex(key, 5, value);
        const read = await redis.get(key);
        if (read !== value) throw new Error('Redis health check read back an unexpected value');
      })(),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
  }
}
