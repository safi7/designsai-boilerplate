import jwt from 'jsonwebtoken';

export interface AccessTokenClaims {
  /** User id. */
  sub: string;
  /** Session id — must exist in `user_sessions` for the token to be accepted. */
  jti: string;
  email: string;
}

const ISSUER = 'boilerplate-api';
const AUDIENCE = 'boilerplate-web';

export function signAccessToken(claims: AccessTokenClaims, secret: string, expiresInSeconds: number): string {
  return jwt.sign({ email: claims.email }, secret, {
    algorithm: 'HS256',
    subject: claims.sub,
    jwtid: claims.jti,
    issuer: ISSUER,
    audience: AUDIENCE,
    expiresIn: expiresInSeconds,
  });
}

export type VerifyResult = { ok: true; claims: AccessTokenClaims } | { ok: false; reason: 'expired' | 'invalid' };

export function verifyAccessToken(token: string, secret: string): VerifyResult {
  try {
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'], issuer: ISSUER, audience: AUDIENCE });
    if (typeof payload === 'string' || !payload.sub || !payload.jti || typeof payload.email !== 'string') {
      return { ok: false, reason: 'invalid' };
    }
    return { ok: true, claims: { sub: payload.sub, jti: payload.jti, email: payload.email } };
  } catch (error) {
    return { ok: false, reason: error instanceof jwt.TokenExpiredError ? 'expired' : 'invalid' };
  }
}
