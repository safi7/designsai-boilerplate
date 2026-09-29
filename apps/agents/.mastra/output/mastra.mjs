import { Mastra } from '@mastra/core/mastra';
import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { createTool } from '@mastra/core/tools';
import { PinoLogger } from '@mastra/loggers';
import pino from 'pino';
import pretty from 'pino-pretty';
import { MockLanguageModelV3, simulateReadableStream } from 'ai/test';
import { registerApiRoute } from '@mastra/core/server';
import { createHash, timingSafeEqual } from 'node:crypto';
import { PostgresStore } from '@mastra/pg';

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().default(8111),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  AGENTS_LOG_FORMAT: z.enum(["json", "pretty"]).optional(),
  APP_NAME: z.string().default("Boilerplate AI"),
  /** Inbound token the API presents on every /internal/* call. */
  API_TO_AGENTS_INTERNAL_TOKEN: z.string().min(32, "API_TO_AGENTS_INTERNAL_TOKEN must be at least 32 characters"),
  /** Postgres for Mastra memory/threads (kept apart from the product MySQL on purpose). */
  AGENTS_STORAGE_DATABASE_URL: z.string().min(1),
  AGENTS_STORAGE_SCHEMA: z.string().regex(/^[a-z_][a-z0-9_]*$/).default("mastra"),
  /**
   * `openrouter` calls real models through Mastra's model router.
   * `mock` streams a canned answer so the full stack runs with no API key
   * (local demos, CI end-to-end tests).
   */
  AGENTS_MODEL_PROVIDER: z.enum(["openrouter", "mock"]).default("openrouter"),
  AGENTS_CHAT_MODEL: z.string().default("openrouter/openai/gpt-4o-mini"),
  AGENTS_TITLE_MODEL: z.string().default("openrouter/openai/gpt-4o-mini"),
  OPENROUTER_API_KEY: z.string().optional(),
  ASK_AI_MEMORY_LAST_MESSAGES: z.coerce.number().int().min(1).max(100).default(20),
  ASK_AI_MAX_STEPS: z.coerce.number().int().min(1).max(20).default(5)
}).superRefine((env, ctx) => {
  if (env.AGENTS_MODEL_PROVIDER === "openrouter" && !env.OPENROUTER_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["OPENROUTER_API_KEY"],
      message: "OPENROUTER_API_KEY is required when AGENTS_MODEL_PROVIDER=openrouter (or set AGENTS_MODEL_PROVIDER=mock)"
    });
  }
});
function createAgentsConfig(source = process.env) {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid agents environment configuration:
${issues}`);
  }
  const env = parsed.data;
  return {
    env: env.NODE_ENV,
    port: env.PORT,
    logLevel: env.LOG_LEVEL,
    logFormat: env.AGENTS_LOG_FORMAT ?? (env.NODE_ENV === "production" ? "json" : "pretty"),
    appName: env.APP_NAME,
    internalToken: env.API_TO_AGENTS_INTERNAL_TOKEN,
    storage: { url: env.AGENTS_STORAGE_DATABASE_URL, schema: env.AGENTS_STORAGE_SCHEMA },
    models: { provider: env.AGENTS_MODEL_PROVIDER, chat: env.AGENTS_CHAT_MODEL, title: env.AGENTS_TITLE_MODEL },
    askAi: { lastMessages: env.ASK_AI_MEMORY_LAST_MESSAGES, maxSteps: env.ASK_AI_MAX_STEPS }
  };
}
let cached;
function getConfig() {
  cached ??= createAgentsConfig();
  return cached;
}

const currentTimeTool = createTool({
  id: "current_time",
  description: "Returns the current date and time. Use it whenever the answer depends on today's date or the current time.",
  inputSchema: z.object({
    timeZone: z.string().describe('IANA time zone, e.g. "Europe/Madrid". Defaults to UTC.').optional()
  }),
  outputSchema: z.object({ iso: z.string(), formatted: z.string(), timeZone: z.string() }),
  execute: async (input) => {
    const now = /* @__PURE__ */ new Date();
    let timeZone = input.timeZone ?? "UTC";
    let formatted;
    try {
      formatted = now.toLocaleString("en-US", { timeZone, dateStyle: "full", timeStyle: "long" });
    } catch {
      timeZone = "UTC";
      formatted = now.toLocaleString("en-US", { timeZone, dateStyle: "full", timeStyle: "long" });
    }
    return { iso: now.toISOString(), formatted, timeZone };
  }
});

const ASK_AI_AGENT_ID = "askAiAgent";
const WORKING_MEMORY_TEMPLATE = `# User profile
- Name:
- Preferred language:
- Role / occupation:
- Interests and ongoing projects:
- Communication preferences (tone, length, format):
`;
function buildAskAiInstructions(appName) {
  return `
You are Ask AI, the assistant inside ${appName}.

Goals:
- Give accurate, direct and useful answers. Lead with the answer, then the detail.
- Ask one short clarifying question only when the request is genuinely ambiguous.
- Say so plainly when you do not know something; never invent facts, links or citations.

Style:
- Reply in the user's language.
- Use Markdown: short paragraphs, lists for steps, fenced code blocks with a language tag for code.
- Keep answers proportional to the question.

Tools and memory:
- Use the current_time tool whenever the answer depends on today's date or the time.
- Update working memory when the user shares durable facts about themselves or their preferences; never store secrets such as passwords or keys.
`.trim();
}
function createAskAiAgent(config, model) {
  return new Agent({
    id: ASK_AI_AGENT_ID,
    name: "Ask AI",
    description: "General-purpose conversational assistant with per-user memory.",
    instructions: buildAskAiInstructions(config.appName),
    model,
    tools: { current_time: currentTimeTool },
    memory: new Memory({
      options: {
        lastMessages: config.askAi.lastMessages,
        workingMemory: { enabled: true, scope: "resource", template: WORKING_MEMORY_TEMPLATE },
        generateTitle: false
      }
    })
  });
}

const THREAD_TITLE_AGENT_ID = "threadTitleAgent";
const THREAD_TITLE_INSTRUCTIONS = `
You write short titles for chat conversations.

Rules:
- 2 to 6 words, under 60 characters.
- Name the concrete subject (product, place, technology, task), not the action ("Help with", "Question about").
- Same language as the user's messages.
- No quotes, emojis, markdown or trailing punctuation.
`.trim();
function createThreadTitleAgent(model) {
  return new Agent({
    id: THREAD_TITLE_AGENT_ID,
    name: "Thread Title",
    description: "Generates concise titles for conversations.",
    instructions: THREAD_TITLE_INSTRUCTIONS,
    model
  });
}
const MAX_TITLE_CHARS = 60;
function cleanThreadTitle(raw) {
  const cleaned = raw.replace(/^title:\s*/i, "").replace(/[*_`~#]/g, "").replace(/^["'“”]+|["'“”]+$/g, "").replace(/[.!?。！？]+$/u, "").replace(/\s+/g, " ").trim();
  if (cleaned.length <= MAX_TITLE_CHARS) return cleaned;
  const clipped = cleaned.slice(0, MAX_TITLE_CHARS);
  const lastSpace = clipped.lastIndexOf(" ");
  return (lastSpace > MAX_TITLE_CHARS * 0.6 ? clipped.slice(0, lastSpace) : clipped).trim();
}

