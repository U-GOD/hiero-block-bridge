/**
 * Lightweight gRPC client for connecting to a real Hiero Block Node.
 *
 * Uses dynamic imports so that `@grpc/grpc-js` and `@grpc/proto-loader`
 * are **optional** peer dependencies. If they are not installed, the
 * client gracefully reports unavailability and the caller (BlockStream)
 * falls back to mock simulation.
 *
 * @module
 */

import { TypedEventEmitter } from '../core/events.js';
import path from 'path';
import { fileURLToPath } from 'url';
import type pino from 'pino';
import type {
  Block,
  BlockHeader,
  BlockItem,
  BlockProof,
  EventTransaction,
  StateChange,
  TransactionType,
  StateChangeType,
} from '../types/block.js';

// ---------------------------------------------------------------------------
// Events emitted by the gRPC client
// ---------------------------------------------------------------------------

export interface GrpcClientEvents {
  /** A complete block has been assembled from the gRPC stream. */
  block: (block: Block) => void;
  /** The gRPC connection was established successfully. */
  connected: (endpoint: string) => void;
  /** The gRPC connection failed (caller should fall back to mock). */
  connectionFailed: (reason: string) => void;
  /** The gRPC stream ended or was disconnected. */
  disconnected: (reason: string) => void;
  /** A non-fatal error occurred on the stream. */
  error: (error: Error) => void;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface GrpcClientConfig {
  /** Block Node gRPC endpoint (e.g., "localhost:8080"). */
  endpoint: string;
  /** Timeout in ms for initial connection attempt. */
  connectionTimeoutMs: number;
  /** Starting block number to subscribe from (0 = latest). */
  startBlockNumber: number;
  /** Logger instance. */
  logger: pino.Logger;
}

// ---------------------------------------------------------------------------
// Block accumulator — assembles streaming items into full Block objects
// ---------------------------------------------------------------------------

interface BlockAccumulator {
  header: BlockHeader | null;
  items: BlockItem[];
  proof: BlockProof | null;
}

// ---------------------------------------------------------------------------
// GrpcBlockClient
// ---------------------------------------------------------------------------

/**
 * Connects to a Hiero Block Node via gRPC and streams real blocks.
 *
 * This client dynamically imports `@grpc/grpc-js` and `@grpc/proto-loader`
 * at runtime so they remain optional dependencies. If the packages are
 * missing, {@link connect} resolves `false` immediately.
 *
 * @example
 * ```typescript
 * const client = new GrpcBlockClient({
 *   endpoint: 'localhost:8080',
 *   connectionTimeoutMs: 5000,
 *   startBlockNumber: 0,
 *   logger,
 * });
 *
 * client.on('block', (block) => console.log(block.header.number));
 * client.on('connectionFailed', (reason) => console.warn(reason));
 *
 * const connected = await client.connect();
 * ```
 */
export class GrpcBlockClient extends TypedEventEmitter<GrpcClientEvents> {
  private readonly config: GrpcClientConfig;
  private readonly logger: pino.Logger;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private grpcCall: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private grpcClient: any = null;
  private accumulator: BlockAccumulator = { header: null, items: [], proof: null };
  private _connected = false;
  private blockCount = 0;

