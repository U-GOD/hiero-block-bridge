import { describe, it, expect, vi, afterEach } from 'vitest';
import { BlockStream, MockBlockStream } from '../../../src/simulator/mock-stream.js';
import { silentLogger } from '../../setup.js';

function createStream(overrides?: Record<string, unknown>) {
  return new BlockStream(
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

describe('BlockStream — passthrough mode', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // Backwards compatibility
  // -----------------------------------------------------------------------

  it('MockBlockStream is an alias for BlockStream', () => {
    expect(MockBlockStream).toBe(BlockStream);
  });

  it('instances created via MockBlockStream alias work correctly', async () => {
    const stream = new MockBlockStream(
      { blockIntervalMs: 50, transactionsPerBlock: 2 },
      silentLogger,
    );
    const blockHandler = vi.fn();
    stream.on('block', blockHandler);

    await stream.start();
    expect(blockHandler).toHaveBeenCalled();
    await stream.stop();
  });

  // -----------------------------------------------------------------------
  // getSource()
  // -----------------------------------------------------------------------

  it('getSource() defaults to "mock" before start', () => {
    const stream = createStream();
    expect(stream.getSource()).toBe('mock');
  });

  it('getSource() returns "mock" in default mock mode', async () => {
    const stream = createStream();
    await stream.start();
    expect(stream.getSource()).toBe('mock');
    await stream.stop();
  });

  it('getSource() resets to "mock" after stop', async () => {
    const stream = createStream();
    await stream.start();
    await stream.stop();
    expect(stream.getSource()).toBe('mock');
  });

  // -----------------------------------------------------------------------
  // Passthrough mode — graceful fallback (no gRPC server running)
  // -----------------------------------------------------------------------

  it('passthrough mode falls back to mock when Block Node is unreachable', async () => {
    const stream = createStream({
      mode: 'passthrough',
      blockNodeEndpoint: 'localhost:19999', // Nothing listening here
      connectionTimeoutMs: 500,
    });

    const fallbackHandler = vi.fn();
    const blockHandler = vi.fn();
    stream.on('fallback', fallbackHandler);
    stream.on('block', blockHandler);

    await stream.start();

    expect(stream.isRunning()).toBe(true);
    expect(stream.getSource()).toBe('mock');
    expect(fallbackHandler).toHaveBeenCalled();
    expect(fallbackHandler.mock.calls[0][0]).toContain('Could not connect');
    // Mock simulation started as fallback, so blocks should be emitted
    expect(blockHandler).toHaveBeenCalled();

    await stream.stop();
  });

  it('passthrough mode falls back gracefully when gRPC packages are not installed', async () => {
    // The dynamic import of @grpc/grpc-js will fail in the test environment
    // unless explicitly installed. This tests the graceful degradation path.
    const stream = createStream({
      mode: 'passthrough',
      blockNodeEndpoint: 'localhost:19999',
      connectionTimeoutMs: 500,
    });

    const fallbackHandler = vi.fn();
    stream.on('fallback', fallbackHandler);

    await stream.start();

    // Should have fallen back to mock regardless of reason
    expect(stream.getSource()).toBe('mock');
    expect(stream.isRunning()).toBe(true);

    await stream.stop();
  });

  it('passthrough mode still emits all standard events after fallback', async () => {
    const stream = createStream({
      mode: 'passthrough',
      blockNodeEndpoint: 'localhost:19999',
      connectionTimeoutMs: 500,
      transactionsPerBlock: 2,
    });

    const blockHandler = vi.fn();
    const txHandler = vi.fn();
    const stateHandler = vi.fn();
    const streamEventHandler = vi.fn();

    stream.on('block', blockHandler);
    stream.on('transaction', txHandler);
    stream.on('stateChange', stateHandler);
    stream.on('streamEvent', streamEventHandler);

    await stream.start();

    // Wait for at least one block cycle
    await new Promise((r) => setTimeout(r, 80));
    await stream.stop();

    expect(blockHandler).toHaveBeenCalled();
    expect(txHandler).toHaveBeenCalled();
    expect(stateHandler).toHaveBeenCalled();
    expect(streamEventHandler).toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Mock mode (default) — existing behavior preserved
  // -----------------------------------------------------------------------

  it('mock mode works exactly as before when mode is not specified', async () => {
    const stream = createStream(); // No mode specified
    const blockHandler = vi.fn();
    stream.on('block', blockHandler);

    await stream.start();
    expect(stream.getSource()).toBe('mock');
    expect(blockHandler).toHaveBeenCalled();

    await stream.stop();
  });

  it('explicit mock mode works identically to default', async () => {
    const stream = createStream({ mode: 'mock' });
    const blockHandler = vi.fn();
    stream.on('block', blockHandler);

    await stream.start();
    expect(stream.getSource()).toBe('mock');
    expect(blockHandler).toHaveBeenCalled();

    await stream.stop();
  });

  // -----------------------------------------------------------------------
  // Config validation for new options
  // -----------------------------------------------------------------------

  it('accepts valid passthrough config options', () => {
    const stream = createStream({
      mode: 'passthrough',
      blockNodeEndpoint: 'mynode.example.com:8080',
      connectionTimeoutMs: 10000,
    });
    expect(stream).toBeDefined();
  });

  it('uses default blockNodeEndpoint when not specified', async () => {
    const stream = createStream({ mode: 'passthrough', connectionTimeoutMs: 300 });
    const fallbackHandler = vi.fn();
    stream.on('fallback', fallbackHandler);

    await stream.start();

    // Will fall back since no real node is running at default endpoint
    expect(stream.getSource()).toBe('mock');

    await stream.stop();
  });
});
