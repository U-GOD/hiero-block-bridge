import { describe, it, expect, vi, afterEach } from 'vitest';
import { GrpcBlockClient } from '../../../src/simulator/grpc-client.js';
import { silentLogger } from '../../setup.js';

function createClient(overrides?: Record<string, unknown>) {
  return new GrpcBlockClient({
    endpoint: 'localhost:19999',
    connectionTimeoutMs: 500,
    startBlockNumber: 0,
    logger: silentLogger,
    ...overrides,
  });
}

describe('GrpcBlockClient', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // Initial state
  // -----------------------------------------------------------------------

  it('starts in disconnected state', () => {
    const client = createClient();
    expect(client.isConnected()).toBe(false);
    expect(client.getBlockCount()).toBe(0);
  });

  // -----------------------------------------------------------------------
  // Connection failure paths
  // -----------------------------------------------------------------------

  it('connect() returns false when Block Node is unreachable', async () => {
    const client = createClient({
      endpoint: 'localhost:19999',
      connectionTimeoutMs: 500,
    });

    const failHandler = vi.fn();
    client.on('connectionFailed', failHandler);

    const result = await client.connect();

    expect(result).toBe(false);
    expect(client.isConnected()).toBe(false);
    expect(failHandler).toHaveBeenCalled();
  });

  it('emits connectionFailed with descriptive reason', async () => {
    const client = createClient({
      endpoint: 'localhost:19999',
      connectionTimeoutMs: 300,
    });

    const reasons: string[] = [];
    client.on('connectionFailed', (reason) => reasons.push(reason));

    await client.connect();

    expect(reasons.length).toBeGreaterThan(0);
    // Should contain either a message about gRPC not installed or node unreachable
    expect(reasons[0]).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // Disconnect
  // -----------------------------------------------------------------------

  it('disconnect() is safe to call when not connected', async () => {
    const client = createClient();
    // Should not throw
    await expect(client.disconnect()).resolves.toBeUndefined();
    expect(client.isConnected()).toBe(false);
  });

  it('disconnect() after failed connect is safe', async () => {
    const client = createClient({ connectionTimeoutMs: 300 });
    await client.connect(); // Will fail
    await expect(client.disconnect()).resolves.toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // Block count
  // -----------------------------------------------------------------------

  it('getBlockCount() returns 0 when no blocks received', async () => {
    const client = createClient();
    expect(client.getBlockCount()).toBe(0);

    // Even after a failed connection attempt
    await client.connect();
    expect(client.getBlockCount()).toBe(0);
  });

  // -----------------------------------------------------------------------
  // Configuration
  // -----------------------------------------------------------------------

  it('accepts custom endpoint and timeout', () => {
    const client = createClient({
      endpoint: 'my-block-node.hedera.com:443',
      connectionTimeoutMs: 15000,
    });
    expect(client).toBeDefined();
    expect(client.isConnected()).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Internal Mapping / Stream Response handling
  // -----------------------------------------------------------------------

  it('maps block header and items and flushes complete block', () => {
    const client = createClient() as any;
    const blockHandler = vi.fn();
    client.on('block', blockHandler);

    // Simulate stream receiving a header
    client.handleStreamResponse({
      blockHeader: {
        blockNumber: 42,
        blockHash: Buffer.from('hash1'),
        previousBlockHash: Buffer.from('hash0'),
        consensusTimestamp: '2026-01-01T00:00:00Z',
        itemCount: 2,
        softwareVersion: '0.80.0',
      },
    });

    expect(client.accumulator.header).toBeDefined();
    expect(client.accumulator.header.number).toBe(42);
    expect(blockHandler).not.toHaveBeenCalled();

    // Simulate stream receiving a transaction item
    client.handleStreamResponse({
      blockItem: {
        transaction: {
          transactionId: '0.0.100@123',
          transactionType: 'CryptoTransfer',
          payerAccountId: '0.0.100',
          receipt: { status: 'SUCCESS' },
          fee: 1000,
        },
      },
    });

    expect(client.accumulator.items.length).toBe(1);

    // Simulate stream receiving a state change item
    client.handleStreamResponse({
      blockItem: {
        stateChange: {
          entityId: '0.0.100',
          changeType: 'BALANCE',
          previousValue: '10',
          newValue: '20',
        },
      },
    });

    expect(client.accumulator.items.length).toBe(2);

    // Simulate stream receiving a proof (triggers flush)
    client.handleStreamResponse({
      blockProof: {
        blockNumber: 42,
        blockHash: Buffer.from('hash1'),
        signature: Buffer.from('sig'),
        verified: true,
      },
    });

    expect(blockHandler).toHaveBeenCalled();
    const emittedBlock = blockHandler.mock.calls[0][0];
    expect(emittedBlock.header.number).toBe(42);
    expect(emittedBlock.items.length).toBe(2);
    expect(emittedBlock.proof.verified).toBe(true);
    expect(emittedBlock.successfulTransactions).toBe(1);

    // Accumulator should be reset
    expect(client.accumulator.header).toBeNull();
  });

  it('handles stream status updates gracefully', () => {
    const client = createClient() as any;
    // Should not throw or crash
    client.handleStreamResponse({
      status: {
        type: 'HEARTBEAT',
        message: 'alive',
      },
    });
  });

  it('handles stream error events correctly', () => {
    const client = createClient() as any;
    const errHandler = vi.fn();
    const disconnectHandler = vi.fn();
    
    client.on('error', errHandler);
    client.on('disconnected', disconnectHandler);

    client.grpcCall = new (require('events').EventEmitter)();
    client.setupStreamHandlers();

    client.grpcCall.emit('error', new Error('stream reset'));

    expect(errHandler).toHaveBeenCalled();
    expect(disconnectHandler).toHaveBeenCalled();
    expect(client.isConnected()).toBe(false);
  });

  it('handles stream end events correctly', () => {
    const client = createClient() as any;
    const disconnectHandler = vi.fn();
    
    client.on('disconnected', disconnectHandler);

    client.grpcCall = new (require('events').EventEmitter)();
    client.setupStreamHandlers();

    client.grpcCall.emit('end');

    expect(disconnectHandler).toHaveBeenCalled();
    expect(client.isConnected()).toBe(false);
  });
});
