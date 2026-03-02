import { describe, it, expect } from 'vitest';
import { createLogger, defaultLogger } from '../../../src/core/logger.js';

describe('createLogger()', () => {
  it('returns a pino logger with an info method', () => {
    const logger = createLogger({ level: 'silent' });
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.debug).toBe('function');
  });

  it('sets the logger name to hiero-block-bridge', () => {
    const logger = createLogger({ level: 'silent' });
    // pino stores bindings that include the name
    expect((logger as any).bindings().name).toBe('hiero-block-bridge');
  });

  it('respects custom log level', () => {
    const logger = createLogger({ level: 'error' });
    expect(logger.level).toBe('error');
  });

  it('defaults to info level when no config', () => {
    const logger = createLogger();
    expect(logger.level).toBe('info');
  });

  it('accepts silent level', () => {
    const logger = createLogger({ level: 'silent' });
    expect(logger.level).toBe('silent');
  });
});

describe('defaultLogger', () => {
  it('is a valid pino logger instance', () => {
    expect(typeof defaultLogger.info).toBe('function');
    expect(typeof defaultLogger.error).toBe('function');
  });

  it('has info as default level', () => {
    expect(defaultLogger.level).toBe('info');
  });
});
