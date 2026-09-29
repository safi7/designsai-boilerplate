/**
 * Redis/Valkey client factory shared by every service.
 *
 * One process usually needs more than one connection: a connection that has
 * issued SUBSCRIBE is locked into subscriber mode and can no longer run normal
 * commands, so pub/sub consumers get a dedicated client.
 */
import { Redis, Cluster } from 'iovalkey';
import type { Logger } from '@boilerplate/shared-logger';
export type RedisClient = Redis | Cluster;
export interface RedisConfig {
    url: string;
    nodeEnv?: string;
    /** Force cluster mode. Auto-detected from ElastiCache configuration endpoints when omitted. */
    clusterMode?: boolean;
}
export interface RedisClients {
    /** General purpose commands (GET/SET/EVAL/PUBLISH). */
    redis: RedisClient;
    /** Dedicated SUBSCRIBE connection. */
    subscriber: RedisClient;
}
export declare function isClusterUrl(url: string): boolean;
export declare function createRedisClients(config: RedisConfig, logger?: Logger): RedisClients;
export declare function closeRedisClients(clients: RedisClients, logger?: Logger): Promise<void>;
//# sourceMappingURL=redis.d.ts.map