  constructor(config: GrpcClientConfig) {
    super();
    this.config = config;
    this.logger = config.logger;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Attempt to connect to the Block Node.
   *
   * @returns `true` if the gRPC connection was established, `false` otherwise.
   */
  async connect(): Promise<boolean> {
    // Step 1: Dynamically import gRPC dependencies
    let grpc: typeof import('@grpc/grpc-js');
    let protoLoader: typeof import('@grpc/proto-loader');

    try {
      grpc = await import('@grpc/grpc-js');
      protoLoader = await import('@grpc/proto-loader');
    } catch {
      const reason =
        'gRPC packages not installed. Install @grpc/grpc-js and @grpc/proto-loader for passthrough mode.';
      this.logger.warn(reason);
      this.emit('connectionFailed', reason);
      return false;
    }

    // Step 2: Load the protobuf definition
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const protoPath = path.join(__dirname, 'proto', 'block_stream_service.proto');

    let packageDefinition;
    try {
      packageDefinition = protoLoader.loadSync(protoPath, {
        keepCase: false,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
      });
    } catch (err) {
      const reason = `Failed to load proto definition: ${err instanceof Error ? err.message : String(err)}`;
      this.logger.error(reason);
      this.emit('connectionFailed', reason);
      return false;
    }

    const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any;
    const BlockStreamService = protoDescriptor.com?.hedera?.hapi?.block?.BlockStreamService;

    if (!BlockStreamService) {
      const reason = 'BlockStreamService not found in proto definition.';
      this.logger.error(reason);
      this.emit('connectionFailed', reason);
      return false;
    }

    // Step 3: Create client and attempt connection with timeout
    this.grpcClient = new BlockStreamService(
      this.config.endpoint,
      grpc.credentials.createInsecure(),
    );

    const connected = await this.waitForConnection(grpc, this.config.connectionTimeoutMs);

    if (!connected) {
      const reason = `Block Node at ${this.config.endpoint} is not reachable (timeout: ${this.config.connectionTimeoutMs}ms).`;
      this.logger.warn(reason);
      this.emit('connectionFailed', reason);
      this.grpcClient.close();
      this.grpcClient = null;
      return false;
    }

    // Step 4: Subscribe to the block stream
    this.logger.info(
      { endpoint: this.config.endpoint },
      'Connected to Block Node. Subscribing to block stream...',
    );

    this.grpcCall = this.grpcClient.subscribeBlockStream({
      startBlockNumber: this.config.startBlockNumber,
      headersOnly: false,
      transactionTypeFilter: [],
    });

    this.setupStreamHandlers();
    this._connected = true;
    this.emit('connected', this.config.endpoint);
    return true;
  }

  /** Disconnect from the Block Node. */
  async disconnect(): Promise<void> {
    if (this.grpcCall) {
      this.grpcCall.cancel();
      this.grpcCall = null;
    }
    if (this.grpcClient) {
      this.grpcClient.close();
      this.grpcClient = null;
    }
    this._connected = false;
    this.logger.info('Disconnected from Block Node.');
  }

  /** Whether the client is currently connected. */
  isConnected(): boolean {
    return this._connected;
  }

  /** Number of blocks received from the live stream. */
  getBlockCount(): number {
    return this.blockCount;
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /**
   * Wait for the gRPC channel to reach READY state within the timeout.
   */
  private waitForConnection(
    grpc: typeof import('@grpc/grpc-js'),
    timeoutMs: number,
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const deadline = Date.now() + timeoutMs;

      this.grpcClient.waitForReady(deadline, (err: Error | null) => {
        if (err) {
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  }

  /**
   * Attach event handlers to the gRPC server-streaming call.
   */
  private setupStreamHandlers(): void {
    if (!this.grpcCall) return;

    this.grpcCall.on('data', (response: any) => {
      try {
        this.handleStreamResponse(response);
      } catch (err) {
        this.emit('error', err instanceof Error ? err : new Error(String(err)));
      }
    });

    this.grpcCall.on('error', (err: Error) => {
      this.logger.error({ err }, 'gRPC stream error');
      this._connected = false;
      this.emit('error', err);
      this.emit('disconnected', err.message);
    });

    this.grpcCall.on('end', () => {
      this.logger.info('gRPC stream ended by server.');
      this._connected = false;
      this.emit('disconnected', 'Stream ended by server.');
    });
  }

  /**
   * Process a single SubscribeStreamResponse from the gRPC stream.
   * Accumulates header → items → proof, then emits a complete Block.
   */
  private handleStreamResponse(response: any): void {
    if (response.blockHeader) {
      // Start of a new block — flush any previous accumulator
      if (this.accumulator.header) {
        this.flushBlock();
      }
      this.accumulator.header = this.mapBlockHeader(response.blockHeader);
    } else if (response.blockItem) {
      const item = this.mapBlockItem(response.blockItem);
      if (item) {
        this.accumulator.items.push(item);
      }
    } else if (response.blockProof) {
      this.accumulator.proof = this.mapBlockProof(response.blockProof);
      // Proof concludes a block — flush immediately
      this.flushBlock();
    } else if (response.status) {
      this.logger.debug(
        { statusType: response.status.type, message: response.status.message },
        'Stream status update',
      );
    }
  }

  /**
   * Emit the accumulated block and reset the accumulator.
   */
  private flushBlock(): void {
    const { header, items, proof } = this.accumulator;

    if (!header) return;

    const transactions = items
      .filter((i): i is BlockItem & { kind: 'transaction' } => i.kind === 'transaction')
      .map((i) => i.data as EventTransaction);

    const successCount = transactions.filter((tx) => tx.receipt.status === 'SUCCESS').length;
    const totalGas = transactions.reduce(
      (sum, tx) => sum + (tx.contractResult?.gasUsed ?? 0),
      0,
    );

    const block: Block = {
      header,
      items,
      proof: proof ?? undefined,
      gasUsed: totalGas,
      successfulTransactions: successCount,
      failedTransactions: transactions.length - successCount,
    };

    this.blockCount++;
    this.emit('block', block);

    // Reset accumulator
    this.accumulator = { header: null, items: [], proof: null };
  }

  // -----------------------------------------------------------------------
  // Protobuf → internal type mappers
  // -----------------------------------------------------------------------

  private mapBlockHeader(raw: any): BlockHeader {
    return {
      number: Number(raw.blockNumber ?? 0),
      hash: this.bytesToHex(raw.blockHash),
      previousHash: this.bytesToHex(raw.previousBlockHash),
      timestamp: raw.consensusTimestamp || new Date().toISOString(),
      itemCount: Number(raw.itemCount ?? 0),
      softwareVersion: raw.softwareVersion || '0.74.0',
      hashAlgorithm: 'SHA_384',
    };
  }

  private mapBlockItem(raw: any): BlockItem | null {
    if (raw.transaction) {
      return {
        kind: 'transaction',
        data: this.mapTransaction(raw.transaction),
      };
    }
    if (raw.stateChange) {
      return {
        kind: 'stateChange',
        data: this.mapStateChange(raw.stateChange),
      };
    }
    return null;
  }

  private mapTransaction(raw: any): EventTransaction {
    const txType = this.mapTransactionType(raw.transactionType);

    return {
      transactionId: raw.transactionId || '',
      type: txType,
      payerAccountId: raw.payerAccountId || '',
      receipt: {
        status: raw.receipt?.status || 'UNKNOWN',
        ...(raw.receipt?.accountId ? { accountId: raw.receipt.accountId } : {}),
        ...(raw.receipt?.contractId ? { contractId: raw.receipt.contractId } : {}),
        ...(raw.receipt?.topicId ? { topicId: raw.receipt.topicId } : {}),
        ...(raw.receipt?.tokenId ? { tokenId: raw.receipt.tokenId } : {}),
        ...(raw.receipt?.serialNumbers?.length
          ? { serialNumbers: raw.receipt.serialNumbers.map(Number) }
          : {}),
      },
      fee: Number(raw.fee ?? 0),
      consensusTimestamp: raw.consensusTimestamp || new Date().toISOString(),
      validStartTimestamp: raw.validStartTimestamp || new Date().toISOString(),
      validDurationSeconds: Number(raw.validDurationSeconds ?? 120),
      nodeAccountId: raw.nodeAccountId || undefined,
      transfers: (raw.transfers ?? []).map((t: any) => ({
        accountId: t.accountId || '',
        amount: Number(t.amount ?? 0),
      })),
      tokenTransfers: (raw.tokenTransfers ?? []).map((t: any) => ({
        tokenId: t.tokenId || '',
        accountId: t.accountId || '',
        amount: Number(t.amount ?? 0),
      })),
      transactionHash: this.bytesToHex(raw.transactionHash),
    };
  }

  private mapStateChange(raw: any): StateChange {
    return {
      entityId: raw.entityId || '',
      changeType: this.mapStateChangeType(raw.changeType),
      previousValue: raw.previousValue || '',
      newValue: raw.newValue || '',
      transactionId: raw.transactionId || '',
      consensusTimestamp: raw.consensusTimestamp || new Date().toISOString(),
    };
  }

  private mapBlockProof(raw: any): BlockProof {
    return {
      blockNumber: Number(raw.blockNumber ?? 0),
      blockHash: this.bytesToHex(raw.blockHash),
      signature: this.bytesToHex(raw.signature),
      verified: Boolean(raw.verified),
    };
  }

  private mapTransactionType(raw: string): TransactionType {
    const VALID_TYPES: TransactionType[] = [
      'CryptoTransfer', 'CryptoCreate', 'CryptoUpdate', 'CryptoDelete',
      'CryptoApproveAllowance', 'ContractCall', 'ContractCreate',
      'ContractUpdate', 'ContractDelete', 'TokenMint', 'TokenBurn',
      'TokenTransfer', 'TokenCreate', 'TokenAssociate', 'TokenDissociate',
      'TokenFreeze', 'TokenUnfreeze', 'TokenPause', 'TokenUnpause',
      'ConsensusSubmitMessage', 'ConsensusCreateTopic', 'ConsensusUpdateTopic',
      'ConsensusDeleteTopic', 'FileCreate', 'FileUpdate', 'FileDelete',
      'FileAppend', 'ScheduleCreate', 'ScheduleSign', 'ScheduleDelete',
    ];

    if (VALID_TYPES.includes(raw as TransactionType)) {
      return raw as TransactionType;
    }

    // Attempt to convert snake_case gRPC format → PascalCase
    const pascal = raw
      .split('_')
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase())
      .join('') as TransactionType;

    if (VALID_TYPES.includes(pascal)) {
      return pascal;
    }

    return 'CryptoTransfer'; // Safe fallback
  }

  private mapStateChangeType(raw: string): StateChangeType {
    const VALID_TYPES: StateChangeType[] = [
      'BALANCE', 'NONCE', 'STORAGE', 'TOKEN_BALANCE', 'TOKEN_ASSOCIATION',
      'ALLOWANCE', 'STAKING_INFO', 'CONTRACT_BYTECODE', 'CONTRACT_STORAGE',
      'TOPIC_MESSAGE', 'SCHEDULE_STATUS', 'NFT_OWNERSHIP',
    ];

    if (VALID_TYPES.includes(raw as StateChangeType)) {
      return raw as StateChangeType;
    }
    return 'BALANCE'; // Safe fallback
  }

  private bytesToHex(value: any): string {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (Buffer.isBuffer(value)) return value.toString('hex');
    if (value instanceof Uint8Array) return Buffer.from(value).toString('hex');
    return String(value);
  }
}
