import { PostgresStore } from '@mastra/pg';
import type { AgentsConfig } from '../lib/config.js';

declare global {
  var __agentsPgStore: PostgresStore | undefined;
}

export const isTestRuntime = () => process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';

/**
 * Mastra's own storage (threads, messages, working memory). One pool per
 * process, reused across `mastra dev` hot reloads via globalThis.
 */
export function getMastraStorage(config: AgentsConfig): PostgresStore {
  globalThis.__agentsPgStore ??= new PostgresStore({
    id: 'agents-storage',
    connectionString: config.storage.url,
    schemaName: config.storage.schema,
    disableInit: isTestRuntime(),
  });
  return globalThis.__agentsPgStore;
}
