import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { AppError, ERROR_CODES } from '@boilerplate/shared-utils';
import { buildOtpEmail } from '@boilerplate/shared-utils/email-templates';
export const OTP_TTL_SECONDS = 10 * 60;
export const OTP_RESEND_COOLDOWN_SECONDS = 30;
/** Wrong guesses allowed per issued code; then the code is burned. */
export const OTP_MAX_ATTEMPTS = 5;
const otpKey = (purpose, email) => `otp:${purpose}:${email}`;
const cooldownKey = (purpose, email) => `otp-cooldown:${purpose}:${email}`;
function hashCode(code, email) {
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
    redis;
    email;
    app;
    constructor(redis, email, app) {
        this.redis = redis;
        this.email = email;
        this.app = app;
    }
    async send(purpose, email, locale) {
        const cooldown = await this.redis.ttl(cooldownKey(purpose, email));
        if (cooldown > 0) {
            throw new AppError(ERROR_CODES.OTP_COOLDOWN, { details: { retryAfterSeconds: cooldown } });
        }
        const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
        const stored = { hash: hashCode(code, email), attempts: 0 };
        await this.redis.setex(otpKey(purpose, email), OTP_TTL_SECONDS, JSON.stringify(stored));
        await this.redis.setex(cooldownKey(purpose, email), OTP_RESEND_COOLDOWN_SECONDS, '1');
        const result = await this.email.send(email, buildOtpEmail({
            appName: this.app.name,
            appUrl: this.app.webUrl,
            supportEmail: this.app.supportEmail,
            code,
            purpose,
            expiresInMinutes: OTP_TTL_SECONDS / 60,
            locale,
        }));
        if (!result.success) {
            await Promise.all([this.redis.del(otpKey(purpose, email)), this.redis.del(cooldownKey(purpose, email))]);
            throw new AppError(ERROR_CODES.EMAIL_DELIVERY_FAILED);
        }
        return { resendAfterSeconds: OTP_RESEND_COOLDOWN_SECONDS };
    }
    /** Consumes the code on success. Throws `invalid_otp` on any failure. */
    async verify(purpose, email, code) {
        const key = otpKey(purpose, email);
        const raw = await this.redis.get(key);
        if (!raw)
            throw new AppError(ERROR_CODES.INVALID_OTP);
        const stored = JSON.parse(raw);
        const expected = Buffer.from(stored.hash, 'hex');
        const actual = Buffer.from(hashCode(code, email), 'hex');
        if (!timingSafeEqual(expected, actual)) {
            const attempts = stored.attempts + 1;
            if (attempts >= OTP_MAX_ATTEMPTS) {
                await this.redis.del(key);
            }
            else {
                const ttl = await this.redis.ttl(key);
                if (ttl > 0)
                    await this.redis.setex(key, ttl, JSON.stringify({ ...stored, attempts }));
            }
            throw new AppError(ERROR_CODES.INVALID_OTP);
        }
        // GETDEL-style consume: a code can never be used twice.
        const deleted = await this.redis.del(key);
        if (deleted !== 1)
            throw new AppError(ERROR_CODES.INVALID_OTP);
    }
}
//# sourceMappingURL=otp.service.js.map