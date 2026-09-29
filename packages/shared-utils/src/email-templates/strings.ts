/**
 * Localized copy that varies per email *variant* (subjects, headings).
 * Body layout lives in the Handlebars files under ./templates.
 */
export const EMAIL_LOCALES = ['en', 'es'] as const;
export type EmailLocale = (typeof EMAIL_LOCALES)[number];

export type OtpEmailPurpose = 'verify-email' | 'sign-in' | 'reset-password';

interface OtpCopy {
  subject: string;
  heading: string;
  intro: string;
}

export const OTP_COPY: Record<EmailLocale, Record<OtpEmailPurpose, OtpCopy>> = {
  en: {
    'verify-email': {
      subject: 'Verify your email address',
      heading: 'Confirm your email',
      intro: 'Enter this code to verify your email address and activate your account:',
    },
    'sign-in': {
      subject: 'Your sign-in code',
      heading: 'Sign in to your account',
      intro: 'Enter this code to sign in:',
    },
    'reset-password': {
      subject: 'Reset your password',
      heading: 'Reset your password',
      intro: 'Enter this code to choose a new password:',
    },
  },
  es: {
    'verify-email': {
      subject: 'Verifica tu correo electrónico',
      heading: 'Confirma tu correo',
      intro: 'Introduce este código para verificar tu correo y activar tu cuenta:',
    },
    'sign-in': {
      subject: 'Tu código de acceso',
      heading: 'Inicia sesión en tu cuenta',
      intro: 'Introduce este código para iniciar sesión:',
    },
    'reset-password': {
      subject: 'Restablece tu contraseña',
      heading: 'Restablece tu contraseña',
      intro: 'Introduce este código para elegir una nueva contraseña:',
    },
  },
};

export const WELCOME_SUBJECT: Record<EmailLocale, (appName: string) => string> = {
  en: appName => `Welcome to ${appName}`,
  es: appName => `Te damos la bienvenida a ${appName}`,
};

export const CREDITS_PURCHASED_SUBJECT: Record<EmailLocale, (credits: number) => string> = {
  en: credits => `Payment received: ${credits} credits added`,
  es: credits => `Pago recibido: se añadieron ${credits} créditos`,
};

export function normalizeEmailLocale(locale: string | null | undefined): EmailLocale {
  const base = (locale ?? 'en').toLowerCase().split(/[-_]/)[0];
  return (EMAIL_LOCALES as readonly string[]).includes(base) ? (base as EmailLocale) : 'en';
}
