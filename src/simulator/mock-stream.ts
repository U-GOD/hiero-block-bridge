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

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function randomPick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomAccountId(): string {
  return `0.0.${randomInt(100, 9_999_999)}`;
}

function makeTransactionId(payerAccountId: string, timestamp: Date): string {
  const seconds = Math.floor(timestamp.getTime() / 1000);
  const nanos = (timestamp.getTime() % 1000) * 1_000_000;
  return `${payerAccountId}@${seconds}.${nanos.toString().padStart(9, '0')}`;
}

/** Weighted toward common types to produce realistic distributions. */
const COMMON_TX_TYPES: TransactionType[] = [
  'CryptoTransfer',
  'CryptoTransfer',
  'CryptoTransfer',
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
 * Generates realistic mock Block Stream data locally per HIP-1056.
 *
 * Produces blocks at configurable intervals, each containing transactions,
 * state changes, and block proofs. Extends {@link TypedEventEmitter} for
 * type-safe event subscriptions.
 *
 * @example
 * ```typescript
 * const stream = new MockBlockStream({ blockIntervalMs: 2000 });
 *
 * stream.on('block', (block) => {
 *   console.log(`Block #${block.header.number}`);
 * });
 *
 * await stream.start();
 * ```
 */
export class MockBlockStream extends TypedEventEmitter<BlockStreamEvents> {
  private readonly options: Required<SimulatorOptions>;
  private readonly logger: pino.Logger;

  private intervalId: ReturnType<typeof setInterval> | null = null;
  private currentBlockNumber: number;
  private running = false;
  private paused = false;

  private readonly blocks: Block[] = [];

  constructor(options?: Partial<SimulatorOptions>, logger?: pino.Logger) {
    super();

    const parsed = SimulatorOptionsSchema.parse(options ?? {});
    this.options = parsed as Required<SimulatorOptions>;
    this.currentBlockNumber = this.options.startBlockNumber;
    this.logger = logger ?? createLogger({ level: 'info' });
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /**
   * Start producing mock blocks at the configured interval.
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

    this.generateAndEmitBlock();

    this.intervalId = setInterval(() => {
      if (!this.paused) {
        this.generateAndEmitBlock();
      } else {
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

  /** Stop the block stream and release resources. */
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

  /** Pause block generation. Heartbeats continue while paused. */
  pause(): void {
    if (!this.running || this.paused) return;
    this.paused = true;
    this.emit('paused');
    this.logger.debug('MockBlockStream paused');
  }

  /** Resume block generation after a pause. */
  resume(): void {
    if (!this.running || !this.paused) return;
    this.paused = false;
    this.emit('resumed');
    this.logger.debug('MockBlockStream resumed');
  }

  /**
   * Seek to a specific block number. Does not replay past blocks.
   *
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

  isRunning(): boolean {
    return this.running;
  }

  isPaused(): boolean {
    return this.paused;
  }

  getCurrentBlockNumber(): number {
    return this.currentBlockNumber;
  }

  getBlocks(): readonly Block[] {
    return this.blocks;
  }

  getBlock(blockNumber: number): Block | undefined {
    return this.blocks.find((b) => b.header.number === blockNumber);
  }

  // -----------------------------------------------------------------------
  // Block generation (private)
  // -----------------------------------------------------------------------

  private generateAndEmitBlock(): void {
    try {
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

      const transactions = this.generateTransactions(now);
      const stateChanges = this.generateStateChanges(transactions);

      const items: BlockItem[] = [
        ...transactions.map((tx): BlockItem => ({ kind: 'transaction', data: tx })),
        ...stateChanges.map((sc): BlockItem => ({ kind: 'stateChange', data: sc })),
      ];

      const previousHash =
        this.blocks.length > 0
          ? this.blocks[this.blocks.length - 1].header.hash
          : '';

      const header: BlockHeader = {
        number: blockNumber,
        hash: randomHex(48),
        previousHash,
        timestamp: now.toISOString(),
        itemCount: items.length,
        softwareVersion: '0.74.0',
        hashAlgorithm: 'SHA_384',
      };

      const proof: BlockProof = {
        blockNumber,
        blockHash: header.hash,
        signature: randomHex(64),
        verified: true,
      };

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

      this.blocks.push(block);
      this.currentBlockNumber++;

      // Emit granular events before the complete block event
      this.emit('streamEvent', { type: 'BLOCK_START', header });

      for (const item of items) {
        this.emit('streamEvent', { type: 'BLOCK_ITEM', item, blockNumber });

        if (item.kind === 'transaction') {
          this.emit('transaction', item.data);
        } else if (item.kind === 'stateChange') {
          this.emit('stateChange', item.data);
        }
      }

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

      this.emit('block', block);

      this.logger.debug(
        { blockNumber, transactions: transactions.length, stateChanges: stateChanges.length },
        'Block generated',
      );
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.emit('error', err);
      this.logger.error({ err }, 'Error generating block');
    }
  }

  private generateTransactions(blockTime: Date): EventTransaction[] {
    const count = this.options.transactionsPerBlock;
    const transactions: EventTransaction[] = [];

    for (let i = 0; i < count; i++) {
      const payerAccountId = randomAccountId();
      const txTime = new Date(blockTime.getTime() + i * 50);
      const type = randomPick(COMMON_TX_TYPES);
      const isSuccess = Math.random() > 0.05;

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
        fee: randomInt(50_000, 5_000_000),
        consensusTimestamp: txTime.toISOString(),
        validStartTimestamp: new Date(txTime.getTime() - 5000).toISOString(),
        validDurationSeconds: 120,
        nodeAccountId: `0.0.${randomPick([3, 4, 5, 6, 7])}`,
        transfers: this.generateTransfers(payerAccountId),
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

  private generateTransfers(
    payerAccountId: string,
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

  private generateStateChanges(transactions: EventTransaction[]): StateChange[] {
    const changes: StateChange[] = [];

    for (const tx of transactions) {
      if (tx.receipt.status !== 'SUCCESS') continue;

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
