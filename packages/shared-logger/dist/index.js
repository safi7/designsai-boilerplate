import winston from 'winston';
/**
 * JSON.stringify that survives BigInt (Prisma ids), Error instances and
 * circular references. A logger must never throw while logging.
 */
export function safeStringify(obj) {
    const seen = new WeakSet();
    return JSON.stringify(obj, (_key, value) => {
        if (value instanceof Error) {
            return { name: value.name, message: value.message, stack: value.stack };
        }
        if (typeof value === 'bigint') {
            return value.toString();
        }
        if (typeof value === 'object' && value !== null) {
            if (seen.has(value))
                return '[Circular Reference]';
            seen.add(value);
        }
        return value;
    });
}
function resolveEnvironment(value) {
    return value === 'production' || value === 'test' ? value : 'development';
}
/**
 * Create a Winston logger with the platform-wide format:
 * - development: colourised single-line output for humans
 * - production:  one JSON object per line for log shippers
 * - test:        errors only, to keep test output readable
 */
export function createLogger(config) {
    const environment = config.environment ?? 'development';
    const level = config.level ?? (environment === 'development' ? 'debug' : 'info');
    const jsonFormat = winston.format.combine(winston.format.timestamp(), winston.format.errors({ stack: true }), winston.format.printf(info => {
        const { timestamp, level: lvl, message, service, ...meta } = info;
        return safeStringify({ timestamp, level: lvl, message, service: service ?? config.service, ...meta });
    }));
    const prettyFormat = winston.format.combine(winston.format.timestamp({ format: 'HH:mm:ss' }), winston.format.colorize(), winston.format.printf(({ timestamp, level: lvl, message, service, ...meta }) => {
        const suffix = Object.keys(meta).length > 0 ? ` ${safeStringify(meta)}` : '';
        return `${String(timestamp)} [${String(service ?? config.service)}] [${lvl}] ${String(message)}${suffix}`;
    }));
    const transports = [];
    if (config.enableConsole !== false) {
        transports.push(new winston.transports.Console({ format: environment === 'development' ? prettyFormat : jsonFormat }));
    }
    return winston.createLogger({
        level: environment === 'test' ? 'error' : level,
        format: jsonFormat,
        defaultMeta: { service: config.service },
        transports,
    });
}
/** Convenience wrapper: `createServiceLogger('api', { level: 'debug' })`. */
export function createServiceLogger(service, options = {}) {
    return createLogger({
        service,
        environment: options.environment ?? resolveEnvironment(process.env.NODE_ENV),
        level: options.level ?? process.env.LOG_LEVEL,
        enableConsole: options.enableConsole,
    });
}
/** Default process-wide logger for packages that are not bound to one service. */
export const log = createServiceLogger('default');
export default createLogger;
//# sourceMappingURL=index.js.map