import type { MiddlewareHandler } from 'hono';
import { log } from '../lib/logger.js';
import { anonymizeIp, getClientIp } from '../lib/request.js';
import type { AppEnv } from '../types/hono.js';

const SKIP_PATHS = new Set(['/health', '/health/live', '/health/ready']);
const SLOW_REQUEST_MS = 1000;

/** One structured line per request: method, path, status, latency, user. */
export function requestLogger(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (SKIP_PATHS.has(c.req.path)) return next();
    const start = performance.now();
    await next();
    const durationMs = Math.round(performance.now() - start);
    const status = c.res.status;
    const entry = {
      requestId: c.get('requestId'),
      method: c.req.method,
      path: c.req.path,
      status,
      durationMs,
      userId: c.get('auth')?.userId.toString(),
      ip: anonymizeIp(getClientIp(c)),
    };
    if (status >= 500) log.error('request', entry);
    else if (status >= 400 || durationMs >= SLOW_REQUEST_MS) log.warn('request', entry);
    else log.info('request', entry);
  };
}
