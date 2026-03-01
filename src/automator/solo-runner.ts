import { execaCommand } from 'execa';
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { TypedEventEmitter } from '../core/events.js';
import { createLogger } from '../core/logger.js';
import { HieroBridgeError, ErrorCode } from '../types/errors.js';
import type pino from 'pino';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SoloRunnerConfig {
  /** Working directory for Solo config files. Default: `.hiero/solo`. */
  workDir?: string;
  /** Hedera network profile name. Default: `local-custom`. */
  profileName?: string;
  /** Namespace for Solo deployment. Default: `solo`. */
  namespace?: string;
  /** Enable Block Node support (when available in Solo). Default: false. */
  enableBlockNode?: boolean;
  /** Number of consensus nodes. Default: 1. */
  nodeCount?: number;
  /** Operator account ID for the local network. Default: `0.0.2`. */
  operatorId?: string;
  /** Operator private key (ED25519 hex). Uses Solo default if not set. */
  operatorKey?: string;
  /** Additional CLI flags passed to Solo commands. */
  extraFlags?: string[];
  logger?: pino.Logger;
}

export type SoloStatus = 'running' | 'stopped' | 'initializing' | 'error' | 'unknown';

export interface SoloNetworkInfo {
  status: SoloStatus;
  namespace: string;
  profileName: string;
  nodeCount: number;
  blockNodeEnabled: boolean;
  endpoints: {
    grpc: string;
    mirror: string;
    blockNode?: string;
  };
}

export interface SoloRunnerEvents {
  initialized: (namespace: string) => void;
  started: (namespace: string) => void;
  stopped: (namespace: string) => void;
  reset: (namespace: string) => void;
  error: (error: Error) => void;
}

// ---------------------------------------------------------------------------
// SoloRunner
// ---------------------------------------------------------------------------

/**
 * Wraps Hedera Solo CLI (`@hashgraph/solo`) for local network management.
 * Provides programmatic init, start, stop, status, and reset operations.
 */
export class SoloRunner extends TypedEventEmitter<SoloRunnerEvents> {
  private readonly config: Required<SoloRunnerConfig>;
  private readonly logger: pino.Logger;
  private currentStatus: SoloStatus = 'unknown';

