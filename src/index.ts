/**
 * HieroBlockBridge
 *
 * A modular TypeScript library for simulating and automating
 * Hedera Block Node access per HIP-1056 (Block Streams) and
 * HIP-1081 (Block Nodes).
 *
 * @packageDocumentation
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export {
  // Block types
  type BlockHeader,
  type EventTransaction,
  type TransactionType,
  type StateChange,
  type BlockProof,
  type StateProof,
  type BlockItem,
  type Block,
  type BlockStreamEvents,
  // Config types
  type NetworkName,
  type NetworkConfig,
  type OperatorConfig,
  type SimulatorOptions,
  type FallbackStrategy,
  type LoggingConfig,
  type BridgeConfig,
  // Result monad
  type Result,
  type Ok,
  type Err,
  ok,
  err,
  // Error handling
  HieroBridgeError,
  ErrorCode,
  // Zod schemas
  BlockHeaderSchema,
  EventTransactionSchema,
  TransactionTypeSchema,
  StateChangeSchema,
  BlockProofSchema,
  StateProofSchema,
  BlockItemSchema,
  BlockSchema,
  NetworkNameSchema,
  NetworkConfigSchema,
  OperatorConfigSchema,
  SimulatorOptionsSchema,
  FallbackStrategySchema,
  LoggingConfigSchema,
  BridgeConfigSchema,
} from './types/index.js';

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------
export {
  HieroClient,
  type HieroClientConfig,
  createLogger,
  defaultLogger,
  TypedEventEmitter,
  resolveMirrorNodeUrl,
  resolveOperator,
  resolveNetworkForSdk,
} from './core/index.js';

// ---------------------------------------------------------------------------
// Modules (stubs — implementations coming in later phases)
// ---------------------------------------------------------------------------
// Simulator (Phase 2)
// export { MockBlockStream, QuerySimulator, MirrorNodeFallback } from './simulator/index.js';

// Automator (Phase 3)
// export { DockerManager, SoloRunner, checkBlockNodeHealth, waitForReady, checkHardware } from './automator/index.js';

// Migration (Phase 4)
// export { DeprecationDetector, ThrottleMonitor, DEPRECATION_RULES } from './migration/index.js';

// AI (Phase 7)
// export { ConfigTuner, CostOptimizer } from './ai/index.js';
