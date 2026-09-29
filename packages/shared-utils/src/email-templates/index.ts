import { renderEmail, type BrandingVariables, type EmailContent } from './loader.js';
import { CREDITS_PURCHASED_SUBJECT, OTP_COPY, WELCOME_SUBJECT, normalizeEmailLocale, type OtpEmailPurpose } from './strings.js';

export type { BrandingVariables, EmailContent } from './loader.js';
export { EMAIL_LOCALES, normalizeEmailLocale } from './strings.js';
export type { EmailLocale, OtpEmailPurpose } from './strings.js';

export function buildOtpEmail(
  params: BrandingVariables & { code: string; purpose: OtpEmailPurpose; expiresInMinutes: number; locale?: string }
): EmailContent {
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

export function buildWelcomeEmail(params: BrandingVariables & { name: string; bonusCredits: number; locale?: string }): EmailContent {
  const locale = normalizeEmailLocale(params.locale);
  return renderEmail('welcome', locale, WELCOME_SUBJECT[locale](params.appName), {
    appName: params.appName,
    appUrl: params.appUrl,
    supportEmail: params.supportEmail,
    name: params.name,
    bonusCredits: params.bonusCredits,
  });
}

export function buildCreditsPurchasedEmail(
  params: BrandingVariables & { name: string; credits: number; amount: string; currency: string; locale?: string }
): EmailContent {
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
