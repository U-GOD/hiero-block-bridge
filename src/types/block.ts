import { z } from 'zod';

// ---------------------------------------------------------------------------
// Block Header (HIP-1056 §4.1 — Block Header)
// ---------------------------------------------------------------------------

/** Block metadata per HIP-1056 §4.1. */
export const BlockHeaderSchema = z.object({
  /** Sequential block number (0-indexed from genesis). */
  number: z.number().int().nonnegative(),
  /** SHA-384 hash of this block's contents (hex string). */
  hash: z.string().min(1),
  /** SHA-384 hash of the previous block. Empty string for genesis. */
  previousHash: z.string(),
  /** ISO-8601 consensus timestamp assigned by the network. */
  timestamp: z.string().datetime(),
  /** Number of items (transactions + state changes) in this block. */
  itemCount: z.number().int().nonnegative(),
  /** Hedera Services semantic version that produced this block (e.g., "0.74.0"). */
  softwareVersion: z.string().optional(),
  /** Hash algorithm used. Always "SHA_384" for Hedera. */
  hashAlgorithm: z.literal('SHA_384').default('SHA_384'),
});

export type BlockHeader = z.infer<typeof BlockHeaderSchema>;

// ---------------------------------------------------------------------------
// Transaction Types
// ---------------------------------------------------------------------------

/** Supported Hedera transaction body types (non-exhaustive). */
export const TransactionTypeSchema = z.enum([
  // Crypto
  'CryptoTransfer',
  'CryptoCreate',
  'CryptoUpdate',
  'CryptoDelete',
  'CryptoApproveAllowance',
  // Smart Contracts (EVM)
  'ContractCall',
  'ContractCreate',
  'ContractUpdate',
  'ContractDelete',
  // Tokens (HTS - Hedera Token Service)
  'TokenMint',
  'TokenBurn',
  'TokenTransfer',
  'TokenCreate',
  'TokenAssociate',
  'TokenDissociate',
  'TokenFreeze',
  'TokenUnfreeze',
  'TokenPause',
  'TokenUnpause',
  // Consensus (HCS - Hedera Consensus Service)
  'ConsensusSubmitMessage',
  'ConsensusCreateTopic',
  'ConsensusUpdateTopic',
  'ConsensusDeleteTopic',
  // Files
  'FileCreate',
  'FileUpdate',
  'FileDelete',
  'FileAppend',
  // Scheduling
  'ScheduleCreate',
  'ScheduleSign',
  'ScheduleDelete',
]);

export type TransactionType = z.infer<typeof TransactionTypeSchema>;

// ---------------------------------------------------------------------------
// Transaction Result / Receipt
// ---------------------------------------------------------------------------

/** Response codes from the Hedera network. */
export const ResponseCodeSchema = z.enum([
  'SUCCESS',
  'INVALID_TRANSACTION',
  'PAYER_ACCOUNT_NOT_FOUND',
  'INVALID_SIGNATURE',
  'INSUFFICIENT_PAYER_BALANCE',
  'INSUFFICIENT_TX_FEE',
  'DUPLICATE_TRANSACTION',
  'ACCOUNT_DELETED',
  'CONTRACT_REVERT_EXECUTED',
  'RECEIPT_NOT_FOUND',
  'RECORD_NOT_FOUND',
  'INVALID_ACCOUNT_ID',
  'THROTTLED_AT_CONSENSUS',
  'BUSY',
  'UNKNOWN',
]);

export type ResponseCode = z.infer<typeof ResponseCodeSchema>;

/** Transaction receipt with status and created entity IDs. */
export const TransactionReceiptSchema = z.object({
  /** Result status code. */
  status: ResponseCodeSchema,
  /** Account ID created by a CryptoCreate transaction. */
  accountId: z.string().optional(),
  /** Contract ID created by a ContractCreate transaction. */
  contractId: z.string().optional(),
  /** Topic ID created by a ConsensusCreateTopic transaction. */
  topicId: z.string().optional(),
  /** Token ID created by a TokenCreate transaction. */
  tokenId: z.string().optional(),
  /** Running hash for HCS topics after a ConsensusSubmitMessage. */
  topicRunningHash: z.string().optional(),
  /** Sequence number for HCS topics after a ConsensusSubmitMessage. */
  topicSequenceNumber: z.number().int().nonnegative().optional(),
  /** Serial numbers minted by a TokenMint (NFT) transaction. */
  serialNumbers: z.array(z.number().int().positive()).optional(),
});

