import type { Context } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';
import { config } from './config.js';

/**
 * Pick the client IP out of an X-Forwarded-For chain.
 *
 * Each proxy *appends* the address it received the request from, so only the
 * right-most `trustedHops` entries were written by our own infrastructure.
 * Everything to the left of them came from the client and can be forged, so
 * the left-most entry must never be trusted (it would let anyone dodge the
 * per-IP rate limits by sending a random header).
 */
export function pickForwardedIp(forwardedFor: string | undefined, trustedHops: number): string | undefined {
  if (!forwardedFor || trustedHops <= 0) return undefined;
  const chain = forwardedFor
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);
  if (chain.length === 0) return undefined;
  return chain[Math.max(0, chain.length - trustedHops)];
}

/** Client IP: the proxy-reported address when proxies are trusted, else the socket address. */
export function getClientIp(c: Context): string {
  const forwarded = pickForwardedIp(c.req.header('x-forwarded-for'), config.trustProxyHops);
  if (forwarded) return forwarded;
  try {
    return getConnInfo(c).remote.address ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

export function getUserAgent(c: Context): string | undefined {
  return c.req.header('user-agent')?.slice(0, 500);
}

/** Drop the last IPv4 octet / IPv6 groups before an address reaches the logs. */
export function anonymizeIp(ip: string): string {
  if (ip.includes('.')) return ip.replace(/\.\d+$/, '.0');
  if (ip.includes(':')) return ip.split(':').slice(0, 3).join(':') + '::';
  return ip;
}

export function requestMeta(c: Context) {
  return {
    ipAddress: getClientIp(c),
    userAgent: getUserAgent(c) ?? null,
    requestId: (c.get('requestId') as string | undefined) ?? null,
    requestMethod: c.req.method,
    endpoint: c.req.path,
  };
}
