import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetch, setUnauthorizedHandler } from './client';

afterEach(() => vi.unstubAllGlobals());

describe('apiFetch', () => {
  it('sends cookies and JSON, and returns the parsed body', async () => {
    const fetchMock = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(apiFetch('/v1/x', { method: 'POST', body: { a: 1 } })).resolves.toEqual({ ok: true });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.credentials).toBe('include');
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json');
    expect(init.body).toBe('{"a":1}');
  });

  it('throws ApiError with the API error code and field errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          { success: false, error: 'validation_error', message: 'bad', details: { fieldErrors: { email: ['Invalid'] } } },
          { status: 400 }
        )
      )
    );
    const error = (await apiFetch('/v1/x').catch(e => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe('validation_error');
    expect(error.fieldErrors).toEqual({ email: ['Invalid'] });
  });

  it('triggers the global sign-out on 401 unless opted out', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ success: false, error: 'not_authenticated' }, { status: 401 }))
    );
    await apiFetch('/v1/x').catch(() => undefined);
    await apiFetch('/v1/x', { skipAuthRedirect: true }).catch(() => undefined);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
