import { describe, expect, it, vi } from 'vitest';
import { ERROR_CODES } from '@boilerplate/shared-utils';
import { createFakeRedis } from '../test/fakes.js';
import type { EmailSender } from './email.service.js';
import { OTP_MAX_ATTEMPTS, OtpService } from './otp.service.js';

const app = { name: 'Test AI', webUrl: 'http://localhost:3000', apiUrl: 'http://localhost:8000', supportEmail: undefined };

function setup(sendResult = { success: true }) {
  const redis = createFakeRedis();
  const sent: { to: string; text: string }[] = [];
  const email: EmailSender = {
    send: vi.fn(async (to, content) => {
      sent.push({ to, text: content.text });
      return sendResult;
    }),
    verify: vi.fn(async () => true),
  };
  const service = new OtpService(redis.client, email, app);
  const lastCode = () => sent.at(-1)!.text.match(/\b(\d{6})\b/)![1]!;
  return { service, redis, sent, lastCode };
}

describe('OtpService', () => {
  it('emails a 6-digit code and stores only its hash', async () => {
    const { service, redis, lastCode } = setup();
    await service.send('verify-email', 'jane@example.com');
    const code = lastCode();
    const stored = [...redis.values.values()].map(v => v.value).join(' ');
    expect(code).toMatch(/^\d{6}$/);
    expect(stored).not.toContain(code);
  });

  it('accepts the right code exactly once', async () => {
    const { service, lastCode } = setup();
    await service.send('sign-in', 'jane@example.com');
    const code = lastCode();
    await expect(service.verify('sign-in', 'jane@example.com', code)).resolves.toBeUndefined();
    await expect(service.verify('sign-in', 'jane@example.com', code)).rejects.toMatchObject({ code: ERROR_CODES.INVALID_OTP });
  });

  it('does not accept a code issued for another purpose', async () => {
    const { service, lastCode } = setup();
    await service.send('sign-in', 'jane@example.com');
    await expect(service.verify('reset-password', 'jane@example.com', lastCode())).rejects.toMatchObject({ code: ERROR_CODES.INVALID_OTP });
  });

  it('burns the code after too many wrong guesses', async () => {
    const { service, lastCode } = setup();
    await service.send('reset-password', 'jane@example.com');
    const code = lastCode();
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) {
      await expect(service.verify('reset-password', 'jane@example.com', wrong)).rejects.toMatchObject({ code: ERROR_CODES.INVALID_OTP });
    }
    await expect(service.verify('reset-password', 'jane@example.com', code)).rejects.toMatchObject({ code: ERROR_CODES.INVALID_OTP });
  });

  it('caps guesses even when they arrive in parallel', async () => {
    const { service, lastCode } = setup();
    await service.send('sign-in', 'jane@example.com');
    const code = lastCode();
    const wrong = code === '000000' ? '111111' : '000000';
    // 20 simultaneous wrong guesses, then the right code: the code must be burned.
    const results = await Promise.allSettled(Array.from({ length: 20 }, () => service.verify('sign-in', 'jane@example.com', wrong)));
    expect(results.every(r => r.status === 'rejected')).toBe(true);
    await expect(service.verify('sign-in', 'jane@example.com', code)).rejects.toMatchObject({ code: ERROR_CODES.INVALID_OTP });
  });

  it('enforces a resend cooldown', async () => {
    const { service } = setup();
    await service.send('sign-in', 'jane@example.com');
    await expect(service.send('sign-in', 'jane@example.com')).rejects.toMatchObject({ code: ERROR_CODES.OTP_COOLDOWN });
  });

  it('rolls back when the email cannot be delivered', async () => {
    const { service, redis } = setup({ success: false });
    await expect(service.send('sign-in', 'jane@example.com')).rejects.toMatchObject({ code: ERROR_CODES.EMAIL_DELIVERY_FAILED });
    expect(redis.values.size).toBe(0);
  });
});
