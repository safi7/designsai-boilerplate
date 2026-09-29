import { renderEmail } from './loader.js';
import { CREDITS_PURCHASED_SUBJECT, OTP_COPY, WELCOME_SUBJECT, normalizeEmailLocale } from './strings.js';
export { EMAIL_LOCALES, normalizeEmailLocale } from './strings.js';
export function buildOtpEmail(params) {
    const locale = normalizeEmailLocale(params.locale);
    const copy = OTP_COPY[locale][params.purpose];
    return renderEmail('otp', locale, copy.subject, {
        appName: params.appName,
        appUrl: params.appUrl,
        supportEmail: params.supportEmail,
        code: params.code,
        heading: copy.heading,
        intro: copy.intro,
        expiresInMinutes: params.expiresInMinutes,
    });
}
export function buildWelcomeEmail(params) {
    const locale = normalizeEmailLocale(params.locale);
    return renderEmail('welcome', locale, WELCOME_SUBJECT[locale](params.appName), {
        appName: params.appName,
        appUrl: params.appUrl,
        supportEmail: params.supportEmail,
        name: params.name,
        bonusCredits: params.bonusCredits,
    });
}
export function buildCreditsPurchasedEmail(params) {
    const locale = normalizeEmailLocale(params.locale);
    return renderEmail('credits-purchased', locale, CREDITS_PURCHASED_SUBJECT[locale](params.credits), {
        appName: params.appName,
        appUrl: params.appUrl,
        supportEmail: params.supportEmail,
        name: params.name,
        credits: params.credits,
        amount: params.amount,
        currency: params.currency.toUpperCase(),
    });
}
//# sourceMappingURL=index.js.map