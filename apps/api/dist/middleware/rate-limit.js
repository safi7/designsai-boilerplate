import { AppError } from '@boilerplate/shared-utils';
import { log } from '../lib/logger.js';
import { checkRateLimit } from '../lib/rate-limiter.js';
/**
 * Enforce one or more limits; throws 429 with Retry-After on the first breach.
 * Fails open if Redis is unavailable — an outage of the limiter must not take
 * sign-in down with it.
 */
export async function enforceRateLimits(redis, c, rules) {
    for (const rule of rules) {
        let result;
        try {
            result = await checkRateLimit(redis, rule);
        }
        catch (error) {
            log.warn('Rate limiter unavailable, allowing request', { key: rule.key, error: error instanceof Error ? error.message : String(error) });
            continue;
        }
        c.header('X-RateLimit-Limit', String(rule.limit));
        c.header('X-RateLimit-Remaining', String(result.remaining));
        if (!result.allowed)
            throw AppError.rateLimited(result.retryAfterSeconds);
    }
}
//# sourceMappingURL=rate-limit.js.map