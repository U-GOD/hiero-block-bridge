import { TypedEventEmitter } from '../core/events.js';
import { createLogger } from '../core/logger.js';
import type pino from 'pino';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ThrottleStatus = 'ok' | 'warning' | 'critical' | 'exceeded';

export interface ThrottleLimit {
  /** Unique identifier for this limit. */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Operation category this limit applies to. */
  category: string;
  /** Maximum operations per second. */
  maxPerSecond: number;
  /** Percentage threshold for 'warning' status. Default: 70. */
  warnThreshold?: number;
  /** Percentage threshold for 'critical' status. Default: 90. */
  criticalThreshold?: number;
}

export interface ThrottleSnapshot {
  /** The throttle limit this snapshot is for. */
  limitId: string;
  /** Current operations per second. */
  currentRate: number;
  /** Maximum allowed per second. */
  maxRate: number;
  /** Usage as a percentage (0–100+). */
  utilizationPct: number;
  /** Current status. */
  status: ThrottleStatus;
  /** Total operations recorded for this limit. */
  totalOperations: number;
  /** Timestamp of the snapshot. */
  timestamp: string;
}

export interface ThrottleMonitorEvents {
  /** Fired when utilization crosses the warning threshold. */
  warning: (snapshot: ThrottleSnapshot) => void;
  /** Fired when utilization crosses the critical threshold. */
  critical: (snapshot: ThrottleSnapshot) => void;
  /** Fired when utilization exceeds 100%. */
  exceeded: (snapshot: ThrottleSnapshot) => void;
  /** Fired when utilization drops back to ok. */
  recovered: (snapshot: ThrottleSnapshot) => void;
}

export interface ThrottleMonitorConfig {
  /** Custom throttle limits (merged with defaults). */
  limits?: ThrottleLimit[];
  /** Sliding window size in milliseconds. Default: 1_000 (1 second). */
  windowMs?: number;
  /** How often to evaluate rates in milliseconds. Default: 500. */
  evaluateIntervalMs?: number;
  logger?: pino.Logger;
}

// ---------------------------------------------------------------------------
// Default Hedera throttle limits (2026 values)
// ---------------------------------------------------------------------------

const DEFAULT_LIMITS: ThrottleLimit[] = [
  {
    id: 'crypto-transfer',
    name: 'CryptoTransfer',
    category: 'transaction',
    maxPerSecond: 10_000,
    warnThreshold: 70,
    criticalThreshold: 90,
  },
  {
    id: 'crypto-create',
    name: 'CryptoCreate',
    category: 'entity-creation',
    maxPerSecond: 100,
    warnThreshold: 70,
    criticalThreshold: 90,
  },
  {
    id: 'token-create',
    name: 'TokenCreate',
    category: 'entity-creation',
    maxPerSecond: 100,
    warnThreshold: 70,
    criticalThreshold: 90,
  },
  {
    id: 'token-mint',
    name: 'TokenMint',
    category: 'transaction',
    maxPerSecond: 3_000,
    warnThreshold: 70,
    criticalThreshold: 90,
  },
  {
    id: 'contract-call',
    name: 'ContractCall',
    category: 'transaction',
    maxPerSecond: 350,
    warnThreshold: 70,
    criticalThreshold: 90,
  },
  {
    id: 'contract-create',
    name: 'ContractCreate',
    category: 'entity-creation',
    maxPerSecond: 50,
    warnThreshold: 70,
    criticalThreshold: 90,
  },
  {
    id: 'consensus-submit',
    name: 'ConsensusSubmitMessage',
    category: 'transaction',
    maxPerSecond: 5_000,
    warnThreshold: 70,
    criticalThreshold: 90,
  },
  {
    id: 'topic-create',
    name: 'TopicCreate',
    category: 'entity-creation',
    maxPerSecond: 50,
    warnThreshold: 70,
    criticalThreshold: 90,
  },
  {
    id: 'file-create',
    name: 'FileCreate',
    category: 'entity-creation',
    maxPerSecond: 50,
    warnThreshold: 70,
    criticalThreshold: 90,
  },
  {
    id: 'queries',
    name: 'Consensus Queries',
    category: 'query',
    maxPerSecond: 500,
    warnThreshold: 70,
    criticalThreshold: 90,
  },
];

// ---------------------------------------------------------------------------
// ThrottleMonitor
// ---------------------------------------------------------------------------