function createAgentsLogger(config) {
  const base = { name: "agents", level: config.logLevel, messageKey: "msg", timestamp: pino.stdTimeFunctions.isoTime };
  const native = config.logFormat === "pretty" ? pino(base, pretty({ colorize: true, singleLine: true, translateTime: "SYS:standard", ignore: "pid,hostname" })) : pino(base);
  return new PinoLogger({ name: "agents", level: config.logLevel, _logger: native });
}

function resolveModel(config, role) {
  if (config.models.provider === "mock") return createMockModel(role);
  return role === "chat" ? config.models.chat : config.models.title;
}
function lastUserText(prompt) {
  const messages = Array.isArray(prompt) ? prompt : [];
  const user = [...messages].reverse().find((m) => m.role === "user");
  if (!user) return "";
  if (typeof user.content === "string") return user.content;
  return user.content.filter((p) => p.type === "text").map((p) => p.text ?? "").join(" ");
}
function createMockModel(role) {
  const usage = (input, output) => ({
    inputTokens: { total: input, noCache: input, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: output, text: output, reasoning: 0 }
  });
  const reply = (prompt) => {
    const question = lastUserText(prompt).trim();
    if (role === "title") {
      const first = question.match(/^1\.\s*(.+)$/m)?.[1] ?? question;
      return JSON.stringify({ title: first.split(/\s+/).slice(0, 6).join(" ") || "New conversation" });
    }
    return `You said: "${question.slice(0, 200)}". This is the offline mock model \u2014 set AGENTS_MODEL_PROVIDER=openrouter and OPENROUTER_API_KEY for real answers.`;
  };
  return new MockLanguageModelV3({
    provider: "mock",
    modelId: `mock-${role}`,
    doGenerate: async ({ prompt }) => {
      const text = reply(prompt);
      return {
        content: [{ type: "text", text }],
        finishReason: { unified: "stop", raw: "stop" },
        usage: usage(Math.ceil(JSON.stringify(prompt).length / 4), Math.ceil(text.length / 4)),
        warnings: []
      };
    },
    doStream: async ({ prompt }) => {
      const text = reply(prompt);
      const words = text.split(/(?<=\s)/);
      const chunks = [
        { type: "stream-start", warnings: [] },
        { type: "text-start", id: "t1" },
        ...words.map((delta) => ({ type: "text-delta", id: "t1", delta })),
        { type: "text-end", id: "t1" },
        {
          type: "finish",
          finishReason: { unified: "stop", raw: "stop" },
          usage: usage(Math.ceil(JSON.stringify(prompt).length / 4), Math.ceil(text.length / 4))
        }
      ];
      return { stream: simulateReadableStream({ chunks, chunkDelayInMs: 25 }) };
    }
  });
}

