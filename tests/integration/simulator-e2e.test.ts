import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MockBlockStream } from '../../src/simulator/mock-stream.js';
import { QuerySimulator } from '../../src/simulator/query-sim.js';
import { MirrorNodeFallback } from '../../src/simulator/mirror-fallback.js';
import { silentLogger } from '../setup.js';

// ---------------------------------------------------------------------------
// Mock fetch for MirrorNodeFallback tests
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createSimulator(streamOpts?: Record<string, unknown>) {
  const stream = new MockBlockStream(
    {
      blockIntervalMs: 40,
      transactionsPerBlock: 3,
      startBlockNumber: 0,
      failureRate: 0,
      ...streamOpts,
    },
    silentLogger,
  );
  const query = new QuerySimulator({ stream, logger: silentLogger });
  return { stream, query };
}

/** Start the stream, wait for blocks, then stop. */
async function streamBlocks(stream: MockBlockStream, count: number) {
  await stream.start();
  // Wait long enough for `count` blocks at ~40ms interval + some buffer
  await new Promise((r) => setTimeout(r, count * 40 + 80));
  await stream.stop();
}

// ---------------------------------------------------------------------------
// Full flow: MockBlockStream → QuerySimulator
// ---------------------------------------------------------------------------

describe('Simulator E2E — Stream → Query', () => {
  it('stream blocks then query them via QuerySimulator', async () => {
    const { stream, query } = createSimulator();
    await streamBlocks(stream, 3);

    const blocks = stream.getBlocks();
    expect(blocks.length).toBeGreaterThanOrEqual(3);

    // Every streamed block should be queryable
    for (let i = 0; i < 3; i++) {
      const result = query.getBlock(i);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.header.number).toBe(i);
      }
    }
  });

  it('stream 5 blocks → getBlock(0) through getBlock(4) all succeed', async () => {
    const { stream, query } = createSimulator();
    await streamBlocks(stream, 5);

    expect(stream.getBlocks().length).toBeGreaterThanOrEqual(5);

    for (let n = 0; n < 5; n++) {
      const result = query.getBlock(n);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.header.number).toBe(n);
        expect(result.value.header.hash).toBeTruthy();
        expect(result.value.items.length).toBeGreaterThan(0);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Transaction indexing across blocks
// ---------------------------------------------------------------------------

describe('Simulator E2E — Transaction indexing', () => {
  it('query transaction by ID from streamed block', async () => {
    const { stream, query } = createSimulator({ transactionsPerBlock: 5 });
    await streamBlocks(stream, 2);

    // Grab a real transaction ID from the second block
    const block = stream.getBlock(1);
    expect(block).toBeDefined();

    const txItem = block!.items.find((i) => i.kind === 'transaction');
    expect(txItem).toBeDefined();
    const txId = (txItem!.data as { transactionId: string }).transactionId;

    const result = query.getTransaction(txId);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.transactionId).toBe(txId);
    }
  });
});

// ---------------------------------------------------------------------------
// Account balance
// ---------------------------------------------------------------------------

describe('Simulator E2E — Account balance', () => {
  it('account balance is available after streaming blocks', async () => {
    const { stream, query } = createSimulator();
    await streamBlocks(stream, 2);

    // System account balances are always seeded
    const result = query.getAccountBalance('0.0.2');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.accountId).toBe('0.0.2');
      expect(result.value.balanceTinybars).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// State proof
// ---------------------------------------------------------------------------

describe('Simulator E2E — State proof', () => {
  it('state proof references correct block number', async () => {
    const { stream, query } = createSimulator();
    await streamBlocks(stream, 3);

    const result = query.getStateProof('0.0.100');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.entityId).toBe('0.0.100');
      expect(result.value.verified).toBe(true);
      // atBlockNumber should reference one of the streamed blocks
      expect(result.value.atBlockNumber).toBeGreaterThanOrEqual(0);
      expect(result.value.atBlockNumber).toBeLessThanOrEqual(
        stream.getBlocks().length - 1,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Block range
// ---------------------------------------------------------------------------

describe('Simulator E2E — Block range', () => {
  it('getBlockRange(0, 2) returns 3 blocks after streaming', async () => {
    const { stream, query } = createSimulator();
    await streamBlocks(stream, 4);

    const result = query.getBlockRange(0, 2);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(3);
      expect(result.value[0].header.number).toBe(0);
      expect(result.value[1].header.number).toBe(1);
      expect(result.value[2].header.number).toBe(2);
    }
  });
});

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

describe('Simulator E2E — Stats', () => {
  it('getStats() reflects correct counts after streaming', async () => {
    const { stream, query } = createSimulator({ transactionsPerBlock: 4 });
    await streamBlocks(stream, 3);

    const blocks = stream.getBlocks();
    expect(blocks.length).toBeGreaterThanOrEqual(3);

    const stats = query.getStats();
    expect(stats.totalBlocks).toBeGreaterThanOrEqual(3);
    expect(stats.totalTransactions).toBeGreaterThanOrEqual(12); // 3 blocks × 4 txns
    expect(stats.totalAccounts).toBeGreaterThan(0);
    expect(stats.latestBlockNumber).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// MirrorNodeFallback integration
// ---------------------------------------------------------------------------

describe('Simulator E2E — MirrorNodeFallback', () => {
  it('falls back to Mirror Node when QuerySimulator has no data', async () => {
    const fallback = new MirrorNodeFallback({
      network: 'testnet',
      logger: silentLogger,
    } as any);

    // Mock the Mirror Node response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        account: '0.0.500',
        balance: { balance: 999_000_000, timestamp: '1709000000.000', tokens: [] },
      }),
    });

    const result = await fallback.getAccountBalance('0.0.500');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.accountId).toBe('0.0.500');
      expect(result.value.balanceTinybars).toBe(999_000_000);
    }

    // Verify fetch was called with the Mirror Node URL
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('testnet.mirrornode.hedera.com'),
      expect.any(Object),
    );
  });
});
