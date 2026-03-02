import { describe, it, expect } from 'vitest';
import {
  NetworkNameSchema,
  NetworkConfigSchema,
  OperatorConfigSchema,
  SimulatorOptionsSchema,
  FallbackStrategySchema,
  LoggingConfigSchema,
  BridgeConfigSchema,
} from '../../../src/types/config.js';

// ---------------------------------------------------------------------------
// NetworkName
// ---------------------------------------------------------------------------

describe('NetworkNameSchema', () => {
  it('accepts all valid networks', () => {
    for (const net of ['mainnet', 'testnet', 'previewnet', 'local']) {
      expect(NetworkNameSchema.safeParse(net).success).toBe(true);
    }
  });

  it('rejects invalid network', () => {
    expect(NetworkNameSchema.safeParse('devnet').success).toBe(false);
    expect(NetworkNameSchema.safeParse('').success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// NetworkConfig
// ---------------------------------------------------------------------------

describe('NetworkConfigSchema', () => {
  it('accepts minimal config with network only', () => {
    const result = NetworkConfigSchema.safeParse({ network: 'testnet' });
    expect(result.success).toBe(true);
  });

  it('accepts full config with all optional fields', () => {
    const result = NetworkConfigSchema.safeParse({
      network: 'mainnet',
      mirrorNodeUrl: 'https://mainnet.mirrornode.hedera.com',
      blockNodeUrl: 'localhost:8080',
      customNodes: { '0.0.3': 'localhost:50211' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid mirrorNodeUrl', () => {
    const result = NetworkConfigSchema.safeParse({
      network: 'testnet',
      mirrorNodeUrl: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// OperatorConfig
// ---------------------------------------------------------------------------

describe('OperatorConfigSchema', () => {
  it('accepts valid operator credentials', () => {
    const result = OperatorConfigSchema.safeParse({
      accountId: '0.0.12345',
      privateKey: '302e020100300506032b6570042204200000',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid account ID format', () => {
    const result = OperatorConfigSchema.safeParse({
      accountId: 'invalid',
      privateKey: 'key',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty private key', () => {
    const result = OperatorConfigSchema.safeParse({
      accountId: '0.0.100',
      privateKey: '',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SimulatorOptions
// ---------------------------------------------------------------------------

describe('SimulatorOptionsSchema', () => {
  it('applies all defaults', () => {
    const result = SimulatorOptionsSchema.parse({});
    expect(result.blockIntervalMs).toBe(2000);
    expect(result.transactionsPerBlock).toBe(5);
    expect(result.enableStateProofs).toBe(false);
    expect(result.failureRate).toBe(0);
    expect(result.startBlockNumber).toBe(1);
  });

  it('accepts custom values', () => {
    const result = SimulatorOptionsSchema.parse({
      blockIntervalMs: 500,
      transactionsPerBlock: 10,
      enableStateProofs: true,
      failureRate: 0.1,
      startBlockNumber: 100,
    });
    expect(result.blockIntervalMs).toBe(500);
    expect(result.transactionsPerBlock).toBe(10);
    expect(result.enableStateProofs).toBe(true);
    expect(result.failureRate).toBe(0.1);
    expect(result.startBlockNumber).toBe(100);
  });

  it('rejects negative blockIntervalMs', () => {
    expect(SimulatorOptionsSchema.safeParse({ blockIntervalMs: -1 }).success).toBe(false);
  });

  it('rejects failureRate > 1', () => {
    expect(SimulatorOptionsSchema.safeParse({ failureRate: 1.5 }).success).toBe(false);
  });

  it('rejects failureRate < 0', () => {
    expect(SimulatorOptionsSchema.safeParse({ failureRate: -0.1 }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// FallbackStrategy
// ---------------------------------------------------------------------------

describe('FallbackStrategySchema', () => {
  it('accepts all valid strategies', () => {
    for (const s of ['auto', 'manual', 'disabled']) {
      expect(FallbackStrategySchema.safeParse(s).success).toBe(true);
    }
  });

  it('rejects invalid strategy', () => {
    expect(FallbackStrategySchema.safeParse('always').success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// LoggingConfig
// ---------------------------------------------------------------------------

describe('LoggingConfigSchema', () => {
  it('applies defaults', () => {
    const result = LoggingConfigSchema.parse({});
    expect(result.level).toBe('info');
    expect(result.pretty).toBe(false);
  });

  it('accepts all valid log levels', () => {
    for (const level of ['debug', 'info', 'warn', 'error', 'silent']) {
      expect(LoggingConfigSchema.safeParse({ level }).success).toBe(true);
    }
  });

  it('rejects invalid log level', () => {
    expect(LoggingConfigSchema.safeParse({ level: 'trace' }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// BridgeConfig (top-level)
// ---------------------------------------------------------------------------

describe('BridgeConfigSchema', () => {
  it('accepts minimal config', () => {
    const result = BridgeConfigSchema.safeParse({ network: 'testnet' });
    expect(result.success).toBe(true);
  });

  it('defaults fallback to auto', () => {
    const result = BridgeConfigSchema.parse({ network: 'testnet' });
    expect(result.fallback).toBe('auto');
  });

  it('accepts full config with all fields', () => {
    const result = BridgeConfigSchema.safeParse({
      network: 'mainnet',
      operatorId: '0.0.100',
      operatorKey: 'key123',
      mirrorNodeUrl: 'https://mainnet.mirrornode.hedera.com',
      blockNodeUrl: 'localhost:8080',
      simulator: { blockIntervalMs: 1000 },
      fallback: 'disabled',
      logging: { level: 'debug', pretty: true },
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid network', () => {
    expect(BridgeConfigSchema.safeParse({ network: 'fakenet' }).success).toBe(false);
  });

  it('rejects invalid mirrorNodeUrl', () => {
    const result = BridgeConfigSchema.safeParse({
      network: 'testnet',
      mirrorNodeUrl: 'not-valid',
    });
    expect(result.success).toBe(false);
  });
});
