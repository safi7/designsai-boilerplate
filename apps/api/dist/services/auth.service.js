import { AppError, ERROR_CODES } from '@boilerplate/shared-utils';
import { buildWelcomeEmail } from '@boilerplate/shared-utils/email-templates';
import { signAccessToken } from '../lib/jwt.js';
import { hashPassword, isPasswordWithinBcryptLimit, TIMING_EQUALIZER_HASH, verifyPassword } from '../lib/password.js';
/**
 * Identity use-cases. Routes stay thin (parse → call → set cookie); every
 * rule about who may sign in, when an account becomes active and what
 * happens on first activation lives here.
 */
export class AuthService {
    deps;
    constructor(deps) {
        this.deps = deps;
    }
    async register(input, meta) {
        const { prisma, users, audit } = this.deps;
        if (!isPasswordWithinBcryptLimit(input.password))
            throw AppError.validation('Password is too long');
        const existing = await users.findByEmail(input.email);
        if (existing && existing.status !== 'pending')
            throw new AppError(ERROR_CODES.EMAIL_ALREADY_EXISTS);
        const password = await hashPassword(input.password);
        const data = { name: input.name, lastName: input.lastName ?? null, password, language: input.language ?? 'en' };
        // Re-registering an unverified email replaces the pending details: whoever
        // proves ownership of the inbox is the one who sets the password.
        const user = existing
            ? await prisma.user.update({ where: { id: existing.id }, data })
            : await prisma.user.create({ data: { ...data, email: input.email, status: 'pending' } });
        audit.record({ userId: user.id, action: 'CREATE', resourceType: 'User', resourceId: user.id.toString(), ...meta });
        await this.sendIgnoringCooldown('verify-email', user);
    }
    async verifyEmail(email, code, meta) {
        const user = await this.deps.users.findByEmail(email);
        if (!user || user.status !== 'pending')
            throw new AppError(ERROR_CODES.INVALID_OTP);
        await this.deps.otp.verify('verify-email', email, code);
        const activated = await this.activate(user);
        this.deps.audit.record({ userId: user.id, action: 'EMAIL_VERIFY', resourceType: 'User', resourceId: user.id.toString(), ...meta });
        return this.issueSession(activated, meta);
    }
    async login(email, password, meta) {
        const user = await this.deps.users.findByEmail(email);
        // Always run bcrypt so response time does not reveal whether the email exists.
        const valid = await verifyPassword(password, user?.password ?? TIMING_EQUALIZER_HASH);
        if (!user || !user.password || !valid) {
            this.deps.audit.record({ userId: user?.id, action: 'LOGIN', resourceType: 'Session', status: 'failed', errorMessage: 'invalid_credentials', ...meta });
            throw new AppError(ERROR_CODES.INVALID_CREDENTIALS);
        }
        this.assertCanSignIn(user);
        return this.issueSession(user, meta);
    }
    /**
     * Issue a code. Unknown or ineligible emails get the same success response,
     * so this endpoint cannot be used to discover which addresses have accounts.
     */
    async sendOtp(purpose, email) {
        const user = await this.deps.users.findByEmail(email);
        const eligible = user !== null &&
            !user.deletedAt &&
            (purpose === 'verify-email' ? user.status === 'pending' : purpose === 'sign-in' ? user.status === 'active' || user.status === 'pending' : user.status !== 'banned');
        if (!eligible)
            return { resendAfterSeconds: 30 };
        return this.deps.otp.send(purpose, email, user.language);
    }
    async otpSignIn(email, code, meta) {
        const user = await this.deps.users.findByEmail(email);
        if (!user)
            throw new AppError(ERROR_CODES.INVALID_OTP);
        await this.deps.otp.verify('sign-in', email, code);
        // Receiving the code proves inbox ownership, which is all verification means.
        const signedIn = user.status === 'pending' ? await this.activate(user) : user;
        this.assertCanSignIn(signedIn);
        return this.issueSession(signedIn, meta);
    }
    async resetPassword(email, code, newPassword, meta) {
        const { prisma, users, otp, sessions, audit } = this.deps;
        if (!isPasswordWithinBcryptLimit(newPassword))
            throw AppError.validation('Password is too long');
        const user = await users.findByEmail(email);
        if (!user)
            throw new AppError(ERROR_CODES.INVALID_OTP);
        await otp.verify('reset-password', email, code);
        let updated = await prisma.user.update({ where: { id: user.id }, data: { password: await hashPassword(newPassword) } });
        if (updated.status === 'pending')
            updated = await this.activate(updated);
        this.assertCanSignIn(updated);
        // A reset usually means the old password is compromised: end every session.
        await sessions.destroyAll(user.id);
        audit.record({ userId: user.id, action: 'PASSWORD_RESET', resourceType: 'User', resourceId: user.id.toString(), ...meta });
        return this.issueSession(updated, meta);
    }
    async changePassword(userId, currentJti, currentPassword, newPassword, meta) {
        const { prisma, users, sessions, audit } = this.deps;
        if (!isPasswordWithinBcryptLimit(newPassword))
            throw AppError.validation('Password is too long');
        const user = await users.getById(userId);
        if (user.password) {
            if (!currentPassword || !(await verifyPassword(currentPassword, user.password))) {
                throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, { message: 'Current password is incorrect.' });
            }
        }
        await prisma.user.update({ where: { id: userId }, data: { password: await hashPassword(newPassword) } });
        await sessions.destroyAll(userId, currentJti);
        audit.record({ userId, action: 'PASSWORD_CHANGE', resourceType: 'User', resourceId: userId.toString(), ...meta });
    }
    async googleSignIn(credential, meta) {
        const { prisma, google, users } = this.deps;
        const identity = await google.verify(credential);
        if (!identity.emailVerified)
            throw new AppError(ERROR_CODES.SSO_FAILED, { message: 'Google account email is not verified.' });
        const linked = await prisma.oAuthAccount.findUnique({
            where: { provider_providerAccountId: { provider: 'google', providerAccountId: identity.providerAccountId } },
            include: { user: true },
        });
        let user;
        if (linked) {
            user = linked.user;
            await prisma.oAuthAccount.update({ where: { id: linked.id }, data: { lastLoginAt: new Date() } });
        }
        else {
            const existing = await users.findByEmail(identity.email);
            user =
                existing ??
                    (await prisma.user.create({
                        data: { email: identity.email, name: identity.givenName, lastName: identity.familyName ?? null, status: 'pending' },
                    }));
            await prisma.oAuthAccount.create({
                data: { userId: user.id, provider: 'google', providerAccountId: identity.providerAccountId, email: identity.email },
            });
        }
        // Google has verified the address, so a pending account can be activated.
        if (user.status === 'pending')
            user = await this.activate(user);
        this.assertCanSignIn(user);
        return this.issueSession(user, meta);
    }
    async logout(userId, jti, meta) {
        await this.deps.sessions.destroy(jti);
        this.deps.audit.record({ userId, action: 'LOGOUT', resourceType: 'Session', resourceId: jti, ...meta });
    }
    async logoutEverywhere(userId, meta) {
        const count = await this.deps.sessions.destroyAll(userId);
        this.deps.audit.record({ userId, action: 'LOGOUT', resourceType: 'Session', description: `Revoked ${count} sessions`, ...meta });
        return count;
    }
    assertCanSignIn(user) {
        if (user.deletedAt || user.status === 'banned' || user.status === 'deactivated')
            throw new AppError(ERROR_CODES.ACCOUNT_INACTIVE);
        if (user.status === 'pending')
            throw new AppError(ERROR_CODES.EMAIL_NOT_VERIFIED);
    }
    async issueSession(user, meta) {
        const { sessions, prisma, audit, config } = this.deps;
        const session = await sessions.create(user.id, meta);
        const token = signAccessToken({ sub: user.id.toString(), jti: session.jti, email: user.email }, config.auth.jwtSecret, config.auth.sessionTtlSeconds);
        const updated = await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
        audit.record({ userId: user.id, action: 'LOGIN', resourceType: 'Session', resourceId: session.jti, ...meta });
        return { user: updated, token, expiresAt: session.expiresAt };
    }
    /**
     * First activation: mark verified, grant the sign-up bonus (idempotent, so a
     * retried verification can never grant twice) and send the welcome email.
     */
    async activate(user) {
        const { prisma, credits, email, config, logger } = this.deps;
        const activated = await prisma.user.update({ where: { id: user.id }, data: { status: 'active', emailVerifiedAt: user.emailVerifiedAt ?? new Date() } });
        if (config.credits.signupBonus > 0) {
            const expiresAt = new Date(Date.now() + config.credits.signupBonusValidityDays * 24 * 60 * 60 * 1000);
            await credits.grant({
                userId: user.id,
                amount: config.credits.signupBonus,
                sourceType: 'signup_bonus',
                idempotencyKey: `signup-bonus:${user.id}`,
                expiresAt,
                description: 'Welcome bonus',
            });
        }
        void email
            .send(activated.email, buildWelcomeEmail({
            appName: config.app.name,
            appUrl: config.app.webUrl,
            supportEmail: config.app.supportEmail,
            name: activated.name,
            bonusCredits: config.credits.signupBonus,
            locale: activated.language,
        }))
            .catch(error => logger.warn('Welcome email failed', { error: error instanceof Error ? error.message : String(error) }));
        return activated;
    }
    async sendIgnoringCooldown(purpose, user) {
        try {
            await this.deps.otp.send(purpose, user.email, user.language);
        }
        catch (error) {
            // A code was sent moments ago; the user can use that one.
            if (error instanceof AppError && error.code === ERROR_CODES.OTP_COOLDOWN)
                return;
            throw error;
        }
    }
}
//# sourceMappingURL=auth.service.js.map