z.object({
  success: z.literal(false),
  error: z.string(),
  message: z.string().optional(),
  details: z.record(z.unknown()).optional()
});
z.object({ success: z.literal(true) });
const EmailSchema = z.string().trim().toLowerCase().email().max(255);
const PasswordSchema = z.string().min(8, "Password must be at least 8 characters").max(128, "Password must be at most 128 characters").regex(/[A-Za-z]/, "Password must contain a letter").regex(/\d/, "Password must contain a number");
const OtpCodeSchema = z.string().regex(/^\d{6}$/, "Code must be 6 digits");
const LocaleSchema = z.enum(["en", "es"]);
z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});
const PageInfoSchema = z.object({
  nextCursor: z.string().nullable(),
  hasMore: z.boolean()
});

const UserStatusSchema = z.enum(["pending", "active", "banned", "deactivated"]);
const UserResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  lastName: z.string().nullable(),
  email: z.string(),
  status: UserStatusSchema,
  emailVerified: z.boolean(),
  hasPassword: z.boolean(),
  language: z.string(),
  avatarUrl: z.string().nullable(),
  createdAt: z.string()
});
z.object({
  name: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().max(100).nullable().optional(),
  language: LocaleSchema.optional()
}).refine((value) => Object.keys(value).length > 0, { message: "At least one field is required" });

z.object({
  name: z.string().trim().min(1).max(100),
  lastName: z.string().trim().max(100).optional(),
  email: EmailSchema,
  password: PasswordSchema,
  language: LocaleSchema.optional()
});
z.object({
  email: EmailSchema,
  password: z.string().min(1).max(128)
});
const OtpPurposeSchema = z.enum(["verify-email", "sign-in", "reset-password"]);
z.object({
  email: EmailSchema,
  purpose: OtpPurposeSchema
});
z.object({
  success: z.literal(true),
  /** Seconds before another code can be requested. */
  resendAfterSeconds: z.number().int()
});
z.object({ email: EmailSchema, code: OtpCodeSchema });
z.object({ email: EmailSchema, code: OtpCodeSchema });
z.object({
  email: EmailSchema,
  code: OtpCodeSchema,
  password: PasswordSchema
});
z.object({
  currentPassword: z.string().min(1).max(128).optional(),
  newPassword: PasswordSchema
});
z.object({
  /** Google Identity Services ID token (JWT). */
  credential: z.string().min(20).max(4096)
});
z.object({
  success: z.literal(true),
  user: UserResponseSchema
});
z.object({
  success: z.literal(true),
  email: z.string(),
  /** Always true: the account must be verified before it can sign in. */
  verificationRequired: z.literal(true)
});
const SessionSchema = z.object({
  id: z.string(),
  userAgent: z.string().nullable(),
  ipAddress: z.string().nullable(),
  createdAt: z.string(),
  lastUsedAt: z.string(),
  expiresAt: z.string(),
  current: z.boolean()
});
z.object({ sessions: z.array(SessionSchema) });
z.object({
  google: z.object({ enabled: z.boolean(), clientId: z.string().nullable() })
});

