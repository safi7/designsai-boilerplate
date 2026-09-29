import winston from 'winston';
export type Logger = winston.Logger;
export type LogEnvironment = 'development' | 'production' | 'test';
export interface LoggerConfig {
    service: string;
    level?: string;
    environment?: LogEnvironment;
    enableConsole?: boolean;
}
/**
 * JSON.stringify that survives BigInt (Prisma ids), Error instances and
 * circular references. A logger must never throw while logging.
 */
export declare function safeStringify(obj: unknown): string;
/**
 * Create a Winston logger with the platform-wide format:
 * - development: colourised single-line output for humans
 * - production:  one JSON object per line for log shippers
 * - test:        errors only, to keep test output readable
 */
export declare function createLogger(config: LoggerConfig): Logger;
/** Convenience wrapper: `createServiceLogger('api', { level: 'debug' })`. */
export declare function createServiceLogger(service: string, options?: Omit<LoggerConfig, 'service'>): Logger;
/** Default process-wide logger for packages that are not bound to one service. */
export declare const log: winston.Logger;
export default createLogger;
//# sourceMappingURL=index.d.ts.map