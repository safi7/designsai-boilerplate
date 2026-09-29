import { describe, expect, it } from 'vitest';
import { buildCreditsPurchasedEmail, buildOtpEmail, buildWelcomeEmail, normalizeEmailLocale } from './index.js';

const branding = { appName: 'Acme AI', appUrl: 'http://localhost:3000', supportEmail: 'support@example.com' };

describe('email templates', () => {
  it('renders the OTP code into html and text parts', () => {
    const email = buildOtpEmail({ ...branding, code: '123456', purpose: 'verify-email', expiresInMinutes: 10 });
    expect(email.subject).toBe('Verify your email address');
    expect(email.html).toContain('123456');
    expect(email.text).toContain('123456');
    expect(email.html).toContain('support@example.com');
  });

  it('localizes subject and body', () => {
    const email = buildOtpEmail({ ...branding, code: '654321', purpose: 'reset-password', expiresInMinutes: 10, locale: 'es-ES' });
    expect(email.subject).toBe('Restablece tu contraseña');
    expect(email.text).toContain('caduca');
  });

  it('escapes user-controlled values', () => {
    const email = buildWelcomeEmail({ ...branding, name: '<script>alert(1)</script>', bonusCredits: 50 });
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;');
  });

  it('renders the purchase receipt', () => {
    const email = buildCreditsPurchasedEmail({ ...branding, name: 'Jane', credits: 500, amount: '9.99', currency: 'usd' });
    expect(email.subject).toContain('500');
    expect(email.html).toContain('9.99 USD');
  });

  it('falls back to English for unknown locales', () => {
    expect(normalizeEmailLocale('fr')).toBe('en');
    expect(normalizeEmailLocale(undefined)).toBe('en');
  });
});
