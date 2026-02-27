import { z } from 'zod';

// ---------------------------------------------------------------------------
// Network configuration
// ---------------------------------------------------------------------------

/** Supported Hedera/Hiero networks. */
export const NetworkNameSchema = z.enum(['mainnet', 'testnet', 'previewnet', 'local']);

export type NetworkName = z.infer<typeof NetworkNameSchema>;

/** Network-specific configuration. */
export const NetworkConfigSchema = z.object({
  /** Network to connect to. */
  network: NetworkNameSchema,
  /** Mirror Node REST API base URL. */
  mirrorNodeUrl: z.string().url().optional(),
  /** Block Node gRPC endpoint. */
  blockNodeUrl: z.string().optional(),
  /** Custom consensus node endpoints (for local/custom setups). */
  customNodes: z.record(z.string(), z.string()).optional(),
});

export type NetworkConfig = z.infer<typeof NetworkConfigSchema>;

// ---------------------------------------------------------------------------
// Operator (account) configuration
// ---------------------------------------------------------------------------

/** Operator account credentials for submitting transactions. */
export const OperatorConfigSchema = z.object({
  /** Hedera account ID (e.g., "0.0.12345"). */
  accountId: z.string().regex(/^\d+\.\d+\.\d+$/, 'Must be a valid account ID (e.g., 0.0.12345)'),
  /** DER-encoded private key (hex string). */
  privateKey: z.string().min(1),
});

export type OperatorConfig = z.infer<typeof OperatorConfigSchema>;

// ---------------------------------------------------------------------------
// Simulator Options
// ---------------------------------------------------------------------------

/** Configuration for the MockBlockStream simulator. */
export const SimulatorOptionsSchema = z.object({
  /** Interval between blocks in milliseconds. Default: 2000 (matching Hedera's ~2s blocks). */
  blockIntervalMs: z.number().int().positive().default(2000),
  /** Number of transactions to generate per block. Default: 5. */
  transactionsPerBlock: z.number().int().positive().default(5),
  /** Include state proofs in generated blocks. Default: false. */
  enableStateProofs: z.boolean().default(false),
  /** Probability of injecting a failure (0-1). Default: 0. */
  failureRate: z.number().min(0).max(1).default(0),
  /** Starting block number. Default: 1. */
  startBlockNumber: z.number().int().nonnegative().default(1),
});

export type SimulatorOptions = z.infer<typeof SimulatorOptionsSchema>;

// ---------------------------------------------------------------------------
// Fallback Strategy
// ---------------------------------------------------------------------------

/**
 * Strategy for handling Block Node unavailability:
 * - `auto`: Automatically fall back to Mirror Node
 * - `manual`: Emit events but let the developer handle fallback
 * - `disabled`: No fallback; throw errors if Block Node is unavailable
 */
export const FallbackStrategySchema = z.enum(['auto', 'manual', 'disabled']);

export type FallbackStrategy = z.infer<typeof FallbackStrategySchema>;

// ---------------------------------------------------------------------------
// Logging configuration
// ---------------------------------------------------------------------------

/** Logging configuration. */
export const LoggingConfigSchema = z.object({
  /** Log level. Default: 'info'. */
  level: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),
  /** Pretty-print logs (for development). Default: false. */
  pretty: z.boolean().default(false),
});

export type LoggingConfig = z.infer<typeof LoggingConfigSchema>;

// ---------------------------------------------------------------------------
// Bridge Configuration (top-level)
// ---------------------------------------------------------------------------

/** Top-level configuration for creating a HieroBlockBridge instance. */
export const BridgeConfigSchema = z.object({
  /** Network configuration. */
  network: NetworkNameSchema,
  /** Operator account ID. Read from HEDERA_ACCOUNT_ID env var if not set. */
  operatorId: z.string().optional(),
  /** Operator private key. Read from HEDERA_PRIVATE_KEY env var if not set. */
  operatorKey: z.string().optional(),
  /** Mirror Node REST API URL. Auto-resolved by network if not set. */
  mirrorNodeUrl: z.string().url().optional(),
  /** Block Node endpoint. */
  blockNodeUrl: z.string().optional(),
  /** Simulator configuration. If provided, simulator mode is enabled. */
  simulator: SimulatorOptionsSchema.partial().optional(),
  /** Fallback strategy. Default: 'auto'. */
  fallback: FallbackStrategySchema.default('auto'),
  /** Logging configuration. */
  logging: LoggingConfigSchema.partial().optional(),
});

export type BridgeConfig = z.infer<typeof BridgeConfigSchema>;
