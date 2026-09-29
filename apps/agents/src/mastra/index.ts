/**
 * Mastra runtime entry point (discovered by `mastra dev` / `mastra build`).
 *
 * This service is internal-only: the public API calls it over
 * `/internal/*` with a shared token. It owns model execution and
 * conversation memory; it never touches users, credits or the product DB.
 */
import { Mastra } from '@mastra/core/mastra';
import { getConfig } from '../lib/config.js';
import { createAskAiAgent } from './agents/ask-ai-agent.js';
import { createThreadTitleAgent } from './agents/thread-title-agent.js';
import { createAgentsLogger } from './logger.js';
import { resolveModel } from './models.js';
import { askAiTurnStreamRoute } from './routes/ask-ai-turn.js';
import { internalHealthRoute, livenessRoute } from './routes/health.js';
import { threadTitleRoute } from './routes/thread-title.js';
import { requireInternalToken } from './routes/shared.js';
import { getMastraStorage } from './storage.js';

const config = getConfig();

export const mastra = new Mastra({
  agents: {
    askAiAgent: createAskAiAgent(config, resolveModel(config, 'chat')),
    threadTitleAgent: createThreadTitleAgent(resolveModel(config, 'title')),
  },
  storage: getMastraStorage(config),
  logger: createAgentsLogger(config),
  server: {
    port: config.port,
    host: '0.0.0.0',
    apiRoutes: [livenessRoute, internalHealthRoute, askAiTurnStreamRoute, threadTitleRoute],
    // Mastra also serves its own built-in API (/api/agents, /api/memory/…),
    // which would let anyone who can reach this port read every user's
    // conversation memory and run the model on our key. Require the internal
    // token there too. Our own routes above are `requiresAuth: false`, so Mastra
    // skips this middleware for them and they check the token themselves.
    middleware: [requireInternalToken(config)],
  },
});
