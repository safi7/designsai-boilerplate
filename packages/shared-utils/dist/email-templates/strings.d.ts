/**
 * Localized copy that varies per email *variant* (subjects, headings).
 * Body layout lives in the Handlebars files under ./templates.
 */
export declare const EMAIL_LOCALES: readonly ["en", "es"];
export type EmailLocale = (typeof EMAIL_LOCALES)[number];
export type OtpEmailPurpose = 'verify-email' | 'sign-in' | 'reset-password';
interface OtpCopy {
    subject: string;
    heading: string;
    intro: string;
}
export declare const OTP_COPY: Record<EmailLocale, Record<OtpEmailPurpose, OtpCopy>>;
export declare const WELCOME_SUBJECT: Record<EmailLocale, (appName: string) => string>;
export declare const CREDITS_PURCHASED_SUBJECT: Record<EmailLocale, (credits: number) => string>;
export declare function normalizeEmailLocale(locale: string | null | undefined): EmailLocale;
export {};
//# sourceMappingURL=strings.d.ts.map