const CreditAmountSchema = z.string().regex(/^-?\d+(\.\d+)?$/);
z.object({
  balance: CreditAmountSchema,
  /** Soonest expiry among sources that still hold credits. */
  nextExpiry: z.object({ amount: CreditAmountSchema, expiresAt: z.string() }).nullable()
});
const CreditTransactionTypeSchema = z.enum(["grant", "usage", "refund", "expiry", "adjustment"]);
const CreditTransactionSchema = z.object({
  id: z.string(),
  type: CreditTransactionTypeSchema,
  amount: CreditAmountSchema,
  balanceAfter: CreditAmountSchema,
  description: z.string().nullable(),
  referenceType: z.string().nullable(),
  referenceId: z.string().nullable(),
  createdAt: z.string()
});
z.object({
  items: z.array(CreditTransactionSchema),
  pageInfo: PageInfoSchema
});
const CreditPackageSchema = z.object({
  packageId: z.string(),
  name: z.string(),
  credits: z.number().int(),
  price: z.string(),
  currency: z.string(),
  validityDays: z.number().int().nullable()
});
z.object({
  packages: z.array(CreditPackageSchema),
  checkoutEnabled: z.boolean()
});
z.object({ packageId: z.string().min(1).max(50) });
z.object({ checkoutUrl: z.string().url() });

const ASK_AI_MESSAGE_MAX_LENGTH = 8e3;
const AgentThreadStatusSchema = z.enum(["idle", "running", "failed"]);
const MessageContentSchema = z.string().trim().min(1).max(ASK_AI_MESSAGE_MAX_LENGTH);
z.object({ content: MessageContentSchema });
z.object({ content: MessageContentSchema });
z.object({
  title: z.string().trim().min(1).max(191).optional(),
  isFavorite: z.boolean().optional()
}).refine((v) => v.title !== void 0 || v.isFavorite !== void 0, { message: "Nothing to update" });
const AgentThreadSchema = z.object({
  id: z.string(),
  domain: z.literal("ask_ai"),
  title: z.string(),
  status: AgentThreadStatusSchema,
  isFavorite: z.boolean(),
  lastMessageAt: z.string(),
  createdAt: z.string()
});
z.object({
  items: z.array(AgentThreadSchema),
  pageInfo: PageInfoSchema
});
const TurnUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  creditsCharged: z.string()
});
const ThreadEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("message.user"),
    cursor: z.number().int(),
    createdAt: z.string(),
    payload: z.object({ messageId: z.string(), turnId: z.string(), content: z.string() })
  }),
  z.object({
    type: z.literal("message.assistant"),
    cursor: z.number().int(),
    createdAt: z.string(),
    payload: z.object({ messageId: z.string(), turnId: z.string(), content: z.string(), usage: TurnUsageSchema.nullable() })
  }),
  z.object({
    type: z.literal("turn.started"),
    cursor: z.number().int(),
    createdAt: z.string(),
    payload: z.object({ turnId: z.string() })
  }),
  z.object({
    type: z.literal("turn.failed"),
    cursor: z.number().int(),
    createdAt: z.string(),
    payload: z.object({ turnId: z.string(), code: z.string(), message: z.string() })
  }),
  z.object({
    type: z.literal("turn.cancelled"),
    cursor: z.number().int(),
    createdAt: z.string(),
    payload: z.object({ turnId: z.string(), partialContent: z.string() })
  }),
  z.object({
    type: z.literal("thread.title"),
    cursor: z.number().int(),
    createdAt: z.string(),
    payload: z.object({ title: z.string() })
  })
]);
z.discriminatedUnion("type", [
  z.object({ type: z.literal("message.delta"), turnId: z.string(), seq: z.number().int(), delta: z.string() }),
  z.object({ type: z.literal("message.snapshot"), turnId: z.string(), seq: z.number().int(), content: z.string() })
]);
z.object({
  thread: AgentThreadSchema,
  events: z.array(ThreadEventSchema),
  cursor: z.number().int(),
  activeTurnId: z.string().nullable()
});
z.object({
  threadId: z.string(),
  turnId: z.string()
});
z.object({ turnId: z.string() });
const AskAiTurnRequestSchema = z.object({
  userId: z.string().min(1),
  threadId: z.string().min(1),
  mastraThreadId: z.string().min(1),
  turnId: z.string().min(1),
  message: MessageContentSchema,
  locale: z.string().max(10).optional(),
  userName: z.string().max(200).optional()
});
z.discriminatedUnion("type", [
  z.object({ type: z.literal("text-delta"), delta: z.string() }),
  z.object({
    type: z.literal("finish"),
    text: z.string(),
    modelId: z.string(),
    usage: z.object({ inputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative() })
  }),
  z.object({ type: z.literal("error"), code: z.string(), message: z.string() })
]);
const ThreadTitleRequestSchema = z.object({
  userId: z.string().min(1),
  messages: z.array(z.string().max(ASK_AI_MESSAGE_MAX_LENGTH)).min(1).max(5),
  locale: z.string().max(10).optional()
});
z.object({ title: z.string().min(1).max(100) });

