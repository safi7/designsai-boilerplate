import { ApiError } from '@/lib/api/client';

interface ErrorTranslator {
  (key: string): string;
  has(key: string): boolean;
}

/**
 * Map an API error code to a localized message under the `errors`
 * namespace, falling back to a generic one for codes the UI does not know.
 */
export function errorMessage(error: unknown, t: ErrorTranslator): string {
  const code = error instanceof ApiError ? error.code : 'network_error';
  return t.has(code) ? t(code) : t('internal_error');
}
