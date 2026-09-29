import { OAuth2Client } from 'google-auth-library';
import { AppError, ERROR_CODES } from '@boilerplate/shared-utils';
/**
 * Verifies Google Identity Services ID tokens (signature, audience, expiry,
 * issuer) against Google's published keys. Only enabled when a client id is
 * configured.
 */
export class GoogleAuthService {
    clientId;
    client;
    constructor(clientId) {
        this.clientId = clientId;
        if (clientId)
            this.client = new OAuth2Client(clientId);
    }
    get enabled() {
        return Boolean(this.client);
    }
    async verify(credential) {
        if (!this.client || !this.clientId)
            throw new AppError(ERROR_CODES.SSO_NOT_CONFIGURED);
        let payload;
        try {
            const ticket = await this.client.verifyIdToken({ idToken: credential, audience: this.clientId });
            payload = ticket.getPayload();
        }
        catch (error) {
            throw new AppError(ERROR_CODES.SSO_FAILED, { cause: error });
        }
        if (!payload?.sub || !payload.email)
            throw new AppError(ERROR_CODES.SSO_FAILED);
        return {
            providerAccountId: payload.sub,
            email: payload.email.toLowerCase(),
            emailVerified: payload.email_verified === true,
            givenName: payload.given_name ?? payload.name ?? payload.email.split('@')[0],
            familyName: payload.family_name,
        };
    }
}
//# sourceMappingURL=google-auth.service.js.map