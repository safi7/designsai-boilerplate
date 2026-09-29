import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';
// In Docker every variable is injected by compose; locally we read the root .env.
if (!process.env.DOCKER_ENV && process.env.NODE_ENV !== 'test') {
    loadDotenv({ path: new URL('../../../../.env', import.meta.url).pathname });
}
const bool = (fallback) => z
    .enum(['true', 'false', '1', '0'])
    .optional()
    .transform(v => (v === undefined ? fallback : v === 'true' || v === '1'));
const csv = z
    .string()
    .default('')
    .transform(v => v
    .split(',')
    .map(s => s.trim())
    .filter(Boolean));
const optionalString = z
    .string()
    .optional()
    .transform(v => (v && v.trim() !== '' ? v.trim() : undefined));
const EnvSchema = z.object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().default(8000),
    LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly']).default('info'),
    APP_NAME: z.string().default('Boilerplate AI'),
    WEB_APP_URL: z.string().url().default('http://localhost:3000'),
    API_PUBLIC_URL: z.string().url().default('http://localhost:8000'),
    SUPPORT_EMAIL: optionalString,
    /** Serve Swagger UI at /doc. Defaults to on outside production. */
    API_DOCS_ENABLED: z.enum(['true', 'false']).optional(),
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
    CORS_ORIGINS: csv,
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(7),
    AUTH_COOKIE_NAME: z.string().default('auth_token'),
    AUTH_COOKIE_DOMAIN: optionalString,
    /** Escape hatch for running the production build over plain HTTP (local Docker only). */
    AUTH_COOKIE_INSECURE: bool(false),
    EMAIL_TRANSPORT: z.enum(['smtp', 'ses']).default('smtp'),
    SMTP_HOST: z.string().default('localhost'),
    SMTP_PORT: z.coerce.number().int().default(1025),
    SMTP_SECURE: bool(false),
    SMTP_USER: optionalString,
    SMTP_PASSWORD: optionalString,
    EMAIL_FROM: z.string().default('Boilerplate AI <no-reply@boilerplate.local>'),
    AWS_REGION: optionalString,
    GOOGLE_CLIENT_ID: optionalString,
    STRIPE_SECRET_KEY: optionalString,
    STRIPE_WEBHOOK_SECRET: optionalString,
    AGENTS_BASE_URL: z.string().url().default('http://localhost:8111'),
    API_TO_AGENTS_INTERNAL_TOKEN: z.string().min(32, 'API_TO_AGENTS_INTERNAL_TOKEN must be at least 32 characters'),
    CREDITS_SIGNUP_BONUS: z.coerce.number().min(0).default(50),
    CREDITS_SIGNUP_BONUS_VALIDITY_DAYS: z.coerce.number().int().min(1).default(30),
    ASK_AI_MIN_BALANCE: z.coerce.number().min(0).default(1),
    ASK_AI_CREDITS_PER_1K_INPUT_TOKENS: z.coerce.number().min(0).default(0.05),
    ASK_AI_CREDITS_PER_1K_OUTPUT_TOKENS: z.coerce.number().min(0).default(0.2),
    ASK_AI_MIN_TURN_CREDITS: z.coerce.number().min(0).default(0.1),
    ASK_AI_TURN_TIMEOUT_MS: z.coerce.number().int().min(5_000).default(180_000),
});
export function loadConfig(source = process.env) {
    const parsed = EnvSchema.safeParse(source);
    if (!parsed.success) {
        const issues = parsed.error.issues.map(i => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
        throw new Error(`Invalid API environment configuration:\n${issues}`);
    }
    const env = parsed.data;
    const isProduction = env.NODE_ENV === 'production';
    if (isProduction && env.CORS_ORIGINS.length === 0) {
        throw new Error('CORS_ORIGINS must be set in production');
    }
    return {
        env: env.NODE_ENV,
        isProduction,
        isTest: env.NODE_ENV === 'test',
        docsEnabled: env.API_DOCS_ENABLED ? env.API_DOCS_ENABLED === 'true' : !isProduction,
        port: env.PORT,
        logLevel: env.LOG_LEVEL,
        app: {
            name: env.APP_NAME,
            webUrl: env.WEB_APP_URL.replace(/\/$/, ''),
            apiUrl: env.API_PUBLIC_URL.replace(/\/$/, ''),
            supportEmail: env.SUPPORT_EMAIL,
        },
        databaseUrl: env.DATABASE_URL,
        redisUrl: env.REDIS_URL,
        cors: { origins: env.CORS_ORIGINS.length > 0 ? env.CORS_ORIGINS : [env.WEB_APP_URL] },
        auth: {
            jwtSecret: env.JWT_SECRET,
            sessionTtlSeconds: env.SESSION_TTL_DAYS * 24 * 60 * 60,
            cookieName: env.AUTH_COOKIE_NAME,
            cookieDomain: env.AUTH_COOKIE_DOMAIN,
            cookieSecure: isProduction && !env.AUTH_COOKIE_INSECURE,
        },
        email: {
            transport: env.EMAIL_TRANSPORT,
            from: env.EMAIL_FROM,
            awsRegion: env.AWS_REGION,
            smtp: { host: env.SMTP_HOST, port: env.SMTP_PORT, secure: env.SMTP_SECURE, user: env.SMTP_USER, password: env.SMTP_PASSWORD },
        },
        google: { clientId: env.GOOGLE_CLIENT_ID },
        stripe: { secretKey: env.STRIPE_SECRET_KEY, webhookSecret: env.STRIPE_WEBHOOK_SECRET },
        agents: { baseUrl: env.AGENTS_BASE_URL.replace(/\/$/, ''), token: env.API_TO_AGENTS_INTERNAL_TOKEN },
        credits: {
            signupBonus: env.CREDITS_SIGNUP_BONUS,
            signupBonusValidityDays: env.CREDITS_SIGNUP_BONUS_VALIDITY_DAYS,
        },
        askAi: {
            minBalance: env.ASK_AI_MIN_BALANCE,
            creditsPer1kInputTokens: env.ASK_AI_CREDITS_PER_1K_INPUT_TOKENS,
            creditsPer1kOutputTokens: env.ASK_AI_CREDITS_PER_1K_OUTPUT_TOKENS,
            minTurnCredits: env.ASK_AI_MIN_TURN_CREDITS,
            turnTimeoutMs: env.ASK_AI_TURN_TIMEOUT_MS,
        },
    };
}
export const config = loadConfig();
//# sourceMappingURL=config.js.map