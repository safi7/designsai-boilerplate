import { z } from 'zod';

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().default(8111),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    AGENTS_LOG_FORMAT: z.enum(['json', 'pretty']).optional(),
    APP_NAME: z.string().default('Boilerplate AI'),

    /** Inbound token the API presents on every /internal/* call. */
    API_TO_AGENTS_INTERNAL_TOKEN: z.string().min(32, 'API_TO_AGENTS_INTERNAL_TOKEN must be at least 32 characters'),

    /** Postgres for Mastra memory/threads (kept apart from the product MySQL on purpose). */
    AGENTS_STORAGE_DATABASE_URL: z.string().min(1),
    AGENTS_STORAGE_SCHEMA: z
      .string()
      .regex(/^[a-z_][a-z0-9_]*$/)
      .default('mastra'),

    /**
     * `openrouter` calls real models through Mastra's model router.
     * `mock` streams a canned answer so the full stack runs with no API key
     * (local demos, CI end-to-end tests).
     */
    AGENTS_MODEL_PROVIDER: z.enum(['openrouter', 'mock']).default('openrouter'),
    AGENTS_CHAT_MODEL: z.string().default('openrouter/openai/gpt-4o-mini'),
    AGENTS_TITLE_MODEL: z.string().default('openrouter/openai/gpt-4o-mini'),
    OPENROUTER_API_KEY: z.string().optional(),

    ASK_AI_MEMORY_LAST_MESSAGES: z.coerce.number().int().min(1).max(100).default(20),
    ASK_AI_MAX_STEPS: z.coerce.number().int().min(1).max(20).default(5),
  })
  .superRefine((env, ctx) => {
    if (env.AGENTS_MODEL_PROVIDER === 'openrouter' && !env.OPENROUTER_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['OPENROUTER_API_KEY'],
        message: 'OPENROUTER_API_KEY is required when AGENTS_MODEL_PROVIDER=openrouter (or set AGENTS_MODEL_PROVIDER=mock)',
      });
    }
  });

export function createAgentsConfig(source: NodeJS.ProcessEnv = process.env) {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(i => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid agents environment configuration:\n${issues}`);
  }
  const env = parsed.data;
  return {
    env: env.NODE_ENV,
    port: env.PORT,
    logLevel: env.LOG_LEVEL,
    logFormat: env.AGENTS_LOG_FORMAT ?? (env.NODE_ENV === 'production' ? 'json' : 'pretty'),
    appName: env.APP_NAME,
    internalToken: env.API_TO_AGENTS_INTERNAL_TOKEN,
    storage: { url: env.AGENTS_STORAGE_DATABASE_URL, schema: env.AGENTS_STORAGE_SCHEMA },
    models: { provider: env.AGENTS_MODEL_PROVIDER, chat: env.AGENTS_CHAT_MODEL, title: env.AGENTS_TITLE_MODEL },
    askAi: { lastMessages: env.ASK_AI_MEMORY_LAST_MESSAGES, maxSteps: env.ASK_AI_MAX_STEPS },
  } as const;
}

export type AgentsConfig = ReturnType<typeof createAgentsConfig>;

let cached: AgentsConfig | undefined;
/** Parsed once per process; route handlers read it lazily so tests can set env first. */
export function getConfig(): AgentsConfig {
  cached ??= createAgentsConfig();
  return cached;
}
