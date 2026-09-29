import { type BrandingVariables, type EmailContent } from './loader.js';
import { type OtpEmailPurpose } from './strings.js';
export type { BrandingVariables, EmailContent } from './loader.js';
export { EMAIL_LOCALES, normalizeEmailLocale } from './strings.js';
export type { EmailLocale, OtpEmailPurpose } from './strings.js';
export declare function buildOtpEmail(params: BrandingVariables & {
    code: string;
    purpose: OtpEmailPurpose;
    expiresInMinutes: number;
    locale?: string;
}): EmailContent;
export declare function buildWelcomeEmail(params: BrandingVariables & {
    name: string;
    bonusCredits: number;
    locale?: string;
}): EmailContent;
export declare function buildCreditsPurchasedEmail(params: BrandingVariables & {
    name: string;
    credits: number;
    amount: string;
    currency: string;
    locale?: string;
}): EmailContent;
//# sourceMappingURL=index.d.ts.map