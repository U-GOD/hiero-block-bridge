import pino from 'pino';
import type { LoggingConfig } from '../types/config.js';

/**
 * Creates a configured pino logger instance for HieroBlockBridge.
 *
 * @param config - Logging configuration options.
 * @returns A pino logger instance.
 *
 * @example
 * ```typescript
 * const logger = createLogger({ level: 'debug', pretty: true });
 * logger.info({ accountId: '0.0.100' }, 'Balance checked');
 * ```
 */
export function createLogger(config?: Partial<LoggingConfig>): pino.Logger {
  const level = config?.level ?? 'info';
  const pretty = config?.pretty ?? false;

  const options: pino.LoggerOptions = {
    name: 'hiero-block-bridge',
    level,
    ...(pretty
      ? {
          transport: {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'SYS:standard',
              ignore: 'pid,hostname',
            },
          },
        }
      : {}),
  };

  return pino(options);
}

/** Default logger instance. */
export const defaultLogger = createLogger();
