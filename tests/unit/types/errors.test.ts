import { describe, it, expect } from 'vitest';
import { HieroBridgeError, ErrorCode } from '../../../src/types/errors.js';

describe('HieroBridgeError', () => {
  it('extends Error', () => {
    const error = new HieroBridgeError(ErrorCode.QUERY_FAILED, 'Query failed');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(HieroBridgeError);
  });

  it('has the correct name', () => {
    const error = new HieroBridgeError(ErrorCode.QUERY_FAILED, 'test');
    expect(error.name).toBe('HieroBridgeError');
  });

  it('stores code and message', () => {
    const error = new HieroBridgeError(ErrorCode.INVALID_NETWORK, 'Bad network');
    expect(error.code).toBe(ErrorCode.INVALID_NETWORK);
    expect(error.message).toBe('Bad network');
  });

  it('stores optional details', () => {
    const details = { accountId: '0.0.100', attempt: 3 };
    const error = new HieroBridgeError(ErrorCode.QUERY_FAILED, 'fail', details);
    expect(error.details).toEqual(details);
  });

  it('has undefined details when not provided', () => {
    const error = new HieroBridgeError(ErrorCode.QUERY_FAILED, 'fail');
    expect(error.details).toBeUndefined();
  });

  it('has a stack trace', () => {
    const error = new HieroBridgeError(ErrorCode.QUERY_FAILED, 'test');
    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('HieroBridgeError');
  });
});

describe('ErrorCode', () => {
  it('has unique values', () => {
    const values = Object.values(ErrorCode);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });

  it('all values follow HIERO_XXXX pattern', () => {
    for (const code of Object.values(ErrorCode)) {
      expect(code).toMatch(/^HIERO_\d{4}$/);
    }
  });

  it('has expected error code categories', () => {
    // Core errors (1xxx)
    expect(ErrorCode.CLIENT_NOT_CONNECTED).toBe('HIERO_1001');
    // Simulator errors (2xxx)
    expect(ErrorCode.STREAM_NOT_STARTED).toBe('HIERO_2001');
    // Fallback errors (3xxx)
    expect(ErrorCode.MIRROR_NODE_UNAVAILABLE).toBe('HIERO_3001');
    // Automator errors (4xxx)
    expect(ErrorCode.DOCKER_NOT_FOUND).toBe('HIERO_4001');
    // Migration errors (5xxx)
    expect(ErrorCode.SCAN_FAILED).toBe('HIERO_5001');
    // AI errors (6xxx)
    expect(ErrorCode.AI_PROVIDER_ERROR).toBe('HIERO_6001');
  });
});
