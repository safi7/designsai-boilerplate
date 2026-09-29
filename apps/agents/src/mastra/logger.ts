import { PinoLogger } from '@mastra/loggers';
import pino, { type LoggerOptions } from 'pino';
import pretty from 'pino-pretty';
import type { AgentsConfig } from '../lib/config.js';

type PinoLoggerInternalOptions = ConstructorParameters<typeof PinoLogger>[0] & { _logger: pino.Logger };

/** Mastra-compatible logger: pretty in development, JSON lines in production. */
export function createAgentsLogger(config: Pick<AgentsConfig, 'logLevel' | 'logFormat'>) {
  const base: LoggerOptions = { name: 'agents', level: config.logLevel, messageKey: 'msg', timestamp: pino.stdTimeFunctions.isoTime };
  const native =
    config.logFormat === 'pretty'
      ? pino(base, pretty({ colorize: true, singleLine: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' }))
      : pino(base);
  return new PinoLogger({ name: 'agents', level: config.logLevel, _logger: native } as PinoLoggerInternalOptions);
}