  constructor(config?: SoloRunnerConfig) {
    super();

    this.config = {
      workDir: config?.workDir ?? '.hiero/solo',
      profileName: config?.profileName ?? 'local-custom',
      namespace: config?.namespace ?? 'solo',
      enableBlockNode: config?.enableBlockNode ?? false,
      nodeCount: config?.nodeCount ?? 1,
      operatorId: config?.operatorId ?? '0.0.2',
      operatorKey:
        config?.operatorKey ??
        '302e020100300506032b65700422042091132178e72057a1d7528025956fe39b0b847f200ab59b2fdd367017f3087137',
      extraFlags: config?.extraFlags ?? [],
      logger: config?.logger ?? createLogger({ level: 'info' }),
    };

    this.logger = this.config.logger;
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /** Initialize a new Solo deployment (generates configs, creates namespace). */
  async init(): Promise<void> {
    this.currentStatus = 'initializing';

    try {
      await this.ensureWorkDir();
      await this.generateEnvFile();
      await this.generateApplicationProperties();

      const flags = [
        `--namespace ${this.config.namespace}`,
        `--profile ${this.config.profileName}`,
        `--num ${this.config.nodeCount}`,
        ...this.config.extraFlags,
      ];

      if (this.config.enableBlockNode) {
        flags.push('--block-node');
      }

      await this.solo(`init ${flags.join(' ')}`);

      this.currentStatus = 'stopped';
      this.emit('initialized', this.config.namespace);
      this.logger.info({ namespace: this.config.namespace }, 'Solo initialized');
    } catch (error) {
      this.currentStatus = 'error';
      throw this.wrapSoloError('init', error);
    }
  }

  /** Start the Solo local network. */
  async start(): Promise<void> {
    try {
      const flags = [
        `--namespace ${this.config.namespace}`,
        `--profile ${this.config.profileName}`,
        ...this.config.extraFlags,
      ];

      if (this.config.enableBlockNode) {
        flags.push('--block-node');
      }

      await this.solo(`network deploy ${flags.join(' ')}`);

      this.currentStatus = 'running';
      this.emit('started', this.config.namespace);
      this.logger.info({ namespace: this.config.namespace }, 'Solo network started');
    } catch (error) {
      this.currentStatus = 'error';
      throw this.wrapSoloError('start', error);
    }
  }

  /** Stop the Solo local network. */
  async stop(): Promise<void> {
    try {
      await this.solo(`network destroy --namespace ${this.config.namespace} --force`);

      this.currentStatus = 'stopped';
      this.emit('stopped', this.config.namespace);
      this.logger.info({ namespace: this.config.namespace }, 'Solo network stopped');
    } catch (error) {
      this.currentStatus = 'error';
      throw this.wrapSoloError('stop', error);
    }
  }

  /** Get the current status of the Solo deployment. */
  async status(): Promise<SoloNetworkInfo> {
    try {
      const output = await this.solo(`network info --namespace ${this.config.namespace}`);

      const isRunning = output.toLowerCase().includes('running');
      this.currentStatus = isRunning ? 'running' : 'stopped';

      return {
        status: this.currentStatus,
        namespace: this.config.namespace,
        profileName: this.config.profileName,
        nodeCount: this.config.nodeCount,
        blockNodeEnabled: this.config.enableBlockNode,
        endpoints: {
          grpc: 'localhost:50211',
          mirror: 'http://localhost:8080',
          ...(this.config.enableBlockNode ? { blockNode: 'localhost:8090' } : {}),
        },
      };
    } catch {
      return {
        status: 'unknown',
        namespace: this.config.namespace,
        profileName: this.config.profileName,
        nodeCount: this.config.nodeCount,
        blockNodeEnabled: this.config.enableBlockNode,
        endpoints: {
          grpc: 'localhost:50211',
          mirror: 'http://localhost:8080',
        },
      };
    }
  }

  /** Reset the Solo deployment (destroy + re-init). */
  async reset(): Promise<void> {
    try {
      this.logger.info({ namespace: this.config.namespace }, 'Resetting Solo network');

      try {
        await this.stop();
      } catch {
        // Ignore errors during cleanup
      }

      await this.init();

      this.emit('reset', this.config.namespace);
      this.logger.info({ namespace: this.config.namespace }, 'Solo network reset complete');
    } catch (error) {
      this.currentStatus = 'error';
      throw this.wrapSoloError('reset', error);
    }
  }

  // -----------------------------------------------------------------------
  // Config file generation
  // -----------------------------------------------------------------------

  /** Generate `.env` file for local network operator credentials. */
  async generateEnvFile(): Promise<string> {
    const envPath = join(this.config.workDir, '.env');
    const content = [
      `# Generated by HieroBlockBridge SoloRunner`,
      `HEDERA_NETWORK=local`,
      `HEDERA_ACCOUNT_ID=${this.config.operatorId}`,
      `HEDERA_PRIVATE_KEY=${this.config.operatorKey}`,
      `HEDERA_MIRROR_NODE_URL=http://localhost:8080`,
      ...(this.config.enableBlockNode
        ? [`HEDERA_BLOCK_NODE_URL=localhost:8090`]
        : []),
    ].join('\n');

    await writeFile(envPath, content + '\n', 'utf-8');
    this.logger.debug({ path: envPath }, '.env file generated');
    return envPath;
  }

  /** Generate `application.properties` for Solo node configuration. */
  async generateApplicationProperties(): Promise<string> {
    const propsPath = join(this.config.workDir, 'application.properties');
    const content = [
      `# Generated by HieroBlockBridge SoloRunner`,
      `hedera.profiles.active=${this.config.profileName}`,
      `hedera.mirror.importer.parser.record.entity.persist.transactionBytes=true`,
      `hedera.mirror.importer.downloader.local=true`,
      ...(this.config.enableBlockNode
        ? [
            `hedera.blocknode.enabled=true`,
            `hedera.blocknode.storage.root=/opt/hiero/data`,
          ]
        : []),
    ].join('\n');

    await writeFile(propsPath, content + '\n', 'utf-8');
    this.logger.debug({ path: propsPath }, 'application.properties generated');
    return propsPath;
  }

  // -----------------------------------------------------------------------
  // Solo CLI availability
  // -----------------------------------------------------------------------

  /** Check if Solo CLI is installed and accessible. */
  async checkSolo(): Promise<{ available: boolean; version?: string; error?: string }> {
    try {
      const { stdout } = await execaCommand('solo version');
      return { available: true, version: stdout.trim() };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { available: false, error: message };
    }
  }

  // -----------------------------------------------------------------------
  // Accessors
  // -----------------------------------------------------------------------

  getStatus(): SoloStatus {
    return this.currentStatus;
  }

  getNamespace(): string {
    return this.config.namespace;
  }

  getWorkDir(): string {
    return this.config.workDir;
  }

  isBlockNodeEnabled(): boolean {
    return this.config.enableBlockNode;
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  private async ensureWorkDir(): Promise<void> {
    if (!existsSync(this.config.workDir)) {
      await mkdir(this.config.workDir, { recursive: true });
    }
  }

  /** Execute a Solo CLI command and return stdout. */
  private async solo(subcommand: string): Promise<string> {
    const cmd = `solo ${subcommand}`;
    this.logger.debug({ cmd }, 'Executing solo CLI');

    const { stdout } = await execaCommand(cmd);
    return stdout;
  }

  private wrapSoloError(operation: string, error: unknown): HieroBridgeError {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes('not found') || message.includes('not recognized')) {
      return new HieroBridgeError(
        ErrorCode.SOLO_NOT_FOUND,
        'Solo CLI not found. Install via: npm install -g @hashgraph/solo',
        { operation },
      );
    }

    return new HieroBridgeError(
      ErrorCode.DOCKER_COMPOSE_FAILED,
      `solo ${operation} failed: ${message}`,
      { operation },
    );
  }
}
