import { registerApiRoute } from '@mastra/core/server';
import { getMastra, rejectIfNotInternal } from './shared.js';

/** Public liveness probe for the orchestrator; reveals nothing. */
export const livenessRoute = registerApiRoute('/health/live', {
  method: 'GET',
  requiresAuth: false,
  handler: async c => c.json({ status: 'ok' }),
});

/** Internal readiness: proves the agent registry and storage are usable. */
export const internalHealthRoute = registerApiRoute('/internal/agents/health', {
  method: 'GET',
  requiresAuth: false,
  handler: async c => {
    const unauthorized = rejectIfNotInternal(c, 'Agents health');
    if (unauthorized) return unauthorized;
    const mastra = getMastra(c);
    return c.json({ status: 'ok', agents: Object.keys(mastra.listAgents?.() ?? {}) });
  },
});