function safeTokenEqual(provided, expected) {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
function redactToken(token) {
  if (!token) return "(none)";
  return token.length <= 8 ? "****" : `${token.slice(0, 4)}\u2026${token.slice(-4)}`;
}

function getMastra(c) {
  return c.get("mastra");
}
function rejectIfNotInternal(c, routeName) {
  const provided = c.req.header("x-internal-service-token") ?? "";
  if (provided && safeTokenEqual(provided, getConfig().internalToken)) return null;
  getMastra(c).getLogger().warn(`${routeName}: rejected invalid internal token`, { tokenPreview: redactToken(provided || void 0) });
  return c.json({ error: "unauthorized" }, 401);
}
async function readBody(c, schema) {
  let raw;
  try {
    raw = await c.req.json();
  } catch {
    return { ok: false, response: c.json({ error: "invalid_json" }, 400) };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, response: c.json({ error: "validation_error", issues: parsed.error.issues }, 400) };
  return { ok: true, data: parsed.data };
}
function readUsage(usage) {
  const u = usage ?? {};
  const pick = (...keys) => {
    for (const key of keys) {
      const value = u[key];
      if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.round(value));
      if (value && typeof value === "object" && typeof value.total === "number") {
        return Math.max(0, Math.round(value.total));
      }
    }
    return 0;
  };
  return { inputTokens: pick("inputTokens", "promptTokens"), outputTokens: pick("outputTokens", "completionTokens") };
}
function textDelta(chunk) {
  if (chunk.type !== "text-delta") return null;
  const payload = chunk.payload ?? chunk;
  for (const key of ["text", "delta", "textDelta"]) {
    if (typeof payload[key] === "string") return payload[key];
  }
  return null;
}

function buildTurnSystemContext(body) {
  const lines = [`Current date (UTC): ${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}`];
  if (body.userName) lines.push(`The user's display name is ${body.userName}.`);
  if (body.locale) lines.push(`The user's interface language is "${body.locale}"; reply in the language the user writes in.`);
  return lines.join("\n");
}
const askAiTurnStreamRoute = registerApiRoute("/internal/agents/ask-ai/turn/stream", {
  method: "POST",
  requiresAuth: false,
  handler: async (c) => {
    const unauthorized = rejectIfNotInternal(c, "Ask AI turn");
    if (unauthorized) return unauthorized;
    const parsed = await readBody(c, AskAiTurnRequestSchema);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;
    const mastra = getMastra(c);
    const logger = mastra.getLogger();
    const agent = mastra.getAgent(ASK_AI_AGENT_ID);
    const config = getConfig();
    const signal = c.req.raw.signal;
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (frame) => controller.enqueue(encoder.encode(`${JSON.stringify(frame)}
`));
        const startedAt = Date.now();
        try {
          const result = await agent.stream(body.message, {
            memory: { thread: body.mastraThreadId, resource: body.userId },
            system: buildTurnSystemContext(body),
            maxSteps: config.askAi.maxSteps,
            abortSignal: signal
          });
          let streamed = "";
          for await (const chunk of result.fullStream) {
            const delta = textDelta(chunk);
            if (delta) {
              streamed += delta;
              send({ type: "text-delta", delta });
            } else if (chunk.type === "error") {
              const error = chunk.payload?.error;
              throw error instanceof Error ? error : new Error(String(error ?? "Model stream error"));
            }
          }
          const [text, usage] = await Promise.all([result.text, result.totalUsage]);
          const modelId = config.models.provider === "mock" ? "mock-chat" : config.models.chat;
          send({ type: "finish", text: text || streamed, modelId, usage: readUsage(usage) });
          logger.info("Ask AI turn completed", { turnId: body.turnId, durationMs: Date.now() - startedAt, ...readUsage(usage) });
        } catch (error) {
          if (signal.aborted) {
            logger.info("Ask AI turn aborted by caller", { turnId: body.turnId });
          } else {
            const message = error instanceof Error ? error.message : String(error);
            logger.error("Ask AI turn failed", { turnId: body.turnId, error: message });
            send({ type: "error", code: "model_error", message: "The model failed to produce an answer." });
          }
        } finally {
          try {
            controller.close();
          } catch {
          }
        }
      }
    });
    return new Response(stream, {
      status: 200,
      headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" }
    });
  }
});

