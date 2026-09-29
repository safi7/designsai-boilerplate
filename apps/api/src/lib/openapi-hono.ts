import { OpenAPIHono, type Hook } from '@hono/zod-openapi';
import { ERROR_CODES } from '@boilerplate/shared-utils';
import type { AppEnv } from '../types/hono.js';
import { log } from './logger.js';

/**
 * Converts Zod validation failures into the standard error envelope instead of
 * leaking the raw ZodError. Field-level issues are returned under `details` so
 * forms can highlight the offending input.
 */
const validationHook: Hook<unknown, AppEnv, string, unknown> = (result, c) => {
  if (result.success) return undefined;
  const fieldErrors = result.error.flatten().fieldErrors;
  log.debug('Request validation failed', { path: c.req.path, method: c.req.method, fieldErrors });
  return c.json({ success: false as const, error: ERROR_CODES.VALIDATION_ERROR, message: 'The request is invalid.', details: { fieldErrors } }, 400);
};

/** Use instead of `new OpenAPIHono()` so every router shares the same validation behaviour. */
export function createRouter() {
  return new OpenAPIHono<AppEnv>({ defaultHook: validationHook });
}
