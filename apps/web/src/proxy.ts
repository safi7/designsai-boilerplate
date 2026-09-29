import { type NextRequest, NextResponse } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

const intl = createIntlMiddleware(routing);
const AUTH_COOKIE = process.env.NEXT_PUBLIC_AUTH_COOKIE_NAME ?? 'auth_token';
const PUBLIC_SEGMENTS = new Set(['auth']);

/**
 * Edge routing (Next 16 `proxy`, formerly middleware):
 * 1. locale negotiation + prefixing via next-intl;
 * 2. optimistic auth redirects based on cookie *presence*.
 *
 * The cookie is httpOnly and signed by the API, so this layer cannot and does
 * not validate it — that is the API's job on every request. This only avoids
 * rendering a protected shell for a visitor who is clearly signed out.
 */
export default function proxy(request: NextRequest) {
  const response = intl(request);
  if (response.headers.get('location')) return response;

  const [, locale, section] = request.nextUrl.pathname.split('/');
  if (!locale || !routing.locales.includes(locale as (typeof routing.locales)[number])) return response;

  const hasSession = request.cookies.has(AUTH_COOKIE);
  const isPublic = section !== undefined && PUBLIC_SEGMENTS.has(section);

  if (!hasSession && !isPublic) {
    const url = new URL(`/${locale}/auth/sign-in`, request.url);
    if (section) url.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  if (hasSession && isPublic) {
    return NextResponse.redirect(new URL(`/${locale}/chat`, request.url));
  }
  return response;
}

export const config = {
  matcher: ['/((?!api|health|_next|_vercel|.*\\..*).*)'],
};