export type TransactionReceipt = z.infer<typeof TransactionReceiptSchema>;

// ---------------------------------------------------------------------------
// Contract Function Result
// ---------------------------------------------------------------------------

/** EVM contract execution result (for ContractCall/ContractCreate). */
export const ContractFunctionResultSchema = z.object({
  /** Contract that was called or created. */
  contractId: z.string().min(1),
  /** Raw bytes returned by the contract function (hex string). */
  result: z.string(),
  /** Error message if the contract reverted. */
  errorMessage: z.string().optional(),
  /** Gas used by the EVM execution. */
  gasUsed: z.number().int().nonnegative(),
  /** Gas limit provided in the transaction. */
  gas: z.number().int().nonnegative(),
  /** Amount of HBAR (in tinybars) sent to the contract. */
  amount: z.number().nonnegative().default(0),
  /** EVM address of the contract (hex string, 0x-prefixed). */
  evmAddress: z.string().optional(),
  /** Logs emitted during the contract execution. */
  logs: z
    .array(
      z.object({
        /** Contract that emitted the log. */
        contractId: z.string().min(1),
        /** Log data (hex string). */
        data: z.string(),
        /** Indexed log topics (hex strings). */
        topics: z.array(z.string()),
      }),
    )
    .default([]),
});

export type ContractFunctionResult = z.infer<typeof ContractFunctionResultSchema>;

// ---------------------------------------------------------------------------
// Event Transaction (HIP-1056 §4.2 — Event Transaction)
// ---------------------------------------------------------------------------

/** A complete transaction record within a block per HIP-1056 §4.2. */
export const EventTransactionSchema = z.object({
  /** Unique transaction ID (e.g., "0.0.12345@1709000000.000000000"). */
  transactionId: z.string().min(1),
  /** Type of transaction body. */
  type: TransactionTypeSchema,
  /** Account that submitted and paid for the transaction. */
  payerAccountId: z.string().min(1),
  /** Transaction receipt with status and created entity IDs. */
  receipt: TransactionReceiptSchema,
  /** Transaction fee charged in tinybars (1 HBAR = 100,000,000 tinybars). */
  fee: z.number().nonnegative(),
  /** ISO-8601 consensus timestamp assigned by the hashgraph. */
  consensusTimestamp: z.string().datetime(),
  /** Valid start timestamp of the transaction. */
  validStartTimestamp: z.string().datetime(),
  /** Optional memo attached to the transaction (max 100 bytes). */
  memo: z.string().max(100).optional(),
  /** Maximum fee the payer was willing to pay (in tinybars). */
  maxFee: z.number().nonnegative().optional(),
  /** Duration in seconds this transaction is valid for (from valid start). */
  validDurationSeconds: z.number().int().positive().default(120),
  /** Node account that submitted this transaction to the network. */
  nodeAccountId: z.string().optional(),
  /** Transfer list showing HBAR movements (payer → recipient). */
  transfers: z
    .array(
      z.object({
        accountId: z.string().min(1),
        amount: z.number(), // Negative = debit, positive = credit
      }),
    )
    .default([]),
  /** Token transfer list for HTS token movements. */
  tokenTransfers: z
    .array(
      z.object({
        tokenId: z.string().min(1),
        accountId: z.string().min(1),
        amount: z.number(),
      }),
    )
    .default([]),
  /** Contract function result (present for ContractCall/ContractCreate). */
  contractResult: ContractFunctionResultSchema.optional(),
  /** Transaction hash (SHA-384, hex string). */
  transactionHash: z.string().optional(),
});

export type EventTransaction = z.infer<typeof EventTransactionSchema>;

// ---------------------------------------------------------------------------
// State Change (HIP-1056 §4.3 — State Changes)
// ---------------------------------------------------------------------------

