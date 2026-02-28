import { TypedEventEmitter } from '../core/events.js';
import { createLogger } from '../core/logger.js';
import { SimulatorOptionsSchema } from '../types/config.js';
import { HieroBridgeError, ErrorCode } from '../types/errors.js';
import type pino from 'pino';
import type { SimulatorOptions } from '../types/config.js';
import type {
  Block,
  BlockHeader,
  BlockItem,
  BlockProof,
  EventTransaction,
  StateChange,
  BlockStreamEvent,
  BlockStreamEvents,
  TransactionType,
  StateChangeType,
} from '../types/block.js';

// ---------------------------------------------------------------------------
// Random data helpers
// ---------------------------------------------------------------------------

/** Generate a random hex string of the given byte length. */
function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Pick a random element from an array. */
function randomPick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Generate a random integer between min (inclusive) and max (inclusive). */
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Generate a realistic Hedera account ID. */
function randomAccountId(): string {
  return `0.0.${randomInt(100, 9_999_999)}`;
}

/** Generate a Hedera transaction ID. */
function makeTransactionId(payerAccountId: string, timestamp: Date): string {
  const seconds = Math.floor(timestamp.getTime() / 1000);
  const nanos = (timestamp.getTime() % 1000) * 1_000_000;
  return `${payerAccountId}@${seconds}.${nanos.toString().padStart(9, '0')}`;
}

// Available transaction types for mock generation (weighted toward common ones)
const COMMON_TX_TYPES: TransactionType[] = [
  'CryptoTransfer',
  'CryptoTransfer',
  'CryptoTransfer', // weighted 3x — most common
  'ContractCall',
  'ContractCall',
  'TokenTransfer',
  'TokenTransfer',
  'ConsensusSubmitMessage',
  'TokenMint',
  'CryptoCreate',
];

const STATE_CHANGE_TYPES: StateChangeType[] = [
  'BALANCE',
  'BALANCE',
  'NONCE',
  'TOKEN_BALANCE',
  'CONTRACT_STORAGE',
];

// ---------------------------------------------------------------------------
// MockBlockStream
// ---------------------------------------------------------------------------

/**
 * MockBlockStream — generates realistic mock Block Stream data locally.
 *
 * Simulates Hedera's HIP-1056 Block Streams by producing blocks at
 * configurable intervals, each containing transactions, state changes,
 * and block proofs. The stream implements a typed event emitter so
 * consumers can subscribe to `block`, `transaction`, `stateChange`, etc.
 *
 * @example
 * ```typescript
 * import { MockBlockStream } from 'hiero-block-bridge';
 *
 * const stream = new MockBlockStream({
 *   blockIntervalMs: 2000,
 *   transactionsPerBlock: 5,
 * });
 *
 * stream.on('block', (block) => {
 *   console.log(`Block #${block.header.number} — ${block.items.length} items`);
 * });
 *
 * await stream.start();
 * // ... later
 * await stream.stop();
 * ```
 */
export class MockBlockStream extends TypedEventEmitter<BlockStreamEvents> {
  private readonly options: Required<SimulatorOptions>;
  private readonly logger: pino.Logger;

  private intervalId: ReturnType<typeof setInterval> | null = null;
  private currentBlockNumber: number;
  private running = false;
  private paused = false;

  /** All blocks generated so far (in-memory store for QuerySimulator). */
  private readonly blocks: Block[] = [];

