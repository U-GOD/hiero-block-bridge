// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DeprecationSeverity = 'info' | 'warning' | 'error';

export interface DeprecationRule {
  /** Unique rule ID (e.g., "HIERO-001"). */
  id: string;
  /** Deprecated API or pattern name. */
  api: string;
  /** Module or category this rule belongs to. */
  category: 'query' | 'transaction' | 'token' | 'consensus' | 'file' | 'network' | 'general';
  /** ISO-8601 date when the API was deprecated. */
  deprecatedSince: string;
  /** ISO-8601 date when the API will be / was removed. */
  removedAt: string;
  /** Recommended replacement or migration path. */
  replacement: string;
  /** Base severity. Escalates to 'error' after removedAt date. */
  severity: DeprecationSeverity;
  /** Whether an automated code fix is available. */
  autoFixAvailable: boolean;
  /** Regex pattern to detect this API in source code. */
  pattern: RegExp;
  /** Optional auto-fix replacement string (supports capture groups). */
  fix?: string;
  /** Link to relevant HIP or documentation. */
  referenceUrl?: string;
}

// ---------------------------------------------------------------------------
// Deprecation rules registry (2026 transition period)
// ---------------------------------------------------------------------------

export const DEPRECATION_RULES: DeprecationRule[] = [
  // -----------------------------------------------------------------------
  // Query deprecations
  // -----------------------------------------------------------------------
  {
    id: 'HIERO-001',
    api: 'AccountBalanceQuery',
    category: 'query',
    deprecatedSince: '2026-05-01',
    removedAt: '2026-07-01',
    replacement: 'Use Mirror Node REST API: GET /api/v1/balances?account.id={id}',
    severity: 'warning',
    autoFixAvailable: true,
    pattern: /new\s+AccountBalanceQuery\s*\(/g,
    fix: 'mirrorNodeClient.getAccountBalance($1)',
    referenceUrl: 'https://hips.hedera.com/hip/hip-1056',
  },
  {
    id: 'HIERO-002',
    api: 'AccountInfoQuery',
    category: 'query',
    deprecatedSince: '2026-05-01',
    removedAt: '2026-07-01',
    replacement: 'Use Mirror Node REST API: GET /api/v1/accounts/{id}',
    severity: 'warning',
    autoFixAvailable: true,
    pattern: /new\s+AccountInfoQuery\s*\(/g,
    fix: 'mirrorNodeClient.getAccountInfo($1)',
    referenceUrl: 'https://hips.hedera.com/hip/hip-1056',
  },
  {
    id: 'HIERO-003',
    api: 'AccountRecordsQuery',
    category: 'query',
    deprecatedSince: '2026-03-01',
    removedAt: '2026-06-01',
    replacement: 'Use Mirror Node REST API: GET /api/v1/transactions?account.id={id}',
    severity: 'warning',
    autoFixAvailable: false,
    pattern: /new\s+AccountRecordsQuery\s*\(/g,
    referenceUrl: 'https://hips.hedera.com/hip/hip-1056',
  },
  {
    id: 'HIERO-004',
    api: 'TransactionRecordQuery',
    category: 'query',
    deprecatedSince: '2026-05-01',
    removedAt: '2026-07-01',
    replacement: 'Use Block Stream events or Mirror Node: GET /api/v1/transactions/{id}',
    severity: 'warning',
    autoFixAvailable: false,
    pattern: /new\s+TransactionRecordQuery\s*\(/g,
    referenceUrl: 'https://hips.hedera.com/hip/hip-1056',
  },
  {
    id: 'HIERO-005',
    api: 'ContractCallQuery (free queries)',
    category: 'query',
    deprecatedSince: '2026-04-01',
    removedAt: '2026-08-01',
    replacement: 'Use Mirror Node REST API: POST /api/v1/contracts/call',
    severity: 'info',
    autoFixAvailable: false,
    pattern: /new\s+ContractCallQuery\s*\(/g,
    referenceUrl: 'https://hips.hedera.com/hip/hip-1056',
  },

  // -----------------------------------------------------------------------
  // Token deprecations
  // -----------------------------------------------------------------------
  {
    id: 'HIERO-010',
    api: 'TokenInfoQuery',
    category: 'token',
    deprecatedSince: '2026-05-01',
    removedAt: '2026-07-01',
    replacement: 'Use Mirror Node REST API: GET /api/v1/tokens/{id}',
    severity: 'warning',
    autoFixAvailable: true,
    pattern: /new\s+TokenInfoQuery\s*\(/g,
    fix: 'mirrorNodeClient.getTokenInfo($1)',
    referenceUrl: 'https://hips.hedera.com/hip/hip-1056',
  },
  {
    id: 'HIERO-011',
    api: 'TokenNftInfoQuery',
    category: 'token',
    deprecatedSince: '2026-05-01',
    removedAt: '2026-07-01',
    replacement: 'Use Mirror Node REST API: GET /api/v1/tokens/{id}/nfts/{serial}',
    severity: 'warning',
    autoFixAvailable: false,
    pattern: /new\s+TokenNftInfoQuery\s*\(/g,
    referenceUrl: 'https://hips.hedera.com/hip/hip-1056',
  },

  // -----------------------------------------------------------------------
  // Consensus / file deprecations
  // -----------------------------------------------------------------------
  {
    id: 'HIERO-020',
    api: 'TopicInfoQuery',
    category: 'consensus',
    deprecatedSince: '2026-05-01',
    removedAt: '2026-07-01',
    replacement: 'Use Mirror Node REST API: GET /api/v1/topics/{id}',
    severity: 'warning',
    autoFixAvailable: false,
    pattern: /new\s+TopicInfoQuery\s*\(/g,
    referenceUrl: 'https://hips.hedera.com/hip/hip-1056',
  },
  {
    id: 'HIERO-021',
    api: 'FileInfoQuery',
    category: 'file',
    deprecatedSince: '2026-05-01',
    removedAt: '2026-07-01',
    replacement: 'Use Mirror Node REST API: GET /api/v1/network/files/{id}',
    severity: 'warning',
    autoFixAvailable: false,
    pattern: /new\s+FileInfoQuery\s*\(/g,
    referenceUrl: 'https://hips.hedera.com/hip/hip-1056',
  },
  {
    id: 'HIERO-022',
    api: 'FileContentsQuery',
    category: 'file',
    deprecatedSince: '2026-05-01',
    removedAt: '2026-07-01',
    replacement: 'Use Mirror Node REST API: GET /api/v1/network/files/{id}/contents',
    severity: 'warning',
    autoFixAvailable: false,
    pattern: /new\s+FileContentsQuery\s*\(/g,
    referenceUrl: 'https://hips.hedera.com/hip/hip-1056',
  },

  // -----------------------------------------------------------------------
  // Network / record file deprecations
  // -----------------------------------------------------------------------
  {
    id: 'HIERO-030',
    api: 'Record File parsing (v5 format)',
    category: 'network',
    deprecatedSince: '2026-01-01',
    removedAt: '2026-06-01',
    replacement: 'Use Block Streams (HIP-1056) for real-time data. Record files are replaced by block items.',
    severity: 'error',
    autoFixAvailable: false,
    pattern: /RecordFile|recordFile|record_file|\.rcd\b/g,
    referenceUrl: 'https://hips.hedera.com/hip/hip-1056',
  },
  {
    id: 'HIERO-031',
    api: 'getRecord() on TransactionResponse',
    category: 'network',
    deprecatedSince: '2026-05-01',
    removedAt: '2026-07-01',
    replacement: 'Use Block Stream subscription or Mirror Node to track transaction results.',
    severity: 'warning',
    autoFixAvailable: false,
    pattern: /\.getRecord\s*\(/g,
    referenceUrl: 'https://hips.hedera.com/hip/hip-1056',
  },

  // -----------------------------------------------------------------------
  // Throttle / rate limit changes
  // -----------------------------------------------------------------------
  {
    id: 'HIERO-040',
    api: 'Entity creation throttle (legacy limits)',
    category: 'general',
    deprecatedSince: '2026-01-01',
    removedAt: '2026-04-01',
    replacement: 'New throttle: max 100 entity creations per second (was 250). Batch operations accordingly.',
    severity: 'warning',
    autoFixAvailable: false,
    pattern: /CryptoCreate|TokenCreate|TopicCreate|FileCreate|ContractCreate/g,
    referenceUrl: 'https://docs.hedera.com/hedera/networks/mainnet/fees-and-throttles',
  },
  {
    id: 'HIERO-041',
    api: 'Free query quota',
    category: 'general',
    deprecatedSince: '2026-03-01',
    removedAt: '2026-06-01',
    replacement: 'Free consensus queries are being removed. Migrate read-heavy workloads to Mirror Node REST API.',
    severity: 'info',
    autoFixAvailable: false,
    pattern: /setQueryPayment\s*\(\s*0\s*\)|setMaxQueryPayment\s*\(\s*0\s*\)/g,
    referenceUrl: 'https://docs.hedera.com/hedera/networks/mainnet/fees-and-throttles',
  },
];

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

/**
 * Get the effective severity of a rule based on the current date.
 * Rules escalate to 'error' after their removedAt date.
 */
export function getEffectiveSeverity(rule: DeprecationRule, now = new Date()): DeprecationSeverity {
  const removedAt = new Date(rule.removedAt);
  if (now >= removedAt) return 'error';
  return rule.severity;
}

/** Get all rules for a specific category. */
export function getRulesByCategory(category: DeprecationRule['category']): DeprecationRule[] {
  return DEPRECATION_RULES.filter((r) => r.category === category);
}

/** Get all rules that have auto-fix available. */
export function getAutoFixableRules(): DeprecationRule[] {
  return DEPRECATION_RULES.filter((r) => r.autoFixAvailable);
}

/** Look up a rule by its ID. */
export function getRuleById(id: string): DeprecationRule | undefined {
  return DEPRECATION_RULES.find((r) => r.id === id);
}

/** Get all rules that are currently active (deprecated but not yet removed). */
export function getActiveRules(now = new Date()): DeprecationRule[] {
  return DEPRECATION_RULES.filter((r) => {
    const deprecated = new Date(r.deprecatedSince);
    return now >= deprecated;
  });
}