/**
 * Tracks API operation rates against known Hedera throttle limits.
 * Emits events when thresholds are approached or exceeded.
 */
export class ThrottleMonitor extends TypedEventEmitter<ThrottleMonitorEvents> {
  private readonly limits: Map<string, ThrottleLimit>;
  private readonly logger: pino.Logger;
  private readonly windowMs: number;
  private readonly evaluateIntervalMs: number;

  /** Timestamps of operations within the sliding window, keyed by limit ID. */
  private readonly timestamps = new Map<string, number[]>();

  /** Total operation counts, keyed by limit ID. */
  private readonly totals = new Map<string, number>();

  /** Previous status for change detection. */
  private readonly previousStatus = new Map<string, ThrottleStatus>();

  private evaluateTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config?: ThrottleMonitorConfig) {
    super();

    this.windowMs = config?.windowMs ?? 1_000;
    this.evaluateIntervalMs = config?.evaluateIntervalMs ?? 500;
    this.logger = config?.logger ?? createLogger({ level: 'info' });

    // Merge default limits with custom ones (custom overrides by ID)
    const merged = new Map<string, ThrottleLimit>();
    for (const limit of DEFAULT_LIMITS) {
      merged.set(limit.id, limit);
    }
    if (config?.limits) {
      for (const limit of config.limits) {
        merged.set(limit.id, limit);
      }
    }
    this.limits = merged;
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /** Start the periodic rate evaluation. */
  start(): void {
    if (this.evaluateTimer) return;

    this.evaluateTimer = setInterval(() => {
      this.evaluateAll();
    }, this.evaluateIntervalMs);

    this.logger.info(
      { windowMs: this.windowMs, intervalMs: this.evaluateIntervalMs },
      'ThrottleMonitor started',
    );
  }

  /** Stop the periodic rate evaluation. */
  stop(): void {
    if (this.evaluateTimer) {
      clearInterval(this.evaluateTimer);
      this.evaluateTimer = null;
      this.logger.info('ThrottleMonitor stopped');
    }
  }

  // -----------------------------------------------------------------------
  // Recording operations
  // -----------------------------------------------------------------------

  /**
   * Record an operation against a throttle limit.
   *
   * @param limitId - The throttle limit ID (e.g., 'crypto-transfer').
   * @param count - Number of operations to record. Default: 1.
   */
  record(limitId: string, count = 1): void {
    const now = Date.now();
    const existing = this.timestamps.get(limitId) ?? [];

    for (let i = 0; i < count; i++) {
      existing.push(now);
    }

    this.timestamps.set(limitId, existing);
    this.totals.set(limitId, (this.totals.get(limitId) ?? 0) + count);
  }

  /**
   * Record an operation by matching a transaction type name.
   * Maps common Hedera transaction names to limit IDs.
   */
  recordByType(transactionType: string, count = 1): void {
    const limitId = mapTypeToLimitId(transactionType);
    if (limitId) {
      this.record(limitId, count);
    }
  }

  // -----------------------------------------------------------------------
  // Querying
  // -----------------------------------------------------------------------

  /** Get the current snapshot for a specific limit. */
  getSnapshot(limitId: string): ThrottleSnapshot | undefined {
    const limit = this.limits.get(limitId);
    if (!limit) return undefined;

    this.pruneWindow(limitId);
    return this.computeSnapshot(limitId, limit);
  }

  /** Get snapshots for all tracked limits. */
  getAllSnapshots(): ThrottleSnapshot[] {
    const snapshots: ThrottleSnapshot[] = [];

    for (const [id, limit] of this.limits) {
      this.pruneWindow(id);
      snapshots.push(this.computeSnapshot(id, limit));
    }

    return snapshots;
  }

  /** Get only limits that are currently in warning, critical, or exceeded state. */
  getAlerts(): ThrottleSnapshot[] {
    return this.getAllSnapshots().filter((s) => s.status !== 'ok');
  }

  /** Reset all recorded operations. */
  reset(): void {
    this.timestamps.clear();
    this.totals.clear();
    this.previousStatus.clear();
    this.logger.debug('ThrottleMonitor counters reset');
  }

  /** Format all snapshots as a CLI-friendly table. */
  static formatSnapshots(snapshots: ThrottleSnapshot[]): string {
    const lines: string[] = [
      'Throttle Monitor',
      '─'.repeat(80),
      `  ${'Limit'.padEnd(25)} ${'Rate'.padEnd(12)} ${'Max'.padEnd(12)} ${'Usage'.padEnd(10)} Status`,
      '─'.repeat(80),
    ];

    for (const s of snapshots) {
      const icon =
        s.status === 'ok' ? '✓' :
        s.status === 'warning' ? '⚠' :
        s.status === 'critical' ? '⚡' : '✗';

      lines.push(
        `  ${icon} ${s.limitId.padEnd(23)} ${`${s.currentRate}/s`.padEnd(12)} ${`${s.maxRate}/s`.padEnd(12)} ${`${s.utilizationPct.toFixed(1)}%`.padEnd(10)} ${s.status.toUpperCase()}`,
      );
    }

    lines.push('─'.repeat(80));
    return lines.join('\n');
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  /** Remove timestamps outside the sliding window. */
  private pruneWindow(limitId: string): void {
    const cutoff = Date.now() - this.windowMs;
    const timestamps = this.timestamps.get(limitId);
    if (!timestamps) return;

    const pruned = timestamps.filter((t) => t > cutoff);
    this.timestamps.set(limitId, pruned);
  }

  /** Compute a snapshot for a given limit. */
  private computeSnapshot(limitId: string, limit: ThrottleLimit): ThrottleSnapshot {
    const timestamps = this.timestamps.get(limitId) ?? [];
    const windowSeconds = this.windowMs / 1_000;
    const currentRate = timestamps.length / windowSeconds;
    const utilizationPct = (currentRate / limit.maxPerSecond) * 100;

    const warnThreshold = limit.warnThreshold ?? 70;
    const criticalThreshold = limit.criticalThreshold ?? 90;

    let status: ThrottleStatus = 'ok';
    if (utilizationPct >= 100) status = 'exceeded';
    else if (utilizationPct >= criticalThreshold) status = 'critical';
    else if (utilizationPct >= warnThreshold) status = 'warning';

    return {
      limitId,
      currentRate: Math.round(currentRate * 100) / 100,
      maxRate: limit.maxPerSecond,
      utilizationPct: Math.round(utilizationPct * 10) / 10,
      status,
      totalOperations: this.totals.get(limitId) ?? 0,
      timestamp: new Date().toISOString(),
    };
  }

  /** Evaluate all limits and emit events on status changes. */
  private evaluateAll(): void {
    for (const [id, limit] of this.limits) {
      this.pruneWindow(id);
      const snapshot = this.computeSnapshot(id, limit);
      const previous = this.previousStatus.get(id) ?? 'ok';

      if (snapshot.status !== previous) {
        this.previousStatus.set(id, snapshot.status);

        switch (snapshot.status) {
          case 'warning':
            this.emit('warning', snapshot);
            this.logger.warn({ ...snapshot }, `Throttle warning: ${limit.name}`);
            break;
          case 'critical':
            this.emit('critical', snapshot);
            this.logger.error({ ...snapshot }, `Throttle critical: ${limit.name}`);
            break;
          case 'exceeded':
            this.emit('exceeded', snapshot);
            this.logger.error({ ...snapshot }, `Throttle exceeded: ${limit.name}`);
            break;
          case 'ok':
            if (previous !== 'ok') {
              this.emit('recovered', snapshot);
              this.logger.info({ ...snapshot }, `Throttle recovered: ${limit.name}`);
            }
            break;
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map common Hedera transaction type names to throttle limit IDs. */
function mapTypeToLimitId(type: string): string | undefined {
  const mapping: Record<string, string> = {
    CryptoTransfer: 'crypto-transfer',
    CryptoCreate: 'crypto-create',
    TokenCreate: 'token-create',
    TokenMint: 'token-mint',
    TokenBurn: 'token-mint',
    ContractCall: 'contract-call',
    ContractCreate: 'contract-create',
    ConsensusSubmitMessage: 'consensus-submit',
    ConsensusCreateTopic: 'topic-create',
    FileCreate: 'file-create',
    AccountBalanceQuery: 'queries',
    AccountInfoQuery: 'queries',
    TransactionRecordQuery: 'queries',
    ContractCallQuery: 'queries',
    TokenInfoQuery: 'queries',
    TopicInfoQuery: 'queries',
    FileInfoQuery: 'queries',
    FileContentsQuery: 'queries',
  };

  return mapping[type];
}
