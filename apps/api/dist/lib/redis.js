import { createRedisClients } from '@boilerplate/shared-cache';
import { config } from './config.js';
import { log } from './logger.js';
/**
 * `redis` runs regular commands and PUBLISH; `redisSubscriber` is locked into
 * subscriber mode by the stream hub and must not be used for anything else.
 */
export const { redis, subscriber: redisSubscriber } = createRedisClients({ url: config.redisUrl, nodeEnv: config.env }, log);
//# sourceMappingURL=redis.js.map