  constructor(options?: Partial<SimulatorOptions>, logger?: pino.Logger) {
    super();

    // Validate and apply defaults via Zod schema
    const parsed = SimulatorOptionsSchema.parse(options ?? {});
    this.options = parsed as Required<SimulatorOptions>;
    this.currentBlockNumber = this.options.startBlockNumber;
    this.logger = logger ?? createLogger({ level: 'info' });
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /**
   * Start generating mock blocks at the configured interval.
   *
   * @throws {HieroBridgeError} If the stream is already running.
   */
  async start(): Promise<void> {
    if (this.running) {
      throw new HieroBridgeError(
        ErrorCode.STREAM_ALREADY_RUNNING,
        'MockBlockStream is already running. Call stop() before starting again.',
      );
    }

    this.running = true;
    this.paused = false;

    this.logger.info(
      {
        blockIntervalMs: this.options.blockIntervalMs,
        transactionsPerBlock: this.options.transactionsPerBlock,
        startBlockNumber: this.currentBlockNumber,
      },
      'MockBlockStream started',
    );

    // Generate the first block immediately
    this.generateAndEmitBlock();

    // Then generate at the configured interval
    this.intervalId = setInterval(() => {
      if (!this.paused) {
        this.generateAndEmitBlock();
      } else {
        // Emit heartbeat while paused
        const heartbeatEvent: BlockStreamEvent = {
          type: 'STREAM_HEARTBEAT',
          timestamp: new Date().toISOString(),
          latestBlockNumber: this.currentBlockNumber - 1,
        };
        this.emit('heartbeat', this.currentBlockNumber - 1);
        this.emit('streamEvent', heartbeatEvent);
      }
    }, this.options.blockIntervalMs);
  }

  /**
   * Stop the block stream and clean up resources.
   */
  async stop(): Promise<void> {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.running = false;
    this.paused = false;
    this.emit('end');
    this.logger.info(
      { blocksGenerated: this.blocks.length },
      'MockBlockStream stopped',
    );
  }

  /**
   * Pause block generation. The stream stays alive and emits heartbeats.
   */
  pause(): void {
    if (!this.running || this.paused) return;
    this.paused = true;
    this.emit('paused');
    this.logger.debug('MockBlockStream paused');
  }

  /**
   * Resume block generation after a pause.
   */
  resume(): void {
    if (!this.running || !this.paused) return;
    this.paused = false;
    this.emit('resumed');
    this.logger.debug('MockBlockStream resumed');
  }

  /**
   * Seek to a specific block number. The next generated block will
   * continue from this number. Does not replay past blocks.
   *
   * @param blockNumber - The block number to seek to.
   * @throws {HieroBridgeError} If blockNumber is negative.
   */
  async seek(blockNumber: number): Promise<void> {
    if (blockNumber < 0) {
      throw new HieroBridgeError(
        ErrorCode.INVALID_BLOCK_NUMBER,
        `Block number must be non-negative, got ${blockNumber}`,
      );
    }
    this.currentBlockNumber = blockNumber;
    this.logger.info({ blockNumber }, 'MockBlockStream seeked');
  }

  // -----------------------------------------------------------------------
  // Accessors
  // -----------------------------------------------------------------------

  /** Whether the stream is currently running. */
  isRunning(): boolean {
    return this.running;
  }

  /** Whether the stream is paused. */
  isPaused(): boolean {
    return this.paused;
  }

  /** Get the current (next-to-generate) block number. */
  getCurrentBlockNumber(): number {
    return this.currentBlockNumber;
  }

  /** Get all generated blocks (for QuerySimulator). */
  getBlocks(): readonly Block[] {
    return this.blocks;
  }

  /** Get a specific block by number, or undefined if not found. */
  getBlock(blockNumber: number): Block | undefined {
    return this.blocks.find((b) => b.header.number === blockNumber);
  }

  // -----------------------------------------------------------------------
  // Block generation (private)
  // -----------------------------------------------------------------------

  /** Generate a single block and emit all associated events. */
  private generateAndEmitBlock(): void {
    try {
      // Simulate random failure injection
      if (this.options.failureRate > 0 && Math.random() < this.options.failureRate) {
        const errorEvent: BlockStreamEvent = {
          type: 'STREAM_ERROR',
          error: 'Simulated stream error (failure injection)',
          recoverable: true,
          blockNumber: this.currentBlockNumber,
        };
        this.emit('streamEvent', errorEvent);
        this.emit('error', new Error(errorEvent.error));
        return;
      }

      const now = new Date();
      const blockNumber = this.currentBlockNumber;

      // --- Generate transactions ---
      const transactions = this.generateTransactions(now);

      // --- Generate state changes from transactions ---
      const stateChanges = this.generateStateChanges(transactions, now);

      // --- Assemble block items ---
      const items: BlockItem[] = [
        ...transactions.map(
          (tx): BlockItem => ({ kind: 'transaction', data: tx }),
        ),
        ...stateChanges.map(
          (sc): BlockItem => ({ kind: 'stateChange', data: sc }),
        ),
      ];

      // --- Block header ---
      const previousHash =
        this.blocks.length > 0
          ? this.blocks[this.blocks.length - 1].header.hash
          : '';

      const header: BlockHeader = {
        number: blockNumber,
        hash: randomHex(48), // SHA-384 = 48 bytes
        previousHash,
        timestamp: now.toISOString(),
        itemCount: items.length,
        softwareVersion: '0.74.0',
        hashAlgorithm: 'SHA_384',
      };

      // --- Block proof ---
      const proof: BlockProof = {
        blockNumber,
        blockHash: header.hash,
        signature: randomHex(64),
        verified: true,
      };

      // --- Assemble full block ---
      const successCount = transactions.filter(
        (tx) => tx.receipt.status === 'SUCCESS',
      ).length;

      const totalGas = transactions.reduce(
        (sum, tx) => sum + (tx.contractResult?.gasUsed ?? 0),
        0,
      );

      const block: Block = {
        header,
        items,
        proof,
        gasUsed: totalGas,
        successfulTransactions: successCount,
        failedTransactions: transactions.length - successCount,
      };

      // --- Store block ---
      this.blocks.push(block);
      this.currentBlockNumber++;

      // --- Emit events ---

      // 1. BLOCK_START
      this.emit('streamEvent', { type: 'BLOCK_START', header });

      // 2. Each item
      for (const item of items) {
        this.emit('streamEvent', {
          type: 'BLOCK_ITEM',
          item,
          blockNumber,
        });

        if (item.kind === 'transaction') {
          this.emit('transaction', item.data);
        } else if (item.kind === 'stateChange') {
          this.emit('stateChange', item.data);
        }
      }

      // 3. BLOCK_END
      this.emit('streamEvent', {
        type: 'BLOCK_END',
        proof,
        blockNumber,
        summary: {
          itemCount: items.length,
          gasUsed: totalGas,
          successCount,
          failCount: transactions.length - successCount,
        },
      });

      // 4. Complete block
      this.emit('block', block);

      this.logger.debug(
        {
          blockNumber,
          transactions: transactions.length,
          stateChanges: stateChanges.length,
        },
        'Block generated',
      );
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.emit('error', err);
      this.logger.error({ err }, 'Error generating block');
    }
  }

  /** Generate mock transactions for a block. */
  private generateTransactions(blockTime: Date): EventTransaction[] {
    const count = this.options.transactionsPerBlock;
    const transactions: EventTransaction[] = [];

    for (let i = 0; i < count; i++) {
      const payerAccountId = randomAccountId();
      const txTime = new Date(blockTime.getTime() + i * 50); // stagger within block
      const type = randomPick(COMMON_TX_TYPES);
      const isSuccess = Math.random() > 0.05; // 95% success rate

      const tx: EventTransaction = {
        transactionId: makeTransactionId(payerAccountId, txTime),
        type,
        payerAccountId,
        receipt: {
          status: isSuccess ? 'SUCCESS' : 'INVALID_TRANSACTION',
          ...(type === 'CryptoCreate' && isSuccess
            ? { accountId: randomAccountId() }
            : {}),
          ...(type === 'TokenMint' && isSuccess
            ? { serialNumbers: [randomInt(1, 10000)] }
            : {}),
        },
        fee: randomInt(50_000, 5_000_000), // 0.0005 – 0.05 HBAR
        consensusTimestamp: txTime.toISOString(),
        validStartTimestamp: new Date(txTime.getTime() - 5000).toISOString(),
        validDurationSeconds: 120,
        nodeAccountId: `0.0.${randomPick([3, 4, 5, 6, 7])}`,
        transfers: this.generateTransfers(payerAccountId, type),
        tokenTransfers: type === 'TokenTransfer' ? this.generateTokenTransfers() : [],
        ...(type === 'ContractCall' || type === 'ContractCreate'
          ? {
              contractResult: {
                contractId: `0.0.${randomInt(1000, 99999)}`,
                result: `0x${randomHex(32)}`,
                gasUsed: randomInt(21_000, 800_000),
                gas: 1_000_000,
                amount: 0,
                logs: [],
              },
            }
          : {}),
        transactionHash: randomHex(48),
      };

      transactions.push(tx);
    }

    return transactions;
  }

  /** Generate HBAR transfer list for a transaction. */
  private generateTransfers(
    payerAccountId: string,
    _type: TransactionType,
  ): { accountId: string; amount: number }[] {
    const fee = randomInt(50_000, 500_000);
    const recipientId = randomAccountId();
    const nodeId = `0.0.${randomPick([3, 4, 5, 6, 7, 98])}`;
    const transferAmount = randomInt(1_000_000, 100_000_000);

    return [
      { accountId: payerAccountId, amount: -(transferAmount + fee) },
      { accountId: recipientId, amount: transferAmount },
      { accountId: nodeId, amount: fee },
    ];
  }

  /** Generate token transfer entries. */
  private generateTokenTransfers(): {
    tokenId: string;
    accountId: string;
    amount: number;
  }[] {
    const tokenId = `0.0.${randomInt(1000, 99999)}`;
    const sender = randomAccountId();
    const receiver = randomAccountId();
    const amount = randomInt(1, 10000);

    return [
      { tokenId, accountId: sender, amount: -amount },
      { tokenId, accountId: receiver, amount },
    ];
  }

  /** Generate state changes resulting from transactions. */
  private generateStateChanges(
    transactions: EventTransaction[],
    _blockTime: Date,
  ): StateChange[] {
    const changes: StateChange[] = [];

    for (const tx of transactions) {
      if (tx.receipt.status !== 'SUCCESS') continue;

      // Each successful transaction produces at least one balance change
      const changeType = randomPick(STATE_CHANGE_TYPES);
      const previousValue = String(randomInt(0, 1_000_000_000));
      const delta = randomInt(-100_000_000, 100_000_000);

      changes.push({
        entityId: tx.payerAccountId,
        changeType,
        previousValue,
        newValue: String(Number(previousValue) + delta),
        transactionId: tx.transactionId,
        consensusTimestamp: tx.consensusTimestamp,
      });
    }

    return changes;
  }
}
