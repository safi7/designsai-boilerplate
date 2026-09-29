import { routing } from '@/i18n/routing';

/** Only same-app paths are honoured, so `?next=` cannot become an open redirect. */
export function safeNextPath(next: string | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return '/chat';
  const withoutLocale = next.replace(new RegExp(`^/(${routing.locales.join('|')})(?=/|$)`), '');
  return withoutLocale || '/chat';
}
