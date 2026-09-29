import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { container } from './container.js';

// These exercise the real middleware stack. None of the requests reach
// MySQL or Redis, so no infrastructure is needed.
const app = createApp(container);

describe('HTTP app', () => {
  it('serves the liveness probe', async () => {
    const res = await app.request('/health/live');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('sets a request id and security headers', async () => {
    const res = await app.request('/health/live');
    expect(res.headers.get('x-request-id')).toMatch(/[0-9a-f-]{36}/);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('returns the error envelope for unknown routes', async () => {
    const res = await app.request('/v1/nope');
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ success: false, error: 'not_found' });
  });

  it('rejects unauthenticated access to protected routes', async () => {
    const res = await app.request('/v1/credits/balance');
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ success: false, error: 'not_authenticated' });
  });

  it('rejects a forged bearer token', async () => {
    const res = await app.request('/v1/auth/me', { headers: { authorization: 'Bearer not-a-jwt' } });
    expect(res.status).toBe(401);
  });

  it('validates request bodies before any handler runs', async () => {
    const res = await app.request('/v1/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email', password: 'short', name: '' }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; details: { fieldErrors: Record<string, string[]> } };
    expect(body.error).toBe('validation_error');
    expect(Object.keys(body.details.fieldErrors)).toEqual(expect.arrayContaining(['email', 'password', 'name']));
  });

  it('blocks cross-site form posts (CSRF)', async () => {
    const res = await app.request('/v1/auth/logout', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'https://evil.example' },
      body: 'x=1',
    });
    expect(res.status).toBe(403);
  });

  it('publishes an OpenAPI 3.1 document covering every public module', async () => {
    const res = await app.request('/doc/openapi.json');
    const doc = (await res.json()) as { openapi: string; paths: Record<string, unknown> };
    expect(doc.openapi).toBe('3.1.0');
    expect(Object.keys(doc.paths)).toEqual(
      expect.arrayContaining(['/v1/auth/login', '/v1/users/me', '/v1/credits/balance', '/v1/agents/threads', '/v1/agents/ask-ai/threads'])
    );
  });
});
