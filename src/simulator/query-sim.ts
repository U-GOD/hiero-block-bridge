import { z } from 'zod';
import { createLogger } from '../core/logger.js';
import { HieroBridgeError, ErrorCode } from '../types/errors.js';
import { ok, err } from '../types/result.js';
import type pino from 'pino';
import type { Result } from '../types/result.js';
import type {
  Block,
  EventTransaction,
  StateProof,
  AccountBalance,
  StateChange,
} from '../types/block.js';
import type { MockBlockStream } from './mock-stream.js';

// ---------------------------------------------------------------------------
// Input validation schemas
// ---------------------------------------------------------------------------

/** Validates a Hedera account ID format (e.g., "0.0.12345"). */
const AccountIdSchema = z
  .string()
  .regex(/^\d+\.\d+\.\d+$/, 'Invalid account ID format. Expected: 0.0.12345');

/** Validates a Hedera transaction ID format (e.g., "0.0.12345@1709000000.000000000"). */
const TransactionIdSchema = z
  .string()
  .regex(
    /^\d+\.\d+\.\d+@\d+\.\d+$/,
    'Invalid transaction ID format. Expected: 0.0.12345@1709000000.000000000',
  );

/** Validates a block number (non-negative integer). */
const BlockNumberSchema = z.number().int().nonnegative('Block number must be non-negative');

// ---------------------------------------------------------------------------
// QuerySimulator
// ---------------------------------------------------------------------------

/**
 * QuerySimulator — simulates Block Node query endpoints using in-memory data.
 *
 * This class provides the same query interface that a real Block Node would
 * expose, but backed by data generated from a {@link MockBlockStream}. This
 * lets developers build and test query logic without running real infrastructure.
 *
 * The simulator maintains internal indexes for fast lookups by block number,
 * transaction ID, and account ID.
 *
 * @example
 * ```typescript
 * import { MockBlockStream, QuerySimulator } from 'hiero-block-bridge';
 *
 * const stream = new MockBlockStream({ transactionsPerBlock: 5 });
 * const query = new QuerySimulator({ stream });
 *
 * await stream.start();
 * // Wait for some blocks...
 *
 * const block = query.getBlock(1);
 * if (block.ok) {
 *   console.log(`Block #1 has ${block.value.items.length} items`);
 * }
 *
 * const balance = query.getAccountBalance('0.0.100');
 * if (balance.ok) {
 *   console.log(`Balance: ${balance.value.hbars} ℏ`);
 * }
 * ```
 */
export class QuerySimulator {
  private readonly stream: MockBlockStream;
  private readonly logger: pino.Logger;

  /**
   * Index: transaction ID → EventTransaction.
   * Built incrementally as new blocks arrive from the stream.
   */
  private readonly txIndex = new Map<string, EventTransaction>();

  /**
   * Index: account ID → latest balance in tinybars.
   * Computed from HBAR transfer lists across all transactions.
   */
  private readonly balanceIndex = new Map<string, number>();

  /**
   * Index: account ID → list of state changes affecting that account.
   * Used to generate state proofs.
   */
  private readonly stateIndex = new Map<string, StateChange[]>();

  /** Tracks the last block number we've indexed. */
  private lastIndexedBlock = -1;

  constructor(config: { stream: MockBlockStream; logger?: pino.Logger }) {
    this.stream = config.stream;
    this.logger = config.logger ?? createLogger({ level: 'info' });

    // Seed some default account balances so queries work even before
    // the stream generates blocks containing those accounts.
    this.seedDefaultBalances();
  }

  // -----------------------------------------------------------------------
  // Public query methods
  // -----------------------------------------------------------------------

  /**
   * Get a block by its number.
   *
   * @param blockNumber - The sequential block number to retrieve.
   * @returns The block if found, or an error.
   *
   * @example
   * ```typescript
   * const result = query.getBlock(5);
   * if (result.ok) {
   *   console.log(result.value.header.hash);
   * } else {
   *   console.error(result.error.message);
   * }
   * ```
   */
  getBlock(blockNumber: number): Result<Block, HieroBridgeError> {
    // Validate input
    const parsed = BlockNumberSchema.safeParse(blockNumber);
    if (!parsed.success) {
      return err(
        new HieroBridgeError(ErrorCode.INVALID_BLOCK_NUMBER, parsed.error.message),
      );
    }

    // Refresh our indexes from any new blocks the stream has generated
    this.refreshIndexes();

    const block = this.stream.getBlock(blockNumber);
    if (!block) {
      return err(
        new HieroBridgeError(
          ErrorCode.QUERY_FAILED,
          `Block #${blockNumber} not found. Stream has generated ${this.stream.getBlocks().length} blocks so far.`,
          { blockNumber, availableBlocks: this.stream.getBlocks().length },
        ),
      );
    }

    this.logger.debug({ blockNumber }, 'Block queried');
    return ok(block);
  }

