import { z } from 'zod';

// ---------------------------------------------------------------------------
// Block Header
// ---------------------------------------------------------------------------

/** Zod schema for BlockHeader — metadata about a single block. */
export const BlockHeaderSchema = z.object({
  /** Sequential block number. */
  number: z.number().int().nonnegative(),
  /** Block hash (hex string). */
  hash: z.string().min(1),
  /** Previous block's hash (hex string). Empty string for genesis block. */
  previousHash: z.string(),
  /** ISO-8601 timestamp when the block was produced. */
  timestamp: z.string().datetime(),
  /** Number of items (transactions + state changes) in this block. */
  itemCount: z.number().int().nonnegative(),
});

export type BlockHeader = z.infer<typeof BlockHeaderSchema>;

// ---------------------------------------------------------------------------
// Event Transaction
// ---------------------------------------------------------------------------

/** Supported transaction types in the Hedera network. */
export const TransactionTypeSchema = z.enum([
  'CryptoTransfer',
  'CryptoCreate',
  'ContractCall',
  'ContractCreate',
  'TokenMint',
  'TokenBurn',
  'TokenTransfer',
  'ConsensusSubmitMessage',
  'FileCreate',
  'FileUpdate',
]);

export type TransactionType = z.infer<typeof TransactionTypeSchema>;

/** Zod schema for EventTransaction — a single transaction within a block. */
export const EventTransactionSchema = z.object({
  /** Unique transaction ID (e.g., "0.0.12345@1709000000.000000000"). */
  transactionId: z.string().min(1),
  /** Type of transaction. */
  type: TransactionTypeSchema,
  /** Account that submitted the transaction. */
  payerAccountId: z.string().min(1),
  /** Whether the transaction was successful. */
  status: z.enum(['SUCCESS', 'FAILED']),
  /** Transaction fee in tinybars. */
  fee: z.number().nonnegative(),
  /** ISO-8601 timestamp of the transaction. */
  timestamp: z.string().datetime(),
  /** Optional memo attached to the transaction. */
  memo: z.string().optional(),
});

export type EventTransaction = z.infer<typeof EventTransactionSchema>;

// ---------------------------------------------------------------------------
// State Change
// ---------------------------------------------------------------------------

/** Zod schema for StateChange — a state mutation caused by a transaction. */
export const StateChangeSchema = z.object({
  /** The entity affected (account, token, contract, etc.). */
  entityId: z.string().min(1),
  /** Type of state that changed. */
  changeType: z.enum(['BALANCE', 'NONCE', 'STORAGE', 'TOKEN_BALANCE', 'ALLOWANCE']),
  /** Previous value (stringified). */
  previousValue: z.string(),
  /** New value (stringified). */
  newValue: z.string(),
  /** Transaction ID that caused this change. */
  transactionId: z.string().min(1),
});

export type StateChange = z.infer<typeof StateChangeSchema>;

// ---------------------------------------------------------------------------
// Block Proof
// ---------------------------------------------------------------------------

/** Zod schema for BlockProof — cryptographic proof of block integrity. */
export const BlockProofSchema = z.object({
  /** Block number this proof applies to. */
  blockNumber: z.number().int().nonnegative(),
  /** Hash of the block being proven. */
  blockHash: z.string().min(1),
  /** Signature bytes (hex-encoded). */
  signature: z.string().min(1),
  /** Whether this proof has been verified. */
  verified: z.boolean(),
});

export type BlockProof = z.infer<typeof BlockProofSchema>;

// ---------------------------------------------------------------------------
// State Proof
// ---------------------------------------------------------------------------

/** Zod schema for StateProof — proof that a piece of state is authentic. */
export const StateProofSchema = z.object({
  /** Entity this proof is for. */
  entityId: z.string().min(1),
  /** The proven state value. */
  stateValue: z.string(),
  /** Block number at which this state was captured. */
  atBlockNumber: z.number().int().nonnegative(),
  /** ISO-8601 timestamp of the proof. */
  timestamp: z.string().datetime(),
  /** Whether the proof passed verification. */
  verified: z.boolean(),
});

export type StateProof = z.infer<typeof StateProofSchema>;

// ---------------------------------------------------------------------------
// Block Item & Block
// ---------------------------------------------------------------------------

/** A block item is either a transaction or a state change. */
export const BlockItemSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('transaction'), data: EventTransactionSchema }),
  z.object({ kind: z.literal('stateChange'), data: StateChangeSchema }),
]);

export type BlockItem = z.infer<typeof BlockItemSchema>;

/** A complete block as defined by HIP-1056 Block Streams. */
export const BlockSchema = z.object({
  /** Block header with metadata. */
  header: BlockHeaderSchema,
  /** Ordered list of items in this block. */
  items: z.array(BlockItemSchema),
  /** Block proof (may not be present for simulated blocks). */
  proof: BlockProofSchema.optional(),
});

export type Block = z.infer<typeof BlockSchema>;

// ---------------------------------------------------------------------------
// Block Stream Events
// ---------------------------------------------------------------------------

/** Events emitted by a Block Stream subscription. */
export interface BlockStreamEvents {
  /** Emitted when a new block is produced. */
  block: (block: Block) => void;
  /** Emitted for each transaction in a block. */
  transaction: (tx: EventTransaction) => void;
  /** Emitted for each state change in a block. */
  stateChange: (change: StateChange) => void;
  /** Emitted when an error occurs. */
  error: (error: Error) => void;
  /** Emitted when the stream ends. */
  end: () => void;
}
