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

const AccountIdSchema = z
  .string()
  .regex(/^\d+\.\d+\.\d+$/, 'Invalid account ID format. Expected: 0.0.12345');

const TransactionIdSchema = z
  .string()
  .regex(
    /^\d+\.\d+\.\d+@\d+\.\d+$/,
    'Invalid transaction ID format. Expected: 0.0.12345@1709000000.000000000',
  );

const BlockNumberSchema = z.number().int().nonnegative('Block number must be non-negative');

// ---------------------------------------------------------------------------
// QuerySimulator
// ---------------------------------------------------------------------------

/**
 * Simulates Block Node query endpoints using in-memory data from a
 * {@link MockBlockStream}. Provides the same interface a real Block Node
 * would expose, backed by locally generated mock data.
 *
 * @example
 * ```typescript
 * const stream = new MockBlockStream({ transactionsPerBlock: 5 });
 * const query = new QuerySimulator({ stream });
 *
 * await stream.start();
 *
 * const block = query.getBlock(1);
 * if (block.ok) {
 *   console.log(`Block #1: ${block.value.items.length} items`);
 * }
 * ```
 */
export class QuerySimulator {
  private readonly stream: MockBlockStream;
  private readonly logger: pino.Logger;

  /** Transaction ID → EventTransaction. */
  private readonly txIndex = new Map<string, EventTransaction>();

  /** Account ID → balance in tinybars. */
  private readonly balanceIndex = new Map<string, number>();

  /** Account ID → state changes affecting that account. */
  private readonly stateIndex = new Map<string, StateChange[]>();

  private lastIndexedBlock = -1;

  constructor(config: { stream: MockBlockStream; logger?: pino.Logger }) {
    this.stream = config.stream;
    this.logger = config.logger ?? createLogger({ level: 'info' });
    this.seedDefaultBalances();
  }

  // -----------------------------------------------------------------------
  // Public query methods
  // -----------------------------------------------------------------------

  /** Retrieve a block by number. */
  getBlock(blockNumber: number): Result<Block, HieroBridgeError> {
    const parsed = BlockNumberSchema.safeParse(blockNumber);
    if (!parsed.success) {
      return err(new HieroBridgeError(ErrorCode.INVALID_BLOCK_NUMBER, parsed.error.message));
    }

    this.refreshIndexes();

    const block = this.stream.getBlock(blockNumber);
    if (!block) {
      return err(
        new HieroBridgeError(
          ErrorCode.QUERY_FAILED,
          `Block #${blockNumber} not found. ${this.stream.getBlocks().length} blocks available.`,
          { blockNumber, availableBlocks: this.stream.getBlocks().length },
        ),
      );
    }

    this.logger.debug({ blockNumber }, 'Block queried');
    return ok(block);
  }

  /** Retrieve a transaction by its ID. */
  getTransaction(transactionId: string): Result<EventTransaction, HieroBridgeError> {
    const parsed = TransactionIdSchema.safeParse(transactionId);
    if (!parsed.success) {
      return err(new HieroBridgeError(ErrorCode.QUERY_FAILED, parsed.error.message));
    }

    this.refreshIndexes();

    const tx = this.txIndex.get(transactionId);
    if (!tx) {
      return err(
        new HieroBridgeError(
          ErrorCode.QUERY_FAILED,
          `Transaction "${transactionId}" not found. ${this.txIndex.size} transactions indexed.`,
          { transactionId, totalIndexed: this.txIndex.size },
        ),
      );
    }

    this.logger.debug({ transactionId }, 'Transaction queried');
    return ok(tx);
  }

  /** Generate a state proof for the given entity from the latest known state. */
  getStateProof(entityId: string): Result<StateProof, HieroBridgeError> {
    const parsed = AccountIdSchema.safeParse(entityId);
    if (!parsed.success) {
      return err(new HieroBridgeError(ErrorCode.QUERY_FAILED, parsed.error.message));
    }

    this.refreshIndexes();

    const changes = this.stateIndex.get(entityId);
    const blocks = this.stream.getBlocks();
    const latestBlock = blocks.length > 0 ? blocks[blocks.length - 1] : undefined;

    const latestChange = changes && changes.length > 0 ? changes[changes.length - 1] : undefined;

    const stateValue = latestChange
      ? latestChange.newValue
      : String(this.balanceIndex.get(entityId) ?? 0);

    const proof: StateProof = {
      entityId,
      stateValue,
      atBlockNumber: latestBlock?.header.number ?? 0,
      timestamp: latestBlock?.header.timestamp ?? new Date().toISOString(),
      merklePath: [randomHex(48), randomHex(48), randomHex(48)],
      stateRootHash: latestBlock?.header.hash ?? randomHex(48),
      verified: true,
    };

    this.logger.debug({ entityId, atBlock: proof.atBlockNumber }, 'State proof queried');
    return ok(proof);
  }