  /**
   * Get a transaction by its ID.
   *
   * @param transactionId - The unique transaction ID (e.g., "0.0.12345@1709000000.000000000").
   * @returns The transaction if found, or an error.
   *
   * @example
   * ```typescript
   * const result = query.getTransaction('0.0.12345@1709000000.000000000');
   * if (result.ok) {
   *   console.log(`Type: ${result.value.type}, Fee: ${result.value.fee}`);
   * }
   * ```
   */
  getTransaction(transactionId: string): Result<EventTransaction, HieroBridgeError> {
    // Validate input
    const parsed = TransactionIdSchema.safeParse(transactionId);
    if (!parsed.success) {
      return err(
        new HieroBridgeError(ErrorCode.QUERY_FAILED, parsed.error.message),
      );
    }

    // Refresh our indexes
    this.refreshIndexes();

    const tx = this.txIndex.get(transactionId);
    if (!tx) {
      return err(
        new HieroBridgeError(
          ErrorCode.QUERY_FAILED,
          `Transaction "${transactionId}" not found. ${this.txIndex.size} transactions indexed so far.`,
          { transactionId, totalIndexed: this.txIndex.size },
        ),
      );
    }

    this.logger.debug({ transactionId }, 'Transaction queried');
    return ok(tx);
  }

  /**
   * Get a state proof for an entity.
   *
   * A state proof is a snapshot of an entity's state at a given block,
   * along with cryptographic evidence linking it to the block hash. In
   * this simulator the proof is generated from the latest known state
   * changes for the entity.
   *
   * @param entityId - The Hedera entity ID (e.g., "0.0.100").
   * @returns A state proof if the entity has been seen, or an error.
   *
   * @example
   * ```typescript
   * const result = query.getStateProof('0.0.100');
   * if (result.ok) {
   *   console.log(`Verified: ${result.value.verified}`);
   * }
   * ```
   */
  getStateProof(entityId: string): Result<StateProof, HieroBridgeError> {
    // Validate input
    const parsed = AccountIdSchema.safeParse(entityId);
    if (!parsed.success) {
      return err(
        new HieroBridgeError(ErrorCode.QUERY_FAILED, parsed.error.message),
      );
    }

    // Refresh our indexes
    this.refreshIndexes();

    const changes = this.stateIndex.get(entityId);
    const blocks = this.stream.getBlocks();
    const latestBlock = blocks.length > 0 ? blocks[blocks.length - 1] : undefined;

    // Build a state proof from the latest state change for this entity
    const latestChange = changes && changes.length > 0 ? changes[changes.length - 1] : undefined;

    const stateValue = latestChange
      ? latestChange.newValue
      : String(this.balanceIndex.get(entityId) ?? 0);

    const proof: StateProof = {
      entityId,
      stateValue,
      atBlockNumber: latestBlock?.header.number ?? 0,
      timestamp: latestBlock?.header.timestamp ?? new Date().toISOString(),
      merklePath: [
        randomHex(48), // Simulated merkle path node
        randomHex(48),
        randomHex(48),
      ],
      stateRootHash: latestBlock?.header.hash ?? randomHex(48),
      verified: true, // Simulated — always passes
    };

    this.logger.debug({ entityId, atBlock: proof.atBlockNumber }, 'State proof queried');
    return ok(proof);
  }

  /**
   * Get the balance of an account.
   *
   * The balance is computed by aggregating all HBAR transfers affecting
   * this account across all blocks generated by the stream. Accounts
   * that haven't appeared in any transaction get a default seeded balance.
   *
   * @param accountId - The Hedera account ID (e.g., "0.0.100").
   * @returns The account balance, or an error.
   *
   * @example
   * ```typescript
   * const result = query.getAccountBalance('0.0.100');
   * if (result.ok) {
   *   console.log(`${result.value.hbars} ℏ`);
   * }
   * ```
   */
  getAccountBalance(accountId: string): Result<AccountBalance, HieroBridgeError> {
    // Validate input
    const parsed = AccountIdSchema.safeParse(accountId);
    if (!parsed.success) {
      return err(
        new HieroBridgeError(ErrorCode.QUERY_FAILED, parsed.error.message),
      );
    }

    // Refresh our indexes
    this.refreshIndexes();

    const blocks = this.stream.getBlocks();
    const latestBlock = blocks.length > 0 ? blocks[blocks.length - 1] : undefined;

    // Look up the balance (default to a seeded value if never seen)
    const tinybars = this.balanceIndex.get(accountId) ?? this.seedBalance(accountId);

    const balance: AccountBalance = {
      accountId,
      balanceTinybars: Math.max(0, tinybars), // Clamp to non-negative
      hbars: tinybarToHbar(Math.max(0, tinybars)),
      tokens: [], // Token balances could be tracked separately in future
      atBlockNumber: latestBlock?.header.number,
      timestamp: latestBlock?.header.timestamp,
    };

    this.logger.debug({ accountId, hbars: balance.hbars }, 'Account balance queried');
    return ok(balance);
  }

  // -----------------------------------------------------------------------
  // Listing / search methods
  // -----------------------------------------------------------------------

