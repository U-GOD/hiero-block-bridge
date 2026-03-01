import { z } from 'zod';
import { TypedEventEmitter } from '../core/events.js';
import { createLogger } from '../core/logger.js';
import { resolveMirrorNodeUrl } from '../core/network.js';
import { HieroBridgeError, ErrorCode } from '../types/errors.js';
import { ok, err } from '../types/result.js';
import type pino from 'pino';
import type { Result } from '../types/result.js';
import type { NetworkName, FallbackStrategy } from '../types/config.js';
import type {
  Block,
  BlockHeader,
  EventTransaction,
  AccountBalance,
  StateProof,
} from '../types/block.js';
import type { QuerySimulator } from './query-sim.js';

// ---------------------------------------------------------------------------
// Fallback event types
// ---------------------------------------------------------------------------

/** Events emitted by the MirrorNodeFallback. */
export interface FallbackEvents {
  /** Primary source (Block Node / simulator) became unavailable. */
  fallbackActivated: (reason: string) => void;
  /** Primary source recovered; switching back. */
  fallbackDeactivated: () => void;
  /** A query was routed through the Mirror Node. */
  mirrorQuery: (endpoint: string, durationMs: number) => void;
  /** Mirror Node request failed. */
  mirrorError: (endpoint: string, error: Error) => void;
}

// ---------------------------------------------------------------------------
// Mirror Node REST response shapes
// ---------------------------------------------------------------------------

const MirrorAccountSchema = z.object({
  account: z.string(),
  balance: z.object({
    balance: z.number(),
    timestamp: z.string(),
    tokens: z.array(
      z.object({
        token_id: z.string(),
        balance: z.number(),
      }),
    ).default([]),
  }),
});

const MirrorTransactionSchema = z.object({
  transaction_id: z.string(),
  name: z.string(),
  node: z.string().optional(),
  result: z.string(),
  charged_tx_fee: z.number(),
  consensus_timestamp: z.string(),
  memo_base64: z.string().optional(),
  transfers: z.array(
    z.object({ account: z.string(), amount: z.number() }),
  ).default([]),
  token_transfers: z.array(
    z.object({ token_id: z.string(), account: z.string(), amount: z.number() }),
  ).default([]),
});

const MirrorBlockSchema = z.object({
  number: z.number(),
  hash: z.string(),
  previous_hash: z.string(),
  timestamp: z.object({ from: z.string(), to: z.string() }),
  count: z.number(),
  gas_used: z.number().default(0),
});

// ---------------------------------------------------------------------------
// MirrorNodeFallback
// ---------------------------------------------------------------------------

export interface MirrorNodeFallbackConfig {
  /** Network to resolve the default Mirror Node URL. */
  network: NetworkName;
  /** Custom Mirror Node base URL (overrides network default). */
  mirrorNodeUrl?: string;
  /** Primary query source to try before falling back. */
  primary?: QuerySimulator;
  /** Fallback strategy. Default: 'auto'. */
  strategy?: FallbackStrategy;
  /** Request timeout in milliseconds. Default: 10_000. */
  timeoutMs?: number;
  logger?: pino.Logger;
}

/**
 * Routes queries to the Hedera Mirror Node REST API when the primary
 * source (Block Node or simulator) is unavailable. Provides the same
 * query interface as {@link QuerySimulator} for transparent swapping.
 *
 * @example
 * ```typescript
 * const fallback = new MirrorNodeFallback({ network: 'testnet' });
 * const balance = await fallback.getAccountBalance('0.0.100');
 * ```
 */
export class MirrorNodeFallback extends TypedEventEmitter<FallbackEvents> {
  private readonly baseUrl: string;
  private readonly strategy: FallbackStrategy;
  private readonly timeoutMs: number;
  private readonly primary?: QuerySimulator;
  private readonly logger: pino.Logger;

  private fallbackActive = false;

  constructor(config: MirrorNodeFallbackConfig) {
    super();

    this.baseUrl = resolveMirrorNodeUrl(config.network, config.mirrorNodeUrl);
    this.strategy = config.strategy ?? 'auto';
    this.timeoutMs = config.timeoutMs ?? 10_000;
    this.primary = config.primary;
    this.logger = config.logger ?? createLogger({ level: 'info' });
  }

  // -----------------------------------------------------------------------
  // Public query methods
  // -----------------------------------------------------------------------

