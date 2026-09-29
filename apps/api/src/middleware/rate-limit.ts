import type { Context } from 'hono';
import type { RedisClient } from '@boilerplate/shared-cache';
import { AppError } from '@boilerplate/shared-utils';
import { log } from '../lib/logger.js';
import { checkRateLimit, type RateLimitRule } from '../lib/rate-limiter.js';

/**
 * Enforce one or more limits; throws 429 with Retry-After on the first breach.
 * Fails open if Redis is unavailable — an outage of the limiter must not take
 * sign-in down with it.
 */
export async function enforceRateLimits(redis: RedisClient, c: Context, rules: RateLimitRule[]): Promise<void> {
  for (const rule of rules) {
    let result;
    try {
      result = await checkRateLimit(redis, rule);
    } catch (error) {
      log.warn('Rate limiter unavailable, allowing request', { key: rule.key, error: error instanceof Error ? error.message : String(error) });
      continue;
    }
    c.header('X-RateLimit-Limit', String(rule.limit));
    c.header('X-RateLimit-Remaining', String(result.remaining));
    if (!result.allowed) throw AppError.rateLimited(result.retryAfterSeconds);
  }
}
