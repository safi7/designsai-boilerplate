import { randomUUID } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../types/hono.js';

const VALID_REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

/**
 * Correlates logs, audit rows and client bug reports. An upstream id (load
 * balancer / client) is honoured only if it looks sane, so a caller cannot
 * inject arbitrary strings into our logs.
 */
export function requestId(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const incoming = c.req.header('x-request-id');
    const id = incoming && VALID_REQUEST_ID.test(incoming) ? incoming : randomUUID();
    c.set('requestId', id);
    c.header('x-request-id', id);
    await next();
  };
}