  /** Get the HBAR balance for an account, computed from transfer lists. */
  getAccountBalance(accountId: string): Result<AccountBalance, HieroBridgeError> {
    const parsed = AccountIdSchema.safeParse(accountId);
    if (!parsed.success) {
      return err(new HieroBridgeError(ErrorCode.QUERY_FAILED, parsed.error.message));
    }

    this.refreshIndexes();

    const blocks = this.stream.getBlocks();
    const latestBlock = blocks.length > 0 ? blocks[blocks.length - 1] : undefined;

    const tinybars = this.balanceIndex.get(accountId) ?? this.seedBalance(accountId);

    const balance: AccountBalance = {
      accountId,
      balanceTinybars: Math.max(0, tinybars),
      hbars: tinybarToHbar(Math.max(0, tinybars)),
      tokens: [],
      atBlockNumber: latestBlock?.header.number,
      timestamp: latestBlock?.header.timestamp,
    };

    this.logger.debug({ accountId, hbars: balance.hbars }, 'Account balance queried');
    return ok(balance);
  }

  // -----------------------------------------------------------------------
  // Listing / search
  // -----------------------------------------------------------------------

  /** Get the most recently generated block. */
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

  /** Get a range of blocks (inclusive). */
  getBlockRange(from: number, to: number): Result<Block[], HieroBridgeError> {
    if (from < 0 || to < from) {
      return err(
        new HieroBridgeError(
          ErrorCode.INVALID_BLOCK_NUMBER,
          `Invalid range: from=${from}, to=${to}.`,
        ),
      );
    }

    this.refreshIndexes();

    const blocks = this.stream
      .getBlocks()
      .filter((b) => b.header.number >= from && b.header.number <= to);

    return ok(blocks as Block[]);
  }

  /** Find all transactions submitted by a given payer account. */
  getTransactionsByAccount(
    payerAccountId: string,
  ): Result<EventTransaction[], HieroBridgeError> {
    const parsed = AccountIdSchema.safeParse(payerAccountId);
    if (!parsed.success) {
      return err(new HieroBridgeError(ErrorCode.QUERY_FAILED, parsed.error.message));
    }

    this.refreshIndexes();

    const transactions = Array.from(this.txIndex.values()).filter(
      (tx) => tx.payerAccountId === payerAccountId,
    );

    return ok(transactions);
  }

  /** Summary statistics for the simulated data. */
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

  /** Lazily index any new blocks generated since the last query. */
  private refreshIndexes(): void {
    const blocks = this.stream.getBlocks();

    for (const block of blocks) {
      if (block.header.number <= this.lastIndexedBlock) continue;

      for (const item of block.items) {
        if (item.kind === 'transaction') {
          const tx = item.data;
          this.txIndex.set(tx.transactionId, tx);

          for (const transfer of tx.transfers) {
            const current = this.balanceIndex.get(transfer.accountId) ?? 0;
            this.balanceIndex.set(transfer.accountId, current + transfer.amount);
          }
        } else if (item.kind === 'stateChange') {
          const change = item.data;
          const existing = this.stateIndex.get(change.entityId) ?? [];
          existing.push(change);
          this.stateIndex.set(change.entityId, existing);
        }
      }

      this.lastIndexedBlock = block.header.number;
    }
  }

  /** Pre-populate well-known system accounts with realistic balances. */
  private seedDefaultBalances(): void {
    this.balanceIndex.set('0.0.2', 5_000_000_000_000);   // Treasury
    this.balanceIndex.set('0.0.3', 100_000_000_000);      // Node 0.0.3
    this.balanceIndex.set('0.0.4', 100_000_000_000);      // Node 0.0.4
    this.balanceIndex.set('0.0.5', 100_000_000_000);      // Node 0.0.5
    this.balanceIndex.set('0.0.98', 500_000_000_000);     // Fee collector
    this.balanceIndex.set('0.0.100', 50_000_000_000);     // Common test account
    this.balanceIndex.set('0.0.800', 200_000_000_000);    // Staking reward account
  }

  /** Assign a random balance for a previously unseen account. */
  private seedBalance(accountId: string): number {
    const balance = randomInt(1_000_000_000, 100_000_000_000);
    this.balanceIndex.set(accountId, balance);
    return balance;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tinybarToHbar(tinybars: number): string {
  const hbars = tinybars / 100_000_000;
  return hbars.toFixed(8);
}

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
