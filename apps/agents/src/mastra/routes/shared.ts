import type { ZodType } from 'zod';
import type { Mastra } from '@mastra/core/mastra';
import { getConfig, type AgentsConfig } from '../../lib/config.js';
import { redactToken, safeTokenEqual } from '../../lib/internal-auth.js';

/**
 * The slice of Mastra's (Hono) route context these helpers need. Declared
 * structurally so this package does not pin its own copy of `hono`.
 */
export interface RouteContext {
  req: { header(name: string): string | undefined; json(): Promise<unknown>; raw: Request };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json(data: unknown, status?: any): Response;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get(key: 'mastra'): any;
}

export function getMastra(c: RouteContext): Mastra {
  return c.get('mastra') as Mastra;
}

/**
 * Every /internal route is service-to-service only. Returns a 401 Response
 * to short-circuit with, or null when the caller presented the API token.
 */
export function rejectIfNotInternal(c: RouteContext, routeName: string): Response | null {
  const provided = c.req.header('x-internal-service-token') ?? '';
  if (provided && safeTokenEqual(provided, getConfig().internalToken)) return null;
  getMastra(c)
    .getLogger()
    .warn(`${routeName}: rejected invalid internal token`, { tokenPreview: redactToken(provided || undefined) });
  return c.json({ error: 'unauthorized' }, 401);
}

/** Paths reachable without the token: the container liveness probe only. */
const PUBLIC_PATHS = new Set(['/health/live']);

/**
 * Server-wide guard for Mastra's built-in routes (`/api/*`, Studio assets).
 * Left open only under `NODE_ENV=development` so Mastra Studio keeps working
 * during `make dev`; the Docker image runs with `NODE_ENV=production`.
 */
export function requireInternalToken(config: Pick<AgentsConfig, 'env' | 'internalToken'>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return async (c: any, next: () => Promise<void>) => {
    if (config.env === 'development' || PUBLIC_PATHS.has(c.req.path)) return next();
    const provided: string = c.req.header('x-internal-service-token') ?? '';
    if (provided && safeTokenEqual(provided, config.internalToken)) return next();
    return c.json({ error: 'unauthorized' }, 401);
  };
}

export async function readBody<T>(c: RouteContext, schema: ZodType<T>): Promise<{ ok: true; data: T } | { ok: false; response: Response }> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return { ok: false, response: c.json({ error: 'invalid_json' }, 400) };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, response: c.json({ error: 'validation_error', issues: parsed.error.issues }, 400) };
  return { ok: true, data: parsed.data };
}

/** Normalise the usage object across AI SDK versions/providers. */
export function readUsage(usage: unknown): { inputTokens: number; outputTokens: number } {
  const u = (usage ?? {}) as Record<string, unknown>;
  const pick = (...keys: string[]) => {
    for (const key of keys) {
      const value = u[key];
      if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.round(value));
      if (value && typeof value === 'object' && typeof (value as { total?: unknown }).total === 'number') {
        return Math.max(0, Math.round((value as { total: number }).total));
      }
    }
    return 0;
  };
  return { inputTokens: pick('inputTokens', 'promptTokens'), outputTokens: pick('outputTokens', 'completionTokens') };
}

/** Text carried by a Mastra stream chunk, across chunk-shape versions. */
export function textDelta(chunk: { type: string; [key: string]: unknown }): string | null {
  if (chunk.type !== 'text-delta') return null;
  const payload = (chunk.payload ?? chunk) as Record<string, unknown>;
  for (const key of ['text', 'delta', 'textDelta']) {
    if (typeof payload[key] === 'string') return payload[key] as string;
  }
  return null;
}
