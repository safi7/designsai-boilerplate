/**
 * Localized copy that varies per email *variant* (subjects, headings).
 * Body layout lives in the Handlebars files under ./templates.
 */
export const EMAIL_LOCALES = ['en', 'es'];
export const OTP_COPY = {
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
export const WELCOME_SUBJECT = {
    en: appName => `Welcome to ${appName}`,
    es: appName => `Te damos la bienvenida a ${appName}`,
};
export const CREDITS_PURCHASED_SUBJECT = {
    en: credits => `Payment received: ${credits} credits added`,
    es: credits => `Pago recibido: se añadieron ${credits} créditos`,
};
export function normalizeEmailLocale(locale) {
    const base = (locale ?? 'en').toLowerCase().split(/[-_]/)[0];
    return EMAIL_LOCALES.includes(base) ? base : 'en';
}
//# sourceMappingURL=strings.js.map