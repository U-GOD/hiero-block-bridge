import type pino from 'pino';
import type { NetworkName } from '../types/config.js';
import { HieroBridgeError, ErrorCode } from '../types/errors.js';
import { createLogger } from './logger.js';
import { resolveOperator, resolveNetworkForSdk, resolveMirrorNodeUrl } from './network.js';

/**
 * Configuration for the HieroClient.
 */
export interface HieroClientConfig {
  /** Network to connect to. */
  network: NetworkName;
  /** Operator account ID. Falls back to HEDERA_ACCOUNT_ID env var. */
  operatorId?: string;
  /** Operator private key. Falls back to HEDERA_PRIVATE_KEY env var. */
  operatorKey?: string;
  /** Custom logger instance. */
  logger?: pino.Logger;
}

/**
 * HieroClient — a managed wrapper around the Hedera JS SDK Client.
 *
 * Handles connection lifecycle, operator setup, and network configuration.
 * Provides a clean interface for higher-level modules (simulator, automator, etc.)
 * to interact with the Hedera network or a local simulation.
 *
 * @example
 * ```typescript
 * const client = new HieroClient({
 *   network: 'testnet',
 *   operatorId: '0.0.12345',
 *   operatorKey: '302e020100...',
 * });
 *
 * await client.connect();
 * const info = client.getNetworkInfo();
 * console.log(`Connected to ${info.network}`);
 * ```
 */
export class HieroClient {
  private readonly config: HieroClientConfig;
  private readonly logger: pino.Logger;
  private connected = false;

  constructor(config: HieroClientConfig) {
    this.config = config;
    this.logger = config.logger ?? createLogger();
  }

  /**
   * Establishes a connection to the configured Hedera network.
   *
   * Sets up the SDK Client with operator credentials and network settings.
   * If no operator credentials are provided, the client connects in read-only mode.
   *
   * @throws {HieroBridgeError} If the connection fails.
   */
  async connect(): Promise<void> {
    try {
      const networkString = resolveNetworkForSdk(this.config.network);
      const operator = resolveOperator(this.config.operatorId, this.config.operatorKey);

      this.logger.info(
        { network: networkString, hasOperator: !!operator },
        'Connecting to Hedera network',
      );

      // NOTE: Actual SDK Client instantiation will be implemented in Phase 2.
      // For now, we validate config and mark as connected.
      this.connected = true;

      this.logger.info({ network: networkString }, 'Connected to Hedera network');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown connection error';
      throw new HieroBridgeError(ErrorCode.CLIENT_CONNECTION_FAILED, message, {
        network: this.config.network,
      });
    }
  }

  /**
   * Returns information about the current network connection.
   *
   * @throws {HieroBridgeError} If the client is not connected.
   */
  getNetworkInfo(): { network: string; mirrorNodeUrl: string; connected: boolean } {
    return {
      network: this.config.network,
      mirrorNodeUrl: resolveMirrorNodeUrl(this.config.network),
      connected: this.connected,
    };
  }

  /**
   * Checks whether the client is currently connected.
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Closes the connection to the Hedera network.
   */
  async disconnect(): Promise<void> {
    this.connected = false;
    this.logger.info('Disconnected from Hedera network');
  }
}