  /** Retrieve a block by number (Mirror Node: `/api/v1/blocks/{number}`). */
  async getBlock(blockNumber: number): Promise<Result<Block, HieroBridgeError>> {
    if (this.primary && !this.fallbackActive) {
      const result = this.primary.getBlock(blockNumber);
      if (result.ok) return result;
      this.activateFallback(result.error.message);
    }

    if (this.strategy === 'disabled') {
      return err(
        new HieroBridgeError(ErrorCode.FALLBACK_DISABLED, 'Fallback is disabled.'),
      );
    }

    try {
      const data = await this.mirrorGet(`/api/v1/blocks/${blockNumber}`, MirrorBlockSchema);

      const block: Block = {
        header: {
          number: data.number,
          hash: data.hash,
          previousHash: data.previous_hash,
          timestamp: new Date(parseFloat(data.timestamp.from) * 1000).toISOString(),
          itemCount: data.count,
          hashAlgorithm: 'SHA_384',
        },
        items: [],
        gasUsed: data.gas_used,
        successfulTransactions: data.count,
        failedTransactions: 0,
      };

      return ok(block);
    } catch (error) {
      return err(this.wrapError('getBlock', error));
    }
  }

  /** Retrieve a transaction by ID (Mirror Node: `/api/v1/transactions/{id}`). */
  async getTransaction(transactionId: string): Promise<Result<EventTransaction, HieroBridgeError>> {
    if (this.primary && !this.fallbackActive) {
      const result = this.primary.getTransaction(transactionId);
      if (result.ok) return result;
      this.activateFallback(result.error.message);
    }

    if (this.strategy === 'disabled') {
      return err(
        new HieroBridgeError(ErrorCode.FALLBACK_DISABLED, 'Fallback is disabled.'),
      );
    }

    try {
      const mirrorId = transactionId.replace('@', '-').replace('.', '-');
      const response = await this.mirrorGet(
        `/api/v1/transactions/${mirrorId}`,
        z.object({ transactions: z.array(MirrorTransactionSchema) }),
      );

      const tx = response.transactions[0];
      if (!tx) {
        return err(
          new HieroBridgeError(
            ErrorCode.QUERY_FAILED,
            `Transaction "${transactionId}" not found on Mirror Node.`,
          ),
        );
      }

      const mapped: EventTransaction = {
        transactionId: tx.transaction_id,
        type: mapTransactionName(tx.name),
        payerAccountId: tx.transaction_id.split('-')[0] ?? '',
        receipt: { status: tx.result === 'SUCCESS' ? 'SUCCESS' : 'UNKNOWN' },
        fee: tx.charged_tx_fee,
        consensusTimestamp: new Date(parseFloat(tx.consensus_timestamp) * 1000).toISOString(),
        validStartTimestamp: new Date(parseFloat(tx.consensus_timestamp) * 1000).toISOString(),
        validDurationSeconds: 120,
        nodeAccountId: tx.node,
        transfers: tx.transfers.map((t) => ({ accountId: t.account, amount: t.amount })),
        tokenTransfers: tx.token_transfers.map((t) => ({
          tokenId: t.token_id,
          accountId: t.account,
          amount: t.amount,
        })),
      };

      return ok(mapped);
    } catch (error) {
      return err(this.wrapError('getTransaction', error));
    }
  }

  /** Get the balance of an account (Mirror Node: `/api/v1/accounts/{id}`). */
  async getAccountBalance(accountId: string): Promise<Result<AccountBalance, HieroBridgeError>> {
    if (this.primary && !this.fallbackActive) {
      const result = this.primary.getAccountBalance(accountId);
      if (result.ok) return result;
      this.activateFallback(result.error.message);
    }

    if (this.strategy === 'disabled') {
      return err(
        new HieroBridgeError(ErrorCode.FALLBACK_DISABLED, 'Fallback is disabled.'),
      );
    }

    try {
      const data = await this.mirrorGet(
        `/api/v1/accounts/${accountId}`,
        MirrorAccountSchema,
      );

      const balance: AccountBalance = {
        accountId: data.account,
        balanceTinybars: data.balance.balance,
        hbars: (data.balance.balance / 100_000_000).toFixed(8),
        tokens: data.balance.tokens.map((t) => ({
          tokenId: t.token_id,
          balance: t.balance,
          decimals: 0,
        })),
        timestamp: new Date(parseFloat(data.balance.timestamp) * 1000).toISOString(),
      };

      return ok(balance);
    } catch (error) {
      return err(this.wrapError('getAccountBalance', error));
    }
  }

  /** Generate a state proof for an entity (Mirror Node: `/api/v1/accounts/{id}`). */
  async getStateProof(entityId: string): Promise<Result<StateProof, HieroBridgeError>> {
    if (this.primary && !this.fallbackActive) {
      const result = this.primary.getStateProof(entityId);
      if (result.ok) return result;
      this.activateFallback(result.error.message);
    }

    if (this.strategy === 'disabled') {
      return err(
        new HieroBridgeError(ErrorCode.FALLBACK_DISABLED, 'Fallback is disabled.'),
      );
    }

    try {
      const data = await this.mirrorGet(
        `/api/v1/accounts/${entityId}`,
        MirrorAccountSchema,
      );

      const proof: StateProof = {
        entityId: data.account,
        stateValue: String(data.balance.balance),
        atBlockNumber: 0,
        timestamp: new Date(parseFloat(data.balance.timestamp) * 1000).toISOString(),
        merklePath: [],
        verified: false,
      };

      return ok(proof);
    } catch (error) {
      return err(this.wrapError('getStateProof', error));
    }
  }

