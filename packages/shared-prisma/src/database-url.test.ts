import { describe, expect, it } from 'vitest';
import { normalizeDatabaseUrl } from './database-url.js';

describe('normalizeDatabaseUrl', () => {
  it('leaves URLs without a password untouched', () => {
    expect(normalizeDatabaseUrl('mysql://root@localhost:3306/app')).toBe('mysql://root@localhost:3306/app');
  });

  it('encodes parentheses in the password', () => {
    expect(normalizeDatabaseUrl('mysql://user:pa(ss)@db:3306/app')).toBe('mysql://user:pa%28ss%29@db:3306/app');
  });

  it('encodes a raw @ in the password', () => {
    expect(normalizeDatabaseUrl('mysql://user:p@ss@db:3306/app')).toBe('mysql://user:p%40ss@db:3306/app');
  });

  it('is idempotent', () => {
    const once = normalizeDatabaseUrl('mysql://user:pa(ss)@db:3306/app');
    expect(normalizeDatabaseUrl(once)).toBe(once);
  });
});
