import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  resolveMirrorNodeUrl,
  resolveOperator,
  resolveNetworkForSdk,
} from '../../../src/core/network.js';

describe('resolveMirrorNodeUrl()', () => {
  it('returns mainnet URL', () => {
    expect(resolveMirrorNodeUrl('mainnet')).toBe('https://mainnet.mirrornode.hedera.com');
  });

  it('returns testnet URL', () => {
    expect(resolveMirrorNodeUrl('testnet')).toBe('https://testnet.mirrornode.hedera.com');
  });

  it('returns previewnet URL', () => {
    expect(resolveMirrorNodeUrl('previewnet')).toBe('https://previewnet.mirrornode.hedera.com');
  });

  it('returns local URL', () => {
    expect(resolveMirrorNodeUrl('local')).toBe('http://localhost:5551');
  });

  it('custom URL overrides network default', () => {
    expect(resolveMirrorNodeUrl('mainnet', 'https://custom.mirror.io')).toBe(
      'https://custom.mirror.io',
    );
  });
});

describe('resolveOperator()', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.HEDERA_ACCOUNT_ID;
    delete process.env.HEDERA_PRIVATE_KEY;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns credentials from explicit arguments', () => {
    const result = resolveOperator('0.0.100', 'myPrivateKey');
    expect(result).toEqual({ accountId: '0.0.100', privateKey: 'myPrivateKey' });
  });

  it('falls back to env vars when no arguments', () => {
    process.env.HEDERA_ACCOUNT_ID = '0.0.200';
    process.env.HEDERA_PRIVATE_KEY = 'envKey';

    const result = resolveOperator();
    expect(result).toEqual({ accountId: '0.0.200', privateKey: 'envKey' });
  });

  it('explicit arguments override env vars', () => {
    process.env.HEDERA_ACCOUNT_ID = '0.0.200';
    process.env.HEDERA_PRIVATE_KEY = 'envKey';

    const result = resolveOperator('0.0.300', 'argKey');
    expect(result).toEqual({ accountId: '0.0.300', privateKey: 'argKey' });
  });

  it('returns undefined when no credentials available', () => {
    const result = resolveOperator();
    expect(result).toBeUndefined();
  });

  it('returns undefined when only accountId is provided', () => {
    const result = resolveOperator('0.0.100');
    expect(result).toBeUndefined();
  });

  it('returns undefined when only privateKey is provided', () => {
    const result = resolveOperator(undefined, 'key');
    expect(result).toBeUndefined();
  });
});

describe('resolveNetworkForSdk()', () => {
  it('maps mainnet', () => {
    expect(resolveNetworkForSdk('mainnet')).toBe('mainnet');
  });

  it('maps testnet', () => {
    expect(resolveNetworkForSdk('testnet')).toBe('testnet');
  });

  it('maps previewnet', () => {
    expect(resolveNetworkForSdk('previewnet')).toBe('previewnet');
  });

  it('maps local to local-node', () => {
    expect(resolveNetworkForSdk('local')).toBe('local-node');
  });
});