const livenessRoute = registerApiRoute("/health/live", {
  method: "GET",
  requiresAuth: false,
  handler: async (c) => c.json({ status: "ok" })
});
const internalHealthRoute = registerApiRoute("/internal/agents/health", {
  method: "GET",
  requiresAuth: false,
  handler: async (c) => {
    const unauthorized = rejectIfNotInternal(c, "Agents health");
    if (unauthorized) return unauthorized;
    const mastra = getMastra(c);
    return c.json({ status: "ok", agents: Object.keys(mastra.listAgents?.() ?? {}) });
  }
});

const TitleOutputSchema = z.object({ title: z.string().min(1) });
function buildTitlePrompt(body) {
  return [
    "Write a title for a conversation that starts with these user messages:",
    ...body.messages.map((m, i) => `${i + 1}. ${m.slice(0, 1e3)}`),
    body.locale ? `Interface language hint: ${body.locale}` : ""
  ].filter(Boolean).join("\n");
}
const threadTitleRoute = registerApiRoute("/internal/agents/thread-title/generate", {
  method: "POST",
  requiresAuth: false,
  handler: async (c) => {
    const unauthorized = rejectIfNotInternal(c, "Thread title");
    if (unauthorized) return unauthorized;
    const parsed = await readBody(c, ThreadTitleRequestSchema);
    if (!parsed.ok) return parsed.response;
    const mastra = getMastra(c);
    try {
      const result = await mastra.getAgent(THREAD_TITLE_AGENT_ID).generate(buildTitlePrompt(parsed.data), {
        structuredOutput: { schema: TitleOutputSchema }
      });
      const fromObject = TitleOutputSchema.safeParse(result.object);
      const title = cleanThreadTitle(fromObject.success ? fromObject.data.title : result.text ?? "");
      if (!title) return c.json({ error: "empty_title" }, 422);
      return c.json({ title }, 200);
    } catch (error) {
      mastra.getLogger().error("Thread title generation failed", { error: error instanceof Error ? error.message : String(error) });
      return c.json({ error: "title_generation_failed" }, 502);
    }
  }
});

const isTestRuntime = () => process.env.VITEST === "true";
function getMastraStorage(config) {
  globalThis.__agentsPgStore ??= new PostgresStore({
    id: "agents-storage",
    connectionString: config.storage.url,
    schemaName: config.storage.schema,
    disableInit: isTestRuntime()
  });
  return globalThis.__agentsPgStore;
}

const config = getConfig();
const mastra = new Mastra({
  agents: {
    askAiAgent: createAskAiAgent(config, resolveModel(config, "chat")),
    threadTitleAgent: createThreadTitleAgent(resolveModel(config, "title"))
  },
  storage: getMastraStorage(config),
  logger: createAgentsLogger(config),
  server: {
    port: config.port,
    host: "0.0.0.0",
    apiRoutes: [livenessRoute, internalHealthRoute, askAiTurnStreamRoute, threadTitleRoute]
  }
});

export { currentTimeTool as c, mastra as m };
