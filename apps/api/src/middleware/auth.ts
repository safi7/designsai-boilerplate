import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie } from 'hono/cookie';
import { AppError, ERROR_CODES } from '@boilerplate/shared-utils';
import { verifyAccessToken } from '../lib/jwt.js';
import type { SessionService } from '../services/session.service.js';
import type { AppEnv, AuthContext } from '../types/hono.js';

interface AuthMiddlewareDeps {
  sessions: SessionService;
  jwtSecret: string;
  cookieName: string;
  cookieDomain?: string;
}

function extractToken(c: Context, cookieName: string): string | undefined {
  const header = c.req.header('authorization');
  if (header?.startsWith('Bearer ')) return header.slice(7).trim() || undefined;
  return getCookie(c, cookieName);
}

/**
 * Resolves the caller's identity if a valid token is present and leaves
 * `auth` undefined otherwise. Routes opt into protection with `requireAuth`,
 * so public endpoints never pay for an accidental 401.
 *
 * Accepts the httpOnly cookie (browser) or a Bearer token (API clients,
 * Swagger UI). A JWT is only honoured while its session row exists, which is
 * what makes logout and "sign out everywhere" effective immediately.
 */
export function authenticate({ sessions, jwtSecret, cookieName, cookieDomain }: AuthMiddlewareDeps): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    c.set('auth', undefined);
    const token = extractToken(c, cookieName);
    let valid = false;
    if (token) {
      const result = verifyAccessToken(token, jwtSecret);
      if (result.ok) {
        const userId = BigInt(result.claims.sub);
        if (await sessions.validate(result.claims.jti, userId)) {
          c.set('auth', { userId, sessionId: result.claims.jti, email: result.claims.email });
          sessions.touch(result.claims.jti);
          valid = true;
        }
      }
    }
    await next();
    // A dead cookie (expired, revoked, forged) is cleared so the browser and
    // the web edge stop treating the visitor as signed in.
    if (token && !valid && getCookie(c, cookieName)) {
      deleteCookie(c, cookieName, { path: '/', domain: cookieDomain });
    }
  };
}

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get('auth')) throw new AppError(ERROR_CODES.NOT_AUTHENTICATED);
  await next();
};

/** Handler helper for routes mounted behind `requireAuth`. */
export function getAuth(c: Context<AppEnv>): AuthContext {
  const auth = c.get('auth');
  if (!auth) throw new AppError(ERROR_CODES.NOT_AUTHENTICATED);
  return auth;
}
