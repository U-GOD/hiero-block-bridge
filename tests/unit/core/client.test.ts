import { describe, it, expect } from 'vitest';
import { HieroClient } from '../../../src/core/client.js';
import { silentLogger } from '../../setup.js';

function createClient(
  overrides?: Partial<ConstructorParameters<typeof HieroClient>[0]>,
) {
  return new HieroClient({
    network: 'testnet',
    logger: silentLogger,
    ...overrides,
  });
}

describe('HieroClient', () => {
  it('constructs with valid config', () => {
    const client = createClient();
    expect(client).toBeInstanceOf(HieroClient);
  });

  it('isConnected() returns false before connect', () => {
    const client = createClient();
    expect(client.isConnected()).toBe(false);
  });

  it('connect() sets connected to true', async () => {
    const client = createClient();
    await client.connect();
    expect(client.isConnected()).toBe(true);
  });

  it('getNetworkInfo() returns correct network', () => {
    const client = createClient({ network: 'mainnet' });
    const info = client.getNetworkInfo();
    expect(info.network).toBe('mainnet');
    expect(info.mirrorNodeUrl).toBe('https://mainnet.mirrornode.hedera.com');
  });

  it('getNetworkInfo() returns testnet mirror URL', () => {
    const client = createClient({ network: 'testnet' });
    const info = client.getNetworkInfo();
    expect(info.mirrorNodeUrl).toBe('https://testnet.mirrornode.hedera.com');
  });

  it('getNetworkInfo() shows connected status', async () => {
    const client = createClient();
    expect(client.getNetworkInfo().connected).toBe(false);

    await client.connect();
    expect(client.getNetworkInfo().connected).toBe(true);
  });

  it('disconnect() sets connected to false', async () => {
    const client = createClient();
    await client.connect();
    expect(client.isConnected()).toBe(true);

    await client.disconnect();
    expect(client.isConnected()).toBe(false);
  });

  it('disconnect() is idempotent', async () => {
    const client = createClient();
    await client.disconnect();
    await client.disconnect();
    expect(client.isConnected()).toBe(false);
  });

  it('accepts operator credentials', () => {
    const client = createClient({
      operatorId: '0.0.100',
      operatorKey: 'testKey',
    });
    expect(client).toBeInstanceOf(HieroClient);
  });

  it('accepts custom logger', () => {
    const client = createClient({ logger: silentLogger });
    expect(client).toBeInstanceOf(HieroClient);
  });
});
