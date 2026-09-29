import type { RedisClient } from '@boilerplate/shared-cache';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export interface RateLimitRule {
  /** Redis key, e.g. `rate:login:ip:1.2.3.4`. */
  key: string;
  limit: number;
  windowSeconds: number;
}

/**
 * Sliding-window limiter on a Redis sorted set, evaluated atomically in Lua.
 *
 * Each request is a member scored by arrival time. Because the window follows
 * real arrival times instead of a fixed clock boundary, a client cannot burst
 * 2× the limit across a window reset.
 */
const SLIDING_WINDOW_SCRIPT = `
local key          = KEYS[1]
local now          = tonumber(ARGV[1])
local window_start = tonumber(ARGV[2])
local limit        = tonumber(ARGV[3])
local window_secs  = tonumber(ARGV[4])
local member       = ARGV[5]

redis.call('ZREMRANGEBYSCORE', key, '-inf', window_start)
local count = redis.call('ZCARD', key)

if count >= limit then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local retry_after = window_secs
  if #oldest > 0 then
    retry_after = math.ceil((tonumber(oldest[2]) + window_secs * 1000 - now) / 1000)
    if retry_after < 1 then retry_after = 1 end
  end
  return {0, 0, retry_after}
end

redis.call('ZADD', key, now, member)
redis.call('EXPIRE', key, window_secs)
return {1, limit - count - 1, 0}
`;

export async function checkRateLimit(redis: RedisClient, rule: RateLimitRule): Promise<RateLimitResult> {
  const now = Date.now();
  const member = `${now}:${Math.random().toString(36).slice(2)}`;
  const [allowed, remaining, retryAfter] = (await redis.eval(
    SLIDING_WINDOW_SCRIPT,
    1,
    rule.key,
    String(now),
    String(now - rule.windowSeconds * 1000),
    String(rule.limit),
    String(rule.windowSeconds),
    member
  )) as [number, number, number];
  return { allowed: allowed === 1, remaining, retryAfterSeconds: retryAfter };
}

/** Central catalogue of limits, so they are reviewed in one place. */
export const RATE_LIMITS = {
  loginPerIp: (ip: string): RateLimitRule => ({ key: `rate:login:ip:${ip}`, limit: 20, windowSeconds: 15 * 60 }),
  loginPerEmail: (email: string): RateLimitRule => ({ key: `rate:login:email:${email}`, limit: 10, windowSeconds: 15 * 60 }),
  registerPerIp: (ip: string): RateLimitRule => ({ key: `rate:register:ip:${ip}`, limit: 10, windowSeconds: 60 * 60 }),
  otpSendPerIp: (ip: string): RateLimitRule => ({ key: `rate:otp-send:ip:${ip}`, limit: 20, windowSeconds: 60 * 60 }),
  otpVerifyPerIp: (ip: string): RateLimitRule => ({ key: `rate:otp-verify:ip:${ip}`, limit: 30, windowSeconds: 10 * 60 }),
  askAiPerUser: (userId: string): RateLimitRule => ({ key: `rate:ask-ai:user:${userId}`, limit: 30, windowSeconds: 60 }),
  uploadPerUser: (userId: string): RateLimitRule => ({ key: `rate:upload:user:${userId}`, limit: 10, windowSeconds: 60 }),
} as const;
