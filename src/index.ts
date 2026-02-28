/**
 * HieroBlockBridge — a modular TypeScript library for simulating
 * and automating Hedera Block Node access (HIP-1056 / HIP-1081).
 *
 * @packageDocumentation
 */

// Types
export {
  type BlockHeader,
  type EventTransaction,
  type TransactionType,
  type StateChange,
  type BlockProof,
  type StateProof,
  type BlockItem,
  type Block,
  type BlockStreamEvents,
  type BlockStreamEvent,
  type AccountBalance,
  type ResponseCode,
  type TransactionReceipt,
  type ContractFunctionResult,
  type StateChangeType,
  type NetworkName,
  type NetworkConfig,
  type OperatorConfig,
  type SimulatorOptions,
  type FallbackStrategy,
  type LoggingConfig,
  type BridgeConfig,
  type Result,
  type Ok,
  type Err,
  ok,
  err,
  HieroBridgeError,
  ErrorCode,
  BlockHeaderSchema,
  EventTransactionSchema,
  TransactionTypeSchema,
  StateChangeSchema,
  BlockProofSchema,
  StateProofSchema,
  BlockItemSchema,
  BlockSchema,
  BlockStreamEventSchema,
  AccountBalanceSchema,
  ResponseCodeSchema,
  TransactionReceiptSchema,
  ContractFunctionResultSchema,
  StateChangeTypeSchema,
  NetworkNameSchema,
  NetworkConfigSchema,
  OperatorConfigSchema,
  SimulatorOptionsSchema,
  FallbackStrategySchema,
  LoggingConfigSchema,
  BridgeConfigSchema,
} from './types/index.js';

// Core
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

// Simulator
export { MockBlockStream } from './simulator/index.js';
export { QuerySimulator } from './simulator/index.js';
