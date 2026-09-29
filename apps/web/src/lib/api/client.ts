import type { ErrorResponse } from '@boilerplate/shared-schemas';
import { config } from '@/lib/config';

/** Error thrown for any non-2xx response; `code` is the API's stable error code. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get fieldErrors(): Record<string, string[]> {
    return ((this.details?.fieldErrors as Record<string, string[]> | undefined) ?? {}) as Record<string, string[]>;
  }
}

type Unauthorized = () => void;
let onUnauthorized: Unauthorized | undefined;

/** Registered once by the auth layer so a 401 anywhere signs the user out. */
export function setUnauthorizedHandler(handler: Unauthorized): void {
  onUnauthorized = handler;
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  /** Do not trigger the global sign-out on 401 (e.g. the login call itself). */
  skipAuthRedirect?: boolean;
}

export function apiUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(`${config.apiUrl}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
  }
  return url.toString();
}

/**
 * The single fetch wrapper for the API. Session auth is an httpOnly cookie,
 * so every request goes out with `credentials: 'include'` and the token is
 * never visible to JavaScript.
 */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, query, skipAuthRedirect, headers, ...init } = options;
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;

  const response = await fetch(apiUrl(path, query), {
    ...init,
    credentials: 'include',
    headers: {
      accept: 'application/json',
      ...(body !== undefined && !isForm ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
  });

  if (response.status === 204) return undefined as T;
  const payload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    const error = (payload ?? {}) as Partial<ErrorResponse>;
    if (response.status === 401 && !skipAuthRedirect) onUnauthorized?.();
    throw new ApiError(response.status, error.error ?? 'internal_error', error.message ?? response.statusText, error.details);
  }
  return payload as T;
}
