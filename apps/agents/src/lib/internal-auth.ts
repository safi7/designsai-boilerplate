import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Constant-time token comparison. Hashing first gives both sides the same
 * length, so `timingSafeEqual` never throws and length is not leaked.
 */
export function safeTokenEqual(provided: string, expected: string): boolean {
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

export function redactToken(token: string | undefined): string {
  if (!token) return '(none)';
  return token.length <= 8 ? '****' : `${token.slice(0, 4)}…${token.slice(-4)}`;
}
