import { describe, expect, it } from 'vitest';
import { safeNextPath } from './safe-redirect';

describe('safeNextPath', () => {
  it('keeps in-app paths and strips the locale prefix', () => {
    expect(safeNextPath('/en/chat/abc')).toBe('/chat/abc');
    expect(safeNextPath('/account')).toBe('/account');
  });

  it('refuses anything that could leave the app', () => {
    expect(safeNextPath('https://evil.example')).toBe('/chat');
    expect(safeNextPath('//evil.example')).toBe('/chat');
    expect(safeNextPath('/\\evil.example')).toBe('/chat');
    expect(safeNextPath(null)).toBe('/chat');
  });
});
