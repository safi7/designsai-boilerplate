import jwt from 'jsonwebtoken';
const ISSUER = 'boilerplate-api';
const AUDIENCE = 'boilerplate-web';
export function signAccessToken(claims, secret, expiresInSeconds) {
    return jwt.sign({ email: claims.email }, secret, {
        algorithm: 'HS256',
        subject: claims.sub,
        jwtid: claims.jti,
        issuer: ISSUER,
        audience: AUDIENCE,
        expiresIn: expiresInSeconds,
    });
}
export function verifyAccessToken(token, secret) {
    try {
        const payload = jwt.verify(token, secret, { algorithms: ['HS256'], issuer: ISSUER, audience: AUDIENCE });
        if (typeof payload === 'string' || !payload.sub || !payload.jti || typeof payload.email !== 'string') {
            return { ok: false, reason: 'invalid' };
        }
        return { ok: true, claims: { sub: payload.sub, jti: payload.jti, email: payload.email } };
    }
    catch (error) {
        return { ok: false, reason: error instanceof jwt.TokenExpiredError ? 'expired' : 'invalid' };
    }
}
//# sourceMappingURL=jwt.js.map