/**
 * Shared test setup for HieroBlockBridge.
 *
 * Auto-loaded by Vitest via `setupFiles` in vitest.config.ts.
 * Provides silent loggers, common test constants, and helper factories.
 */

import { createLogger } from '../src/core/logger.js';
import type { BridgeConfig } from '../src/types/config.js';

// ---------------------------------------------------------------------------
// Silent logger (suppress pino output during tests)
// ---------------------------------------------------------------------------

/** A pino logger set to 'silent' — no output during tests. */
export const silentLogger = createLogger({ level: 'silent' });

// ---------------------------------------------------------------------------
// Common test constants
// ---------------------------------------------------------------------------

export const TEST_ACCOUNTS = {
  treasury: '0.0.2',
  node3: '0.0.3',
  node4: '0.0.4',
  feeCollector: '0.0.98',
  testAccount: '0.0.100',
  alice: '0.0.1001',
  bob: '0.0.1002',
  charlie: '0.0.1003',
} as const;

export const TEST_TRANSACTION_IDS = {
  transfer: '0.0.1001@1709000000.000000000',
  tokenMint: '0.0.1002@1709000001.000000000',
  contractCall: '0.0.1001@1709000002.000000000',
  topicSubmit: '0.0.1003@1709000003.000000000',
  failed: '0.0.1001@1709000004.000000000',
} as const;

export const TEST_TOKEN_IDS = {
  fungible: '0.0.5000',
  nft: '0.0.5001',
} as const;

export const TEST_TOPIC_IDS = {
  main: '0.0.6000',
} as const;

export const TEST_CONTRACT_IDS = {
  storage: '0.0.7000',
} as const;

// ---------------------------------------------------------------------------
// Config factory helpers
// ---------------------------------------------------------------------------

/** Create a minimal valid BridgeConfig for testing. */
export function createTestBridgeConfig(
  overrides?: Partial<BridgeConfig>,
): BridgeConfig {
  return {
    network: 'testnet',
    fallback: 'auto',
    ...overrides,
  };
}

/** Create a mock stream config for unit tests. */
export function createTestStreamConfig(overrides?: Record<string, unknown>) {
  return {
    blockIntervalMs: 50,
    transactionsPerBlock: 3,
    network: 'testnet' as const,
    startBlockNumber: 0,
    logger: silentLogger,
    ...overrides,
  };
}

/** Create a mock query simulator config for unit tests. */
export function createTestQueryConfig(stream: unknown) {
  return {
    stream,
    logger: silentLogger,
  };
}

// ---------------------------------------------------------------------------
// Helper utilities
// ---------------------------------------------------------------------------

/** Wait for a specified number of milliseconds. */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Generate a deterministic hex string of the given byte length. */
export function fakeHex(bytes: number, seed = 0): string {
  return Array.from({ length: bytes }, (_, i) =>
    ((i + seed) % 256).toString(16).padStart(2, '0'),
  ).join('');
}

/** Generate a fake ISO timestamp offset from a base time. */
export function fakeTimestamp(offsetSeconds = 0): string {
  const base = new Date('2026-01-15T00:00:00.000Z');
  return new Date(base.getTime() + offsetSeconds * 1000).toISOString();
}
