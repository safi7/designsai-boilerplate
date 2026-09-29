/**
 * Redis/Valkey client factory shared by every service.
 *
 * One process usually needs more than one connection: a connection that has
 * issued SUBSCRIBE is locked into subscriber mode and can no longer run normal
 * commands, so pub/sub consumers get a dedicated client.
 */
import { Redis, Cluster } from 'iovalkey';
const BASE_OPTIONS = {
    enableReadyCheck: false,
    maxRetriesPerRequest: null,
    lazyConnect: true,
    connectTimeout: 10_000,
    commandTimeout: 30_000,
    keepAlive: 30_000,
};
export function isClusterUrl(url) {
    return url.includes('clustercfg.') || url.includes('configuration-endpoint') || url.includes('.cfg.');
}
function decodePassword(url) {
    if (!url.password)
        return undefined;
    try {
        return decodeURIComponent(url.password);
    }
    catch {
        return url.password;
    }
}
function createClient(config, logger) {
    const clusterMode = config.clusterMode ?? isClusterUrl(config.url);
    if (!clusterMode) {
        return new Redis(config.url, { ...BASE_OPTIONS, tls: config.url.startsWith('rediss://') ? {} : undefined });
    }
    const url = new URL(config.url);
    return new Cluster([{ host: url.hostname, port: Number(url.port) || 6379 }], {
        enableReadyCheck: true,
        lazyConnect: true,
        enableOfflineQueue: true,
        dnsLookup: (address, callback) => callback(null, address),
        redisOptions: { ...BASE_OPTIONS, password: decodePassword(url), tls: {} },
        clusterRetryStrategy: (times) => {
            if (times <= 5)
                logger?.debug(`Redis cluster retry attempt ${times}`);
            return Math.min(times * 200, 2000);
        },
    });
}
function attachLogging(client, name, config, logger) {
    client.on('ready', () => logger?.info(`Redis ready (${name})`));
    client.on('close', () => logger?.debug(`Redis connection closed (${name})`));
    client.on('error', (err) => {
        if (config.nodeEnv !== 'test')
            logger?.error(`Redis connection error (${name})`, { error: err.message });
    });
}
export function createRedisClients(config, logger) {
    const redis = createClient(config, logger);
    const subscriber = createClient(config, logger);
    // Many concurrent SSE streams subscribe on one connection; the default of 10
    // listeners would print spurious leak warnings.
    subscriber.setMaxListeners(0);
    attachLogging(redis, 'main', config, logger);
    attachLogging(subscriber, 'subscriber', config, logger);
    return { redis, subscriber };
}
export async function closeRedisClients(clients, logger) {
    try {
        await Promise.all([clients.redis.quit(), clients.subscriber.quit()]);
        logger?.info('Redis connections closed');
    }
    catch (error) {
        logger?.warn('Error while closing Redis connections', { error: error instanceof Error ? error.message : String(error) });
    }
}
//# sourceMappingURL=redis.js.map