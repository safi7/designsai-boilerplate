import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import type { RedisClient } from '@boilerplate/shared-cache';
import type { OtpPurpose } from '@boilerplate/shared-schemas';
import { AppError, ERROR_CODES } from '@boilerplate/shared-utils';
import { buildOtpEmail } from '@boilerplate/shared-utils/email-templates';
import type { AppConfig } from '../lib/config.js';
import type { EmailSender } from './email.service.js';

export const OTP_TTL_SECONDS = 10 * 60;
export const OTP_RESEND_COOLDOWN_SECONDS = 30;
/** Wrong guesses allowed per issued code; then the code is burned. */
export const OTP_MAX_ATTEMPTS = 5;

interface StoredOtp {
  hash: string;
}

const otpKey = (purpose: OtpPurpose, email: string) => `otp:${purpose}:${email}`;
/** Separate counter so INCR can count guesses atomically, even for parallel requests. */
const attemptsKey = (purpose: OtpPurpose, email: string) => `otp-attempts:${purpose}:${email}`;
const cooldownKey = (purpose: OtpPurpose, email: string) => `otp-cooldown:${purpose}:${email}`;

function hashCode(code: string, email: string): string {
  // Salted with the email so two users' identical codes never share a hash.
  return createHash('sha256').update(`${email}:${code}`).digest('hex');
}

/**
 * Emailed 6-digit one-time codes for email verification, passwordless sign-in
 * and password reset.
 *
 * - Only a hash of the code is stored (Redis dumps never leak live codes).
 * - Each code allows OTP_MAX_ATTEMPTS guesses, then it is deleted: a 6-digit
 *   code gives an attacker at most 5 in 1,000,000 per issued code.
 * - A resend cooldown throttles mail bombing a single address.
 */
export class OtpService {
  constructor(
    private readonly redis: RedisClient,
    private readonly email: EmailSender,
    private readonly app: AppConfig['app']
  ) {}

  async send(purpose: OtpPurpose, email: string, locale?: string): Promise<{ resendAfterSeconds: number }> {
    const cooldown = await this.redis.ttl(cooldownKey(purpose, email));
    if (cooldown > 0) {
      throw new AppError(ERROR_CODES.OTP_COOLDOWN, { details: { retryAfterSeconds: cooldown } });
    }

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const stored: StoredOtp = { hash: hashCode(code, email) };
    await this.redis.setex(otpKey(purpose, email), OTP_TTL_SECONDS, JSON.stringify(stored));
    await this.redis.del(attemptsKey(purpose, email));
    await this.redis.setex(cooldownKey(purpose, email), OTP_RESEND_COOLDOWN_SECONDS, '1');

    const result = await this.email.send(
      email,
      buildOtpEmail({
        appName: this.app.name,
        appUrl: this.app.webUrl,
        supportEmail: this.app.supportEmail,
        code,
        purpose,
        expiresInMinutes: OTP_TTL_SECONDS / 60,
        locale,
      })
    );
    if (!result.success) {
      await Promise.all([this.redis.del(otpKey(purpose, email)), this.redis.del(cooldownKey(purpose, email))]);
      throw new AppError(ERROR_CODES.EMAIL_DELIVERY_FAILED);
    }
    return { resendAfterSeconds: OTP_RESEND_COOLDOWN_SECONDS };
  }

  /** Consumes the code on success. Throws `invalid_otp` on any failure. */
  async verify(purpose: OtpPurpose, email: string, code: string): Promise<void> {
    const key = otpKey(purpose, email);
    const counter = attemptsKey(purpose, email);
    const raw = await this.redis.get(key);
    if (!raw) throw new AppError(ERROR_CODES.INVALID_OTP);

    // Count the guess *before* comparing. INCR is atomic, so 100 parallel
    // requests get 1..100 and only the first OTP_MAX_ATTEMPTS are compared.
    // (A read-modify-write on a JSON counter would let them all read 0.)
    const attempt = await this.redis.incr(counter);
    if (attempt === 1) await this.redis.expire(counter, OTP_TTL_SECONDS);
    if (attempt > OTP_MAX_ATTEMPTS) {
      await Promise.all([this.redis.del(key), this.redis.del(counter)]);
      throw new AppError(ERROR_CODES.INVALID_OTP);
    }

    const stored = JSON.parse(raw) as StoredOtp;
    const expected = Buffer.from(stored.hash, 'hex');
    const actual = Buffer.from(hashCode(code, email), 'hex');

    if (!timingSafeEqual(expected, actual)) {
      if (attempt >= OTP_MAX_ATTEMPTS) await Promise.all([this.redis.del(key), this.redis.del(counter)]);
      throw new AppError(ERROR_CODES.INVALID_OTP);
    }

    // GETDEL-style consume: a code can never be used twice.
    const deleted = await this.redis.del(key);
    await this.redis.del(counter);
    if (deleted !== 1) throw new AppError(ERROR_CODES.INVALID_OTP);
  }
}