/** Categories of state that can change on the Hedera network. */
export const StateChangeTypeSchema = z.enum([
  'BALANCE',
  'NONCE',
  'STORAGE',
  'TOKEN_BALANCE',
  'TOKEN_ASSOCIATION',
  'ALLOWANCE',
  'STAKING_INFO',
  'CONTRACT_BYTECODE',
  'CONTRACT_STORAGE',
  'TOPIC_MESSAGE',
  'SCHEDULE_STATUS',
  'NFT_OWNERSHIP',
]);

export type StateChangeType = z.infer<typeof StateChangeTypeSchema>;

/** A state mutation caused by a transaction (HIP-1056 §4.3). */
export const StateChangeSchema = z.object({
  /** The entity affected (account, token, contract, file, topic, etc.). */
  entityId: z.string().min(1),
  /** Category of state that changed. */
  changeType: StateChangeTypeSchema,
  /** Previous value (stringified). Empty string for newly created state. */
  previousValue: z.string(),
  /** New value (stringified). */
  newValue: z.string(),
  /** Transaction ID that caused this change. */
  transactionId: z.string().min(1),
  /** ISO-8601 consensus timestamp of the change. */
  consensusTimestamp: z.string().datetime(),
});

export type StateChange = z.infer<typeof StateChangeSchema>;

// ---------------------------------------------------------------------------
// Block Proof (HIP-1056 §4.4 — Block Proof)
// ---------------------------------------------------------------------------

/** Cryptographic proof of block integrity (HIP-1056 §4.4). */
export const BlockProofSchema = z.object({
  /** Block number this proof applies to. */
  blockNumber: z.number().int().nonnegative(),
  /** SHA-384 hash of the block being proven. */
  blockHash: z.string().min(1),
  /** The network's running hash after this block. */
  previousBlockRunningHash: z.string().optional(),
  /** Merkle root hash for the block's contents. */
  merkleRoot: z.string().optional(),
  /** Signature bytes — hex-encoded (placeholder until hinTS TSS is deployed). */
  signature: z.string().min(1),
  /** Signing algorithm used. */
  signatureAlgorithm: z.enum(['RSA_3072', 'ECDSA_SECP256K1', 'ED25519', 'HINS_TSS']).optional(),
  /** Whether this proof has been cryptographically verified. */
  verified: z.boolean(),
});

export type BlockProof = z.infer<typeof BlockProofSchema>;

// ---------------------------------------------------------------------------
// State Proof
// ---------------------------------------------------------------------------

/** State proof for verifying individual entity state (HIP-1081 §5). */
export const StateProofSchema = z.object({
  /** Entity this proof is for (e.g., "0.0.100"). */
  entityId: z.string().min(1),
  /** The proven state value (stringified). */
  stateValue: z.string(),
  /** Block number at which this state was captured. */
  atBlockNumber: z.number().int().nonnegative(),
  /** ISO-8601 timestamp of the proof. */
  timestamp: z.string().datetime(),
  /** Merkle path from the state leaf to the block's state root. */
  merklePath: z.array(z.string()).default([]),
  /** State root hash at the given block number. */
  stateRootHash: z.string().optional(),
  /** Whether the proof passed cryptographic verification. */
  verified: z.boolean(),
});

export type StateProof = z.infer<typeof StateProofSchema>;

// ---------------------------------------------------------------------------
// Block Item (HIP-1056 §4 — Block Items)
// ---------------------------------------------------------------------------

/** A single entry within a block: transaction, state change, or system event. */
export const BlockItemSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('transaction'), data: EventTransactionSchema }),
  z.object({ kind: z.literal('stateChange'), data: StateChangeSchema }),
  z.object({
    kind: z.literal('systemEvent'),
    data: z.object({
      /** Type of system event. */
      eventType: z.enum([
        'EPOCH_CHANGE',
        'FREEZE_START',
        'FREEZE_ABORT',
        'STAKE_PERIOD_START',
        'MAINTENANCE',
      ]),
      /** ISO-8601 timestamp of the system event. */
      timestamp: z.string().datetime(),
      /** Human-readable description. */
      description: z.string().optional(),
    }),
  }),
]);

export type BlockItem = z.infer<typeof BlockItemSchema>;

// ---------------------------------------------------------------------------
// Block (HIP-1056 — Complete Block)
// ---------------------------------------------------------------------------