  /**
   * Get the latest block generated by the stream.
   *
   * @returns The most recent block, or an error if no blocks exist.
   */
  getLatestBlock(): Result<Block, HieroBridgeError> {
    this.refreshIndexes();

    const blocks = this.stream.getBlocks();
    if (blocks.length === 0) {
      return err(
        new HieroBridgeError(
          ErrorCode.QUERY_FAILED,
          'No blocks available. Is the MockBlockStream running?',
        ),
      );
    }

    return ok(blocks[blocks.length - 1]);
  }

  /**
   * Get a range of blocks.
   *
   * @param from - Start block number (inclusive).
   * @param to - End block number (inclusive).
   * @returns Array of blocks in the range.
   */
  getBlockRange(from: number, to: number): Result<Block[], HieroBridgeError> {
    if (from < 0 || to < from) {
      return err(
        new HieroBridgeError(
          ErrorCode.INVALID_BLOCK_NUMBER,
          `Invalid range: from=${from}, to=${to}. "from" must be >= 0 and <= "to".`,
        ),
      );
    }

    this.refreshIndexes();

    const blocks = this.stream
      .getBlocks()
      .filter((b) => b.header.number >= from && b.header.number <= to);

    return ok(blocks as Block[]);
  }

  /**
   * Search for transactions by payer account ID.
   *
   * @param payerAccountId - The account that paid for the transactions.
   * @returns All matching transactions.
   */
  getTransactionsByAccount(
    payerAccountId: string,
  ): Result<EventTransaction[], HieroBridgeError> {
    const parsed = AccountIdSchema.safeParse(payerAccountId);
    if (!parsed.success) {
      return err(
        new HieroBridgeError(ErrorCode.QUERY_FAILED, parsed.error.message),
      );
    }

    this.refreshIndexes();

    const transactions = Array.from(this.txIndex.values()).filter(
      (tx) => tx.payerAccountId === payerAccountId,
    );

    return ok(transactions);
  }

  /**
   * Get summary statistics about the simulated data.
   */
  getStats(): {
    totalBlocks: number;
    totalTransactions: number;
    totalAccounts: number;
    latestBlockNumber: number;
  } {
    this.refreshIndexes();

    const blocks = this.stream.getBlocks();
    return {
      totalBlocks: blocks.length,
      totalTransactions: this.txIndex.size,
      totalAccounts: this.balanceIndex.size,
      latestBlockNumber: blocks.length > 0 ? blocks[blocks.length - 1].header.number : -1,
    };
  }

  // -----------------------------------------------------------------------
  // Indexing (private)
  // -----------------------------------------------------------------------

  /**
   * Refresh internal indexes from any new blocks the stream has generated
   * since we last checked. This is called lazily before each query.
   */
  private refreshIndexes(): void {
    const blocks = this.stream.getBlocks();

    for (const block of blocks) {
      // Skip blocks we've already indexed
      if (block.header.number <= this.lastIndexedBlock) continue;

      for (const item of block.items) {
        if (item.kind === 'transaction') {
          const tx = item.data;

          // Index by transaction ID
          this.txIndex.set(tx.transactionId, tx);

          // Update balance index from HBAR transfers
          for (const transfer of tx.transfers) {
            const current = this.balanceIndex.get(transfer.accountId) ?? 0;
            this.balanceIndex.set(transfer.accountId, current + transfer.amount);
          }
        } else if (item.kind === 'stateChange') {
          const change = item.data;

          // Index state changes by entity ID
          const existing = this.stateIndex.get(change.entityId) ?? [];
          existing.push(change);
          this.stateIndex.set(change.entityId, existing);
        }
      }

      this.lastIndexedBlock = block.header.number;
    }
  }

  /**
   * Seed default balances for well-known Hedera accounts so queries
   * return reasonable data even before the stream generates matching blocks.
   */
  private seedDefaultBalances(): void {
    // System accounts (0.0.1 through 0.0.100 are special on Hedera)
    this.balanceIndex.set('0.0.2', 5_000_000_000_000); // Treasury
    this.balanceIndex.set('0.0.3', 100_000_000_000);   // Node 0.0.3
    this.balanceIndex.set('0.0.4', 100_000_000_000);   // Node 0.0.4
    this.balanceIndex.set('0.0.5', 100_000_000_000);   // Node 0.0.5
    this.balanceIndex.set('0.0.98', 500_000_000_000);  // Fee collector
    this.balanceIndex.set('0.0.100', 50_000_000_000);  // Common test account
    this.balanceIndex.set('0.0.800', 200_000_000_000); // Staking reward account
  }

  /**
   * Generate a random but reasonable balance for an unseen account
   * and add it to the index.
   */
  private seedBalance(accountId: string): number {
    const balance = randomInt(1_000_000_000, 100_000_000_000); // 10–1000 HBAR
    this.balanceIndex.set(accountId, balance);
    return balance;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert tinybars to a human-readable HBAR string (1 HBAR = 100,000,000 tinybars). */
function tinybarToHbar(tinybars: number): string {
  const hbars = tinybars / 100_000_000;
  return hbars.toFixed(8);
}

/** Generate a random hex string of the given byte length (used for mock proofs). */
function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Generate a random integer between min (inclusive) and max (inclusive). */
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
