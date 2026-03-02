import { describe, it, expect, vi, afterEach } from 'vitest';
import { MockBlockStream } from '../../../src/simulator/mock-stream.js';
import { HieroBridgeError } from '../../../src/types/errors.js';
import { silentLogger } from '../../setup.js';

function createStream(overrides?: Record<string, unknown>) {
  return new MockBlockStream(
    {
      blockIntervalMs: 50,
      transactionsPerBlock: 3,
      startBlockNumber: 0,
      failureRate: 0,
      ...overrides,
    },
    silentLogger,
  );
}

describe('MockBlockStream', () => {
  afterEach(async () => {
    // Ensure we don't leave timers running
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  it('start() begins emitting blocks', async () => {
    const stream = createStream();
    const blockHandler = vi.fn();
    stream.on('block', blockHandler);

    await stream.start();
    // First block is emitted synchronously on start
    expect(blockHandler).toHaveBeenCalled();
    expect(stream.isRunning()).toBe(true);

    await stream.stop();
  });

  it('stop() stops emission and emits end', async () => {
    const stream = createStream();
    const endHandler = vi.fn();
    stream.on('end', endHandler);

    await stream.start();
    await stream.stop();

    expect(stream.isRunning()).toBe(false);
    expect(endHandler).toHaveBeenCalledOnce();
  });

  it('double start() throws STREAM_ALREADY_RUNNING', async () => {
    const stream = createStream();
    await stream.start();

    await expect(stream.start()).rejects.toThrow(HieroBridgeError);
    await expect(stream.start()).rejects.toThrow('already running');

    await stream.stop();
  });

  it('double stop() is safe', async () => {
    const stream = createStream();
    await stream.start();
    await stream.stop();
    await expect(stream.stop()).resolves.toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // Pause / Resume
  // -----------------------------------------------------------------------

  it('pause() pauses block generation', async () => {
    const stream = createStream();
    await stream.start();

    stream.pause();
    expect(stream.isPaused()).toBe(true);

    await stream.stop();
  });

  it('resume() resumes after pause', async () => {
    const stream = createStream();
    const pausedHandler = vi.fn();
    const resumedHandler = vi.fn();
    stream.on('paused', pausedHandler);
    stream.on('resumed', resumedHandler);

    await stream.start();
    stream.pause();
    stream.resume();

    expect(stream.isPaused()).toBe(false);
    expect(pausedHandler).toHaveBeenCalledOnce();
    expect(resumedHandler).toHaveBeenCalledOnce();

    await stream.stop();
  });

  // -----------------------------------------------------------------------
  // Seek
  // -----------------------------------------------------------------------

  it('seek() moves the block number', async () => {
    const stream = createStream();
    await stream.seek(100);
    expect(stream.getCurrentBlockNumber()).toBe(100);
  });

  it('seek() with negative number throws', async () => {
    const stream = createStream();
    await expect(stream.seek(-1)).rejects.toThrow(HieroBridgeError);
  });

  // -----------------------------------------------------------------------
  // Block generation
  // -----------------------------------------------------------------------

  it('blocks have sequential numbers starting from startBlockNumber', async () => {
    const stream = createStream({ startBlockNumber: 0 });
    await stream.start();

    // Wait for a couple of blocks
    await new Promise((r) => setTimeout(r, 120));
    await stream.stop();

    const blocks = stream.getBlocks();
    expect(blocks.length).toBeGreaterThanOrEqual(2);
    expect(blocks[0].header.number).toBe(0);
    expect(blocks[1].header.number).toBe(1);
  });

  it('each block contains configured number of transactions', async () => {
    const stream = createStream({ transactionsPerBlock: 4 });
    await stream.start();
    await stream.stop();

    const block = stream.getBlock(0);
    expect(block).toBeDefined();

    const txItems = block!.items.filter((i) => i.kind === 'transaction');
    expect(txItems.length).toBe(4);
  });

  it('block headers have hash and timestamp', async () => {
    const stream = createStream();
    await stream.start();
    await stream.stop();

    const block = stream.getBlock(0);
    expect(block).toBeDefined();
    expect(block!.header.hash).toBeTruthy();
    expect(block!.header.timestamp).toBeTruthy();
    expect(block!.header.hashAlgorithm).toBe('SHA_384');
  });

  // -----------------------------------------------------------------------
  // Events
  // -----------------------------------------------------------------------

  it('emits block, transaction, and stateChange events', async () => {
    const stream = createStream({ transactionsPerBlock: 2 });
    const blockHandler = vi.fn();
    const txHandler = vi.fn();
    const stateHandler = vi.fn();

    stream.on('block', blockHandler);
    stream.on('transaction', txHandler);
    stream.on('stateChange', stateHandler);

    await stream.start();
    await stream.stop();

    expect(blockHandler).toHaveBeenCalled();
    expect(txHandler).toHaveBeenCalled();
    // State changes are generated from transactions
    expect(stateHandler).toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Failure injection
  // -----------------------------------------------------------------------

  it('failureRate emits error events (stream-level failure injection)', async () => {
    // failureRate controls block-level failure: the entire block generation is
    // skipped and an 'error' event is emitted. It does NOT count as
    // block.failedTransactions (those track individual tx failures within a block).
    const stream = createStream({ blockIntervalMs: 30, failureRate: 1.0 });
    const errorHandler = vi.fn();
    stream.on('error', errorHandler);

    await stream.start();
    // With failureRate=1.0, every generateAndEmitBlock fires 'error'
    await new Promise((r) => setTimeout(r, 80));
    await stream.stop();

    expect(errorHandler).toHaveBeenCalled();
    expect(errorHandler.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(errorHandler.mock.calls[0][0].message).toContain('failure injection');
  });

  // -----------------------------------------------------------------------
  // Accessors
  // -----------------------------------------------------------------------

  it('getBlocks() returns all generated blocks', async () => {
    const stream = createStream();
    await stream.start();
    await new Promise((r) => setTimeout(r, 120));
    await stream.stop();

    expect(stream.getBlocks().length).toBeGreaterThanOrEqual(2);
  });

  it('getBlock(n) returns undefined for non-existent block', () => {
    const stream = createStream();
    expect(stream.getBlock(999)).toBeUndefined();
  });
});
