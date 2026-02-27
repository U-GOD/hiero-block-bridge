// Types — Public type definitions for HieroBlockBridge
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
  // Zod schemas
  BlockHeaderSchema,
  EventTransactionSchema,
  TransactionTypeSchema,
  StateChangeSchema,
  BlockProofSchema,
  StateProofSchema,
  BlockItemSchema,
  BlockSchema,
} from './block.js';

export {
  // Config types
  type NetworkName,
  type NetworkConfig,
  type OperatorConfig,
  type SimulatorOptions,
  type FallbackStrategy,
  type LoggingConfig,
  type BridgeConfig,
  // Config schemas
  NetworkNameSchema,
  NetworkConfigSchema,
  OperatorConfigSchema,
  SimulatorOptionsSchema,
  FallbackStrategySchema,
  LoggingConfigSchema,
  BridgeConfigSchema,
} from './config.js';

export { type Result, type Ok, type Err, ok, err } from './result.js';

export { HieroBridgeError, ErrorCode } from './errors.js';
