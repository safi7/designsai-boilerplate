import { serve } from '@hono/node-server';
import { closeRedisClients } from '@boilerplate/shared-cache';
import { createApp } from './app.js';
import { container } from './container.js';
import { initializeStorage } from './lib/storage.js';
import { sweepStaleTurns } from './services/agents/ask-ai/turn-runner.js';
const { config, log, prisma, redis, redisSubscriber, runner, events, hub } = container;
const STALE_TURN_SWEEP_MS = 60_000;
async function main() {
    await Promise.all([redis.connect(), redisSubscriber.connect()]);
    await prisma.$connect();
    await initializeStorage();
    const app = createApp(container);
    const server = serve({ fetch: app.fetch, port: config.port }, info => {
        log.info(`API listening on http://localhost:${info.port}`, { env: config.env, docs: config.docsEnabled ? `${config.app.apiUrl}/doc` : undefined });
    });
    const sweep = () => sweepStaleTurns({ prisma, events, hub, logger: log, config: config.askAi }).catch(error => log.warn('Stale turn sweep failed', { error: String(error) }));
    void sweep();
    const sweepTimer = setInterval(sweep, STALE_TURN_SWEEP_MS);
    let shuttingDown = false;
    const shutdown = async (signal) => {
        if (shuttingDown)
            return;
        shuttingDown = true;
        log.info(`${signal} received, shutting down`);
        clearInterval(sweepTimer);
        // Stop accepting connections, let in-flight turns settle, then close pools.
        server.close();
        await runner.shutdown();
        await closeRedisClients({ redis, subscriber: redisSubscriber }, log);
        await prisma.$disconnect();
        process.exit(0);
    };
    process.on('SIGTERM', () => void shutdown('SIGTERM'));
    process.on('SIGINT', () => void shutdown('SIGINT'));
}
main().catch(error => {
    log.error('API failed to start', { error: error instanceof Error ? error.stack : String(error) });
    process.exit(1);
});
//# sourceMappingURL=index.js.map