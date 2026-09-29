import { createRoute, z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import {
  AuthProvidersResponseSchema,
  AuthResponseSchema,
  ChangePasswordRequestSchema,
  GoogleSignInRequestSchema,
  LoginRequestSchema,
  OtpSendRequestSchema,
  OtpSendResponseSchema,
  OtpSignInRequestSchema,
  RegisterRequestSchema,
  RegisterResponseSchema,
  ResetPasswordRequestSchema,
  SessionListResponseSchema,
  SuccessResponseSchema,
  UserResponseSchema,
  VerifyEmailRequestSchema,
} from '@boilerplate/shared-schemas';
import { AppError } from '@boilerplate/shared-utils';
import type { Container } from '../../container.js';
import { createRouter } from '../../lib/openapi-hono.js';
import { RATE_LIMITS } from '../../lib/rate-limiter.js';
import { getClientIp, requestMeta } from '../../lib/request.js';
import { getAuth, requireAuth } from '../../middleware/auth.js';
import { enforceRateLimits } from '../../middleware/rate-limit.js';
import type { IssuedSession } from '../../services/auth.service.js';
import type { AppEnv } from '../../types/hono.js';
import { cookieAuth, errorResponses, jsonBody, jsonContent } from '../openapi-helpers.js';

const tags = ['Auth'];

export function createAuthRoutes(container: Container) {
  const { auth, users, sessions, google, redis, config } = container;
  const router = createRouter();

  /** httpOnly + SameSite=Lax: unreadable by scripts, not sent on cross-site POSTs. */
  const setSessionCookie = (c: Context<AppEnv>, session: IssuedSession) =>
    setCookie(c, config.auth.cookieName, session.token, {
      httpOnly: true,
      secure: config.auth.cookieSecure,
      sameSite: 'Lax',
      path: '/',
      domain: config.auth.cookieDomain,
      expires: session.expiresAt,
    });
  const clearSessionCookie = (c: Context<AppEnv>) => deleteCookie(c, config.auth.cookieName, { path: '/', domain: config.auth.cookieDomain });

  router.openapi(
    createRoute({
      method: 'get',
      path: '/providers',
      tags,
      summary: 'Enabled sign-in providers',
      responses: { 200: jsonContent(AuthProvidersResponseSchema, 'Providers') },
    }),
    c => c.json({ google: { enabled: google.enabled, clientId: config.google.clientId ?? null } }, 200)
  );

  router.openapi(
    createRoute({
      method: 'post',
      path: '/register',
      tags,
      summary: 'Create an account (sends an email verification code)',
      request: jsonBody(RegisterRequestSchema),
      responses: { 201: jsonContent(RegisterResponseSchema, 'Verification code sent'), ...errorResponses(400, 409, 429) },
    }),
    async c => {
      await enforceRateLimits(redis, c, [RATE_LIMITS.registerPerIp(getClientIp(c))]);
      const body = c.req.valid('json');
      await auth.register(body, requestMeta(c));
      return c.json({ success: true as const, email: body.email, verificationRequired: true as const }, 201);
    }
  );

  router.openapi(
    createRoute({
      method: 'post',
      path: '/verify-email',
      tags,
      summary: 'Verify email with the emailed code and sign in',
      request: jsonBody(VerifyEmailRequestSchema),
      responses: { 200: jsonContent(AuthResponseSchema, 'Signed in'), ...errorResponses(400, 429) },
    }),
    async c => {
      await enforceRateLimits(redis, c, [RATE_LIMITS.otpVerifyPerIp(getClientIp(c))]);
      const { email, code } = c.req.valid('json');
      const session = await auth.verifyEmail(email, code, requestMeta(c));
      setSessionCookie(c, session);
      return c.json({ success: true as const, user: await users.toResponse(session.user) }, 200);
    }
  );

  router.openapi(
    createRoute({
      method: 'post',
      path: '/login',
      tags,
      summary: 'Sign in with email and password',
      request: jsonBody(LoginRequestSchema),
      responses: { 200: jsonContent(AuthResponseSchema, 'Signed in'), ...errorResponses(400, 401, 403, 429) },
    }),
    async c => {
      const { email, password } = c.req.valid('json');
      await enforceRateLimits(redis, c, [RATE_LIMITS.loginPerIp(getClientIp(c)), RATE_LIMITS.loginPerEmail(email)]);
      const session = await auth.login(email, password, requestMeta(c));
      setSessionCookie(c, session);
      return c.json({ success: true as const, user: await users.toResponse(session.user) }, 200);
    }
  );

  router.openapi(
    createRoute({
      method: 'post',
      path: '/otp/send',
      tags,
      summary: 'Email a one-time code (verify email, passwordless sign-in, password reset)',
      description: 'Always succeeds for unknown emails so the endpoint cannot be used to enumerate accounts.',
      request: jsonBody(OtpSendRequestSchema),
      responses: { 200: jsonContent(OtpSendResponseSchema, 'Code sent if the account is eligible'), ...errorResponses(400, 429) },
    }),
    async c => {
      await enforceRateLimits(redis, c, [RATE_LIMITS.otpSendPerIp(getClientIp(c))]);
      const { email, purpose } = c.req.valid('json');
      const result = await auth.sendOtp(purpose, email);
      return c.json({ success: true as const, resendAfterSeconds: result.resendAfterSeconds }, 200);
    }
  );

  router.openapi(
    createRoute({
      method: 'post',
      path: '/otp/sign-in',
      tags,
      summary: 'Sign in with an emailed one-time code',
      request: jsonBody(OtpSignInRequestSchema),
      responses: { 200: jsonContent(AuthResponseSchema, 'Signed in'), ...errorResponses(400, 403, 429) },
    }),
    async c => {
      await enforceRateLimits(redis, c, [RATE_LIMITS.otpVerifyPerIp(getClientIp(c))]);
      const { email, code } = c.req.valid('json');
      const session = await auth.otpSignIn(email, code, requestMeta(c));
      setSessionCookie(c, session);
      return c.json({ success: true as const, user: await users.toResponse(session.user) }, 200);
    }
  );

  router.openapi(
    createRoute({
      method: 'post',
      path: '/password/reset',
      tags,
      summary: 'Reset password with an emailed code (signs out all other sessions)',
      request: jsonBody(ResetPasswordRequestSchema),
      responses: { 200: jsonContent(AuthResponseSchema, 'Password reset and signed in'), ...errorResponses(400, 429) },
    }),
    async c => {
      await enforceRateLimits(redis, c, [RATE_LIMITS.otpVerifyPerIp(getClientIp(c))]);
      const { email, code, password } = c.req.valid('json');
      const session = await auth.resetPassword(email, code, password, requestMeta(c));
      setSessionCookie(c, session);
      return c.json({ success: true as const, user: await users.toResponse(session.user) }, 200);
    }
  );

  router.openapi(
    createRoute({
      method: 'post',
      path: '/google',
      tags,
      summary: 'Sign in with a Google ID token',
      request: jsonBody(GoogleSignInRequestSchema),
      responses: { 200: jsonContent(AuthResponseSchema, 'Signed in'), ...errorResponses(400, 401, 403, 501) },
    }),
    async c => {
      await enforceRateLimits(redis, c, [RATE_LIMITS.loginPerIp(getClientIp(c))]);
      const session = await auth.googleSignIn(c.req.valid('json').credential, requestMeta(c));
      setSessionCookie(c, session);
      return c.json({ success: true as const, user: await users.toResponse(session.user) }, 200);
    }
  );

  // ---- Authenticated -------------------------------------------------------

  router.use('/me', requireAuth);
  router.use('/logout', requireAuth);
  router.use('/logout-all', requireAuth);
  router.use('/password/change', requireAuth);
  router.use('/sessions', requireAuth);
  router.use('/sessions/*', requireAuth);

  router.openapi(
    createRoute({
      method: 'get',
      path: '/me',
      tags,
      summary: 'Current user',
      security: cookieAuth,
      responses: { 200: jsonContent(UserResponseSchema, 'Current user'), ...errorResponses(401) },
    }),
    async c => c.json(await users.toResponse(await users.getById(getAuth(c).userId)), 200)
  );

  router.openapi(
    createRoute({
      method: 'post',
      path: '/logout',
      tags,
      summary: 'End the current session',
      security: cookieAuth,
      responses: { 200: jsonContent(SuccessResponseSchema, 'Signed out'), ...errorResponses(401) },
    }),
    async c => {
      const { userId, sessionId } = getAuth(c);
      await auth.logout(userId, sessionId, requestMeta(c));
      clearSessionCookie(c);
      return c.json({ success: true as const }, 200);
    }
  );

  router.openapi(
    createRoute({
      method: 'post',
      path: '/logout-all',
      tags,
      summary: 'End every session on every device',
      security: cookieAuth,
      responses: { 200: jsonContent(SuccessResponseSchema, 'Signed out everywhere'), ...errorResponses(401) },
    }),
    async c => {
      await auth.logoutEverywhere(getAuth(c).userId, requestMeta(c));
      clearSessionCookie(c);
      return c.json({ success: true as const }, 200);
    }
  );

  router.openapi(
    createRoute({
      method: 'post',
      path: '/password/change',
      tags,
      summary: 'Change or set the password (signs out other sessions)',
      security: cookieAuth,
      request: jsonBody(ChangePasswordRequestSchema),
      responses: { 200: jsonContent(SuccessResponseSchema, 'Password changed'), ...errorResponses(400, 401) },
    }),
    async c => {
      const { userId, sessionId } = getAuth(c);
      const { currentPassword, newPassword } = c.req.valid('json');
      await auth.changePassword(userId, sessionId, currentPassword, newPassword, requestMeta(c));
      return c.json({ success: true as const }, 200);
    }
  );

  router.openapi(
    createRoute({
      method: 'get',
      path: '/sessions',
      tags,
      summary: 'Active sessions',
      security: cookieAuth,
      responses: { 200: jsonContent(SessionListResponseSchema, 'Sessions'), ...errorResponses(401) },
    }),
    async c => {
      const { userId, sessionId } = getAuth(c);
      const list = await sessions.list(userId);
      return c.json(
        {
          sessions: list.map(s => ({
            id: s.id,
            userAgent: s.userAgent,
            ipAddress: s.ipAddress,
            createdAt: s.createdAt.toISOString(),
            lastUsedAt: s.lastUsedAt.toISOString(),
            expiresAt: s.expiresAt.toISOString(),
            current: s.jti === sessionId,
          })),
        },
        200
      );
    }
  );

  router.openapi(
    createRoute({
      method: 'delete',
      path: '/sessions/{id}',
      tags,
      summary: 'Revoke one session',
      security: cookieAuth,
      request: { params: z.object({ id: z.string().regex(/^\d+$/) }) },
      responses: { 200: jsonContent(SuccessResponseSchema, 'Revoked'), ...errorResponses(401, 404) },
    }),
    async c => {
      const revoked = await sessions.destroyById(getAuth(c).userId, BigInt(c.req.valid('param').id));
      if (!revoked) throw AppError.notFound('Session');
      return c.json({ success: true as const }, 200);
    }
  );

  return router;
}