/** A complete block: header → items[] → proof. */
export const BlockSchema = z.object({
  /** Block header with metadata (number, hash, timestamp, etc.). */
  header: BlockHeaderSchema,
  /** Ordered list of items in this block. */
  items: z.array(BlockItemSchema),
  /** Block proof for integrity verification (may be absent in simulated blocks). */
  proof: BlockProofSchema.optional(),
  /** Total gas used by all contract transactions in this block. */
  gasUsed: z.number().int().nonnegative().default(0),
  /** Number of successful transactions in this block. */
  successfulTransactions: z.number().int().nonnegative().default(0),
  /** Number of failed transactions in this block. */
  failedTransactions: z.number().int().nonnegative().default(0),
});

export type Block = z.infer<typeof BlockSchema>;

// ---------------------------------------------------------------------------
// Block Stream Event (union type for event-driven consumption)
// ---------------------------------------------------------------------------

/** Tagged union for all Block Stream events (discriminated by `type`). */
export const BlockStreamEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('BLOCK_START'),
    header: BlockHeaderSchema,
  }),
  z.object({
    type: z.literal('BLOCK_ITEM'),
    item: BlockItemSchema,
    blockNumber: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal('BLOCK_END'),
    proof: BlockProofSchema.optional(),
    blockNumber: z.number().int().nonnegative(),
    summary: z.object({
      itemCount: z.number().int().nonnegative(),
      gasUsed: z.number().int().nonnegative(),
      successCount: z.number().int().nonnegative(),
      failCount: z.number().int().nonnegative(),
    }),
  }),
  z.object({
    type: z.literal('STREAM_ERROR'),
    error: z.string(),
    recoverable: z.boolean(),
    blockNumber: z.number().int().nonnegative().optional(),
  }),
  z.object({
    type: z.literal('STREAM_HEARTBEAT'),
    timestamp: z.string().datetime(),
    latestBlockNumber: z.number().int().nonnegative(),
  }),
]);

export type BlockStreamEvent = z.infer<typeof BlockStreamEventSchema>;

// ---------------------------------------------------------------------------
// Account Balance Response (for QuerySimulator)
// ---------------------------------------------------------------------------

/** Account balance response. */
export const AccountBalanceSchema = z.object({
  /** Account ID queried. */
  accountId: z.string().min(1),
  /** HBAR balance in tinybars. */
  balanceTinybars: z.number().nonnegative(),
  /** HBAR balance as a decimal string (e.g., "100.50"). */
  hbars: z.string(),
  /** Token balances held by this account. */
  tokens: z
    .array(
      z.object({
        tokenId: z.string().min(1),
        balance: z.number().nonnegative(),
        decimals: z.number().int().nonnegative(),
      }),
    )
    .default([]),
  /** Block number at which this balance was captured. */
  atBlockNumber: z.number().int().nonnegative().optional(),
  /** ISO-8601 timestamp of the balance snapshot. */
  timestamp: z.string().datetime().optional(),
});

export type AccountBalance = z.infer<typeof AccountBalanceSchema>;

// ---------------------------------------------------------------------------
// Block Stream Listener Events (TypedEventEmitter interface)
// ---------------------------------------------------------------------------

/** Events emitted by block stream subscriptions. */
export interface BlockStreamEvents {
  /** Emitted when a complete block has been assembled. */
  block: (block: Block) => void;
  /** Emitted for each transaction within a block. */
  transaction: (tx: EventTransaction) => void;
  /** Emitted for each state change within a block. */
  stateChange: (change: StateChange) => void;
  /** Emitted for each raw stream event (BLOCK_START, BLOCK_ITEM, etc.). */
  streamEvent: (event: BlockStreamEvent) => void;
  /** Emitted on heartbeats (stream is alive but no new blocks). */
  heartbeat: (latestBlockNumber: number) => void;
  /** Emitted when a non-fatal error occurs. */
  error: (error: Error) => void;
  /** Emitted when the stream is paused. */
  paused: () => void;
  /** Emitted when the stream resumes after a pause. */
  resumed: () => void;
  /** Emitted when the stream ends (graceful shutdown). */
  end: () => void;
}
