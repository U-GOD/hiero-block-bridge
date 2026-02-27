/**
 * Custom error class for all HieroBlockBridge errors.
 * Uses error codes for programmatic handling.
 */
export class HieroBridgeError extends Error {
  public readonly code: ErrorCode;
  public readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'HieroBridgeError';
    this.code = code;
    this.details = details;

    // Maintains proper stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, HieroBridgeError);
    }
  }
}

/**
 * Error codes for categorizing HieroBlockBridge errors.
 */
export enum ErrorCode {
  // Core errors (1xxx)
  CLIENT_NOT_CONNECTED = 'HIERO_1001',
  CLIENT_CONNECTION_FAILED = 'HIERO_1002',
  INVALID_NETWORK = 'HIERO_1003',
  INVALID_CREDENTIALS = 'HIERO_1004',

  // Simulator errors (2xxx)
  STREAM_NOT_STARTED = 'HIERO_2001',
  STREAM_ALREADY_RUNNING = 'HIERO_2002',
  INVALID_BLOCK_NUMBER = 'HIERO_2003',
  QUERY_FAILED = 'HIERO_2004',
  MOCK_DATA_ERROR = 'HIERO_2005',

  // Fallback errors (3xxx)
  MIRROR_NODE_UNAVAILABLE = 'HIERO_3001',
  FALLBACK_DISABLED = 'HIERO_3002',
  FALLBACK_FAILED = 'HIERO_3003',

  // Automator errors (4xxx)
  DOCKER_NOT_FOUND = 'HIERO_4001',
  DOCKER_COMPOSE_FAILED = 'HIERO_4002',
  HEALTH_CHECK_TIMEOUT = 'HIERO_4003',
  INSUFFICIENT_HARDWARE = 'HIERO_4004',
  SOLO_NOT_FOUND = 'HIERO_4005',

  // Migration errors (5xxx)
  SCAN_FAILED = 'HIERO_5001',
  INVALID_FILE_PATH = 'HIERO_5002',
  THROTTLE_EXCEEDED = 'HIERO_5003',

  // AI errors (6xxx)
  AI_PROVIDER_ERROR = 'HIERO_6001',
  AI_NOT_CONFIGURED = 'HIERO_6002',
}