  // -----------------------------------------------------------------------
  // Accessors
  // -----------------------------------------------------------------------

  /** Whether the fallback is currently active. */
  isFallbackActive(): boolean {
    return this.fallbackActive;
  }

  /** The resolved Mirror Node base URL. */
  getMirrorNodeUrl(): string {
    return this.baseUrl;
  }

  /** Reset fallback state — re-attempt primary source on next query. */
  resetFallback(): void {
    if (this.fallbackActive) {
      this.fallbackActive = false;
      this.emit('fallbackDeactivated');
      this.logger.info('Fallback deactivated, will retry primary source');
    }
  }

  // -----------------------------------------------------------------------
  // HTTP client (private)
  // -----------------------------------------------------------------------

  /** GET request to Mirror Node with Zod validation and timeout. */
  private async mirrorGet<T>(endpoint: string, schema: z.ZodType<T>): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const start = Date.now();

    this.logger.debug({ url }, 'Mirror Node request');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new HieroBridgeError(
          ErrorCode.MIRROR_NODE_UNAVAILABLE,
          `Mirror Node returned ${response.status}: ${body}`,
          { url, status: response.status },
        );
      }

      const json = await response.json();
      const parsed = schema.parse(json);

      const durationMs = Date.now() - start;
      this.emit('mirrorQuery', endpoint, durationMs);
      this.logger.debug({ url, durationMs }, 'Mirror Node response');

      return parsed;
    } catch (error) {
      if (error instanceof HieroBridgeError) throw error;

      const wrapped = error instanceof Error ? error : new Error(String(error));
      this.emit('mirrorError', endpoint, wrapped);
      throw new HieroBridgeError(
        ErrorCode.MIRROR_NODE_UNAVAILABLE,
        `Mirror Node request failed: ${wrapped.message}`,
        { url },
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  private activateFallback(reason: string): void {
    if (this.strategy === 'disabled') return;

    if (!this.fallbackActive) {
      this.fallbackActive = true;
      this.emit('fallbackActivated', reason);
      this.logger.warn({ reason }, 'Fallback activated — routing to Mirror Node');
    }
  }

  private wrapError(method: string, error: unknown): HieroBridgeError {
    if (error instanceof HieroBridgeError) return error;
    const message = error instanceof Error ? error.message : String(error);
    return new HieroBridgeError(
      ErrorCode.FALLBACK_FAILED,
      `${method} fallback failed: ${message}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map Mirror Node transaction name to our TransactionType enum. */
function mapTransactionName(name: string): EventTransaction['type'] {
  const mapping: Record<string, EventTransaction['type']> = {
    CRYPTOTRANSFER: 'CryptoTransfer',
    CRYPTOCREATEACCOUNT: 'CryptoCreate',
    CRYPTOUPDATEACCOUNT: 'CryptoUpdate',
    CRYPTODELETE: 'CryptoDelete',
    CONTRACTCALL: 'ContractCall',
    CONTRACTCREATEINSTANCE: 'ContractCreate',
    CONTRACTUPDATEINSTANCE: 'ContractUpdate',
    CONTRACTDELETEINSTANCE: 'ContractDelete',
    TOKENMINT: 'TokenMint',
    TOKENBURN: 'TokenBurn',
    CRYPTOAPPROVEALLOWANCE: 'CryptoApproveAllowance',
    TOKENCREATION: 'TokenCreate',
    TOKENASSOCIATE: 'TokenAssociate',
    TOKENDISSOCIATE: 'TokenDissociate',
    TOKENFREEZE: 'TokenFreeze',
    TOKENUNFREEZE: 'TokenUnfreeze',
    TOKENPAUSE: 'TokenPause',
    TOKENUNPAUSE: 'TokenUnpause',
    CONSENSUSSUBMITMESSAGE: 'ConsensusSubmitMessage',
    CONSENSUSCREATETOPIC: 'ConsensusCreateTopic',
    CONSENSUSUPDATETOPIC: 'ConsensusUpdateTopic',
    CONSENSUSDELETETOPIC: 'ConsensusDeleteTopic',
    FILECREATE: 'FileCreate',
    FILEUPDATE: 'FileUpdate',
    FILEDELETE: 'FileDelete',
    FILEAPPEND: 'FileAppend',
    SCHEDULECREATE: 'ScheduleCreate',
    SCHEDULESIGN: 'ScheduleSign',
    SCHEDULEDELETE: 'ScheduleDelete',
  };

  return mapping[name.toUpperCase()] ?? 'CryptoTransfer';
}
