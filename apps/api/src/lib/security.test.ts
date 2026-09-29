import { describe, expect, it } from 'vitest';
import { signAccessToken, verifyAccessToken } from './jwt.js';
import { hashPassword, isPasswordWithinBcryptLimit, verifyPassword } from './password.js';
import { anonymizeIp, pickForwardedIp } from './request.js';

const SECRET = 'unit-test-secret-that-is-at-least-32-chars';

describe('access tokens', () => {
  it('round-trips claims', () => {
    const token = signAccessToken({ sub: '42', jti: 'abc', email: 'a@b.co' }, SECRET, 60);
    expect(verifyAccessToken(token, SECRET)).toEqual({ ok: true, claims: { sub: '42', jti: 'abc', email: 'a@b.co' } });
  });

  it('rejects a token signed with another secret', () => {
    const token = signAccessToken({ sub: '42', jti: 'abc', email: 'a@b.co' }, SECRET, 60);
    expect(verifyAccessToken(token, `${SECRET}-other`)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('reports expiry distinctly', () => {
    const token = signAccessToken({ sub: '42', jti: 'abc', email: 'a@b.co' }, SECRET, -10);
    expect(verifyAccessToken(token, SECRET)).toEqual({ ok: false, reason: 'expired' });
  });
});

describe('passwords', () => {
  it('hashes and verifies', async () => {
    const hash = await hashPassword('correct1horse');
    expect(await verifyPassword('correct1horse', hash)).toBe(true);
    expect(await verifyPassword('wrong1horse', hash)).toBe(false);
  });

  it('refuses inputs bcrypt would silently truncate', () => {
    expect(isPasswordWithinBcryptLimit('a'.repeat(72))).toBe(true);
    expect(isPasswordWithinBcryptLimit('é'.repeat(40))).toBe(false);
  });

  it('never verifies against a missing hash', async () => {
    expect(await verifyPassword('anything1', null)).toBe(false);
  });
});

describe('anonymizeIp', () => {
  it('drops the last IPv4 octet', () => {
    expect(anonymizeIp('203.0.113.77')).toBe('203.0.113.0');
  });
});

describe('pickForwardedIp', () => {
  it('ignores X-Forwarded-For unless proxies are trusted', () => {
    expect(pickForwardedIp('1.2.3.4', 0)).toBeUndefined();
  });

  it('never trusts the client-controlled left side of the chain', () => {
    // Client forged "6.6.6.6"; our single load balancer appended the real address.
    expect(pickForwardedIp('6.6.6.6, 203.0.113.9', 1)).toBe('203.0.113.9');
    // CDN + load balancer: the CDN's entry is the client as it saw it.
    expect(pickForwardedIp('6.6.6.6, 203.0.113.9, 10.0.0.2', 2)).toBe('203.0.113.9');
  });

  it('clamps when the chain is shorter than the hop count', () => {
    expect(pickForwardedIp('203.0.113.9', 3)).toBe('203.0.113.9');
  });
});
