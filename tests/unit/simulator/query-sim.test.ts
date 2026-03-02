import { describe, it, expect, afterEach } from 'vitest';
import { MockBlockStream } from '../../../src/simulator/mock-stream.js';
import { QuerySimulator } from '../../../src/simulator/query-sim.js';
import { silentLogger } from '../../setup.js';

function createPair(streamOpts?: Record<string, unknown>) {
  const stream = new MockBlockStream(
    { blockIntervalMs: 50, transactionsPerBlock: 3, startBlockNumber: 0, ...streamOpts },
    silentLogger,
  );
  const query = new QuerySimulator({ stream, logger: silentLogger });
  return { stream, query };
}

/** Start the stream, wait a tick for blocks to be emitted, then stop. */
async function generateBlocks(stream: MockBlockStream, waitMs = 80) {
  await stream.start();
  await new Promise((r) => setTimeout(r, waitMs));
  await stream.stop();
}

describe('QuerySimulator', () => {
  // -----------------------------------------------------------------------
  // getBlock
  // -----------------------------------------------------------------------

  it('getBlock(n) returns block after stream generates it', async () => {
    const { stream, query } = createPair();
    await generateBlocks(stream);

    const result = query.getBlock(0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.header.number).toBe(0);
    }
  });

  it('getBlock(n) returns error for non-existent block', async () => {
    const { stream, query } = createPair();
    await generateBlocks(stream);

    const result = query.getBlock(999);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('not found');
    }
  });

  it('getBlock() rejects negative block number', () => {
    const { query } = createPair();
    const result = query.getBlock(-1);
    expect(result.ok).toBe(false);
  });

  // -----------------------------------------------------------------------
  // getTransaction
  // -----------------------------------------------------------------------

  it('getTransaction(id) finds indexed transaction', async () => {
    const { stream, query } = createPair();
    await generateBlocks(stream);

    // Grab a real transaction ID from the generated block
    const block = stream.getBlock(0);
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

  it('getTransaction(id) returns error for unknown ID', async () => {
    const { stream, query } = createPair();
    await generateBlocks(stream);

    const result = query.getTransaction('0.0.9999@1700000000.000000000');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('not found');
    }
  });

  it('getTransaction() rejects invalid format', () => {
    const { query } = createPair();
    const result = query.getTransaction('not-valid');
    expect(result.ok).toBe(false);
  });

  // -----------------------------------------------------------------------
  // getAccountBalance
  // -----------------------------------------------------------------------

  it('getAccountBalance() returns seeded balance for system account', () => {
    const { query } = createPair();
    const result = query.getAccountBalance('0.0.2');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.accountId).toBe('0.0.2');
      expect(result.value.balanceTinybars).toBe(5_000_000_000_000);
    }
  });

  it('getAccountBalance() returns balance for unknown account (seeds it)', () => {
    const { query } = createPair();
    const result = query.getAccountBalance('0.0.9999');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.balanceTinybars).toBeGreaterThan(0);
    }
  });

  it('getAccountBalance() rejects invalid account format', () => {
    const { query } = createPair();
    const result = query.getAccountBalance('invalid');
    expect(result.ok).toBe(false);
  });

  // -----------------------------------------------------------------------
  // getStateProof
  // -----------------------------------------------------------------------

  it('getStateProof() returns valid proof structure', async () => {
    const { stream, query } = createPair();
    await generateBlocks(stream);

    const result = query.getStateProof('0.0.100');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.entityId).toBe('0.0.100');
      expect(result.value.verified).toBe(true);
      expect(result.value.merklePath.length).toBeGreaterThan(0);
      expect(result.value.atBlockNumber).toBeGreaterThanOrEqual(0);
    }
  });

  it('getStateProof() rejects invalid entity format', () => {
    const { query } = createPair();
    const result = query.getStateProof('not-valid');
    expect(result.ok).toBe(false);
  });

  // -----------------------------------------------------------------------
  // getLatestBlock
  // -----------------------------------------------------------------------

  it('getLatestBlock() returns the most recent block', async () => {
    const { stream, query } = createPair();
    await generateBlocks(stream, 120);

    const result = query.getLatestBlock();
    expect(result.ok).toBe(true);
    if (result.ok) {
      const blocks = stream.getBlocks();
      expect(result.value.header.number).toBe(blocks[blocks.length - 1].header.number);
    }
  });

  it('getLatestBlock() returns error when no blocks exist', () => {
    const { query } = createPair();
    const result = query.getLatestBlock();
    expect(result.ok).toBe(false);
  });

  // -----------------------------------------------------------------------
  // getBlockRange
  // -----------------------------------------------------------------------

  it('getBlockRange() returns correct subset', async () => {
    const { stream, query } = createPair();
    await generateBlocks(stream, 180);

    const blocks = stream.getBlocks();
    expect(blocks.length).toBeGreaterThanOrEqual(3);

    const result = query.getBlockRange(0, 1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(2);
      expect(result.value[0].header.number).toBe(0);
      expect(result.value[1].header.number).toBe(1);
    }
  });

  it('getBlockRange() rejects invalid range', () => {
    const { query } = createPair();
    const result = query.getBlockRange(5, 2);
    expect(result.ok).toBe(false);
  });

  // -----------------------------------------------------------------------
  // getTransactionsByAccount
  // -----------------------------------------------------------------------

  it('getTransactionsByAccount() filters by payer', async () => {
    const { stream, query } = createPair();
    await generateBlocks(stream);

    // Find a payer from the generated block
    const block = stream.getBlock(0)!;
    const txItem = block.items.find((i) => i.kind === 'transaction');
    const payerId = (txItem!.data as { payerAccountId: string }).payerAccountId;

    const result = query.getTransactionsByAccount(payerId);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBeGreaterThan(0);
      for (const tx of result.value) {
        expect(tx.payerAccountId).toBe(payerId);
      }
    }
  });

  it('getTransactionsByAccount() rejects invalid format', () => {
    const { query } = createPair();
    const result = query.getTransactionsByAccount('bad');
    expect(result.ok).toBe(false);
  });

  // -----------------------------------------------------------------------
  // getStats
  // -----------------------------------------------------------------------

  it('getStats() reflects actual counts', async () => {
    const { stream, query } = createPair({ transactionsPerBlock: 5 });
    await generateBlocks(stream);

    const stats = query.getStats();
    expect(stats.totalBlocks).toBeGreaterThanOrEqual(1);
    expect(stats.totalTransactions).toBeGreaterThanOrEqual(5);
    expect(stats.totalAccounts).toBeGreaterThan(0);
    expect(stats.latestBlockNumber).toBeGreaterThanOrEqual(0);
  });

  it('getStats() shows zero blocks before stream runs', () => {
    const { query } = createPair();
    const stats = query.getStats();
    expect(stats.totalBlocks).toBe(0);
    expect(stats.latestBlockNumber).toBe(-1);
  });
});
