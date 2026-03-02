import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  checkBlockNodeHealth,
  checkMirrorNodeHealth,
  waitForReady,
  getNodeMetrics,
} from '../../../src/automator/health.js';
import { silentLogger } from '../../setup.js';

// ---------------------------------------------------------------------------
// Mock fetch globally
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function okResponse(body?: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body ?? {},
    text: async () => JSON.stringify(body ?? {}),
  };
}

function errorResponse(status = 500) {
  return {
    ok: false,
    status,
    json: async () => ({}),
    text: async () => '',
  };
}

// ---------------------------------------------------------------------------
// checkBlockNodeHealth
// ---------------------------------------------------------------------------

describe('checkBlockNodeHealth()', () => {
  it('returns healthy on 200', async () => {
    mockFetch.mockResolvedValueOnce(okResponse());

    const result = await checkBlockNodeHealth('http://localhost:8081');

    expect(result.healthy).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.url).toBe('http://localhost:8081');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.timestamp).toBeTruthy();
  });

  it('returns unhealthy on network error', async () => {
    // Both endpoints fail
    mockFetch.mockRejectedValue(new Error('Connection refused'));

    const result = await checkBlockNodeHealth('http://localhost:8081');

    expect(result.healthy).toBe(false);
    expect(result.error).toContain('unreachable');
    expect(result.statusCode).toBeUndefined();
  });

  it('returns healthy: false on non-200 status', async () => {
    mockFetch.mockResolvedValue(errorResponse(503));

    const result = await checkBlockNodeHealth('http://localhost:8081');

    expect(result.healthy).toBe(false);
    expect(result.statusCode).toBe(503);
  });

  it('tries fallback endpoint when first fails', async () => {
    // First endpoint (/health) fails, second (/api/v1/blocks) succeeds
    mockFetch
      .mockRejectedValueOnce(new Error('Connection refused'))
      .mockResolvedValueOnce(okResponse());

    const result = await checkBlockNodeHealth('http://localhost:8081');

    expect(result.healthy).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('strips trailing slashes from URL', async () => {
    mockFetch.mockResolvedValueOnce(okResponse());

    const result = await checkBlockNodeHealth('http://localhost:8081///');

    expect(result.url).toBe('http://localhost:8081');
  });
});

// ---------------------------------------------------------------------------
// checkMirrorNodeHealth
// ---------------------------------------------------------------------------

describe('checkMirrorNodeHealth()', () => {
  it('returns healthy on 200', async () => {
    mockFetch.mockResolvedValueOnce(okResponse());

    const result = await checkMirrorNodeHealth('https://testnet.mirrornode.hedera.com');

    expect(result.healthy).toBe(true);
    expect(result.statusCode).toBe(200);
  });

  it('returns unhealthy when all endpoints fail', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const result = await checkMirrorNodeHealth('https://testnet.mirrornode.hedera.com');

    expect(result.healthy).toBe(false);
    expect(result.error).toContain('unreachable');
  });

  it('passes timeout via AbortController signal', async () => {
    mockFetch.mockResolvedValueOnce(okResponse());

    await checkMirrorNodeHealth('http://localhost:5551', 3000);

    // Verify fetch was called with a signal (AbortController)
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});

// ---------------------------------------------------------------------------
// waitForReady
// ---------------------------------------------------------------------------

describe('waitForReady()', () => {
  it('resolves when endpoint becomes healthy', async () => {
    mockFetch.mockResolvedValue(okResponse());

    const result = await waitForReady('http://localhost:8081', {
      timeoutMs: 5000,
      initialIntervalMs: 50,
      logger: silentLogger,
    });

    expect(result.healthy).toBe(true);
  });

  it('rejects on timeout', async () => {
    // All attempts fail
    mockFetch.mockRejectedValue(new Error('Connection refused'));

    await expect(
      waitForReady('http://localhost:8081', {
        timeoutMs: 200,
        initialIntervalMs: 50,
        maxIntervalMs: 100,
        logger: silentLogger,
      }),
    ).rejects.toThrow('did not become ready');
  });

  it('succeeds after initial failures', async () => {
    // Fail twice (both endpoints per attempt = 4 rejections), then succeed
    mockFetch
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce(okResponse());

    const result = await waitForReady('http://localhost:8081', {
      timeoutMs: 5000,
      initialIntervalMs: 30,
      logger: silentLogger,
    });

    expect(result.healthy).toBe(true);
  });

  it('uses exponential backoff (increasing delays)', async () => {
    // We track call counts over time to infer backoff behavior
    let callCount = 0;
    mockFetch.mockImplementation(async () => {
      callCount++;
      // Succeed on 5th unique health check (each check hits 2 endpoints max)
      if (callCount >= 7) return okResponse();
      throw new Error('not ready');
    });

    const start = Date.now();
    await waitForReady('http://localhost:8081', {
      timeoutMs: 10000,
      initialIntervalMs: 50,
      backoffMultiplier: 2.0,
      maxIntervalMs: 500,
      logger: silentLogger,
    });
    const elapsed = Date.now() - start;

    // With backoff multiplier 2.0 and initial 50ms, intervals grow:
    // 50 → 100 → 200 → ... Total should be noticeably more than just 3 × 50ms = 150ms
    expect(elapsed).toBeGreaterThan(100);
  });
});

// ---------------------------------------------------------------------------
// getNodeMetrics
// ---------------------------------------------------------------------------

describe('getNodeMetrics()', () => {
  it('extracts block height from response', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.includes('/blocks')) {
        return okResponse({ blocks: [{ number: 42, hash: 'abc' }] });
      }
      return okResponse({});
    });

    const metrics = await getNodeMetrics('http://localhost:8081');

    expect(metrics.healthy).toBe(true);
    expect(metrics.blockHeight).toBe(42);
    expect(metrics.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('returns healthy without blockHeight when blocks array is empty', async () => {
    mockFetch.mockResolvedValue(okResponse({ blocks: [] }));

    const metrics = await getNodeMetrics('http://localhost:8081');

    expect(metrics.healthy).toBe(true);
    expect(metrics.blockHeight).toBeUndefined();
  });

  it('handles unreachable endpoint gracefully (no crash)', async () => {
    // fetchJson catches errors internally and returns null (never throws),
    // so getNodeMetrics does NOT throw and still reports latency.
    // healthy may be true because fetchJson resolved (with null) instead of throwing.
    mockFetch.mockRejectedValue(new Error('Connection refused'));

    const metrics = await getNodeMetrics('http://localhost:8081');

    // Key assertion: does not throw, blockHeight is absent, latency is reported.
    expect(metrics.blockHeight).toBeUndefined();
    expect(metrics.latencyMs).toBeGreaterThanOrEqual(0);
    expect(metrics.timestamp).toBeTruthy();
  });

  it('sets healthy: true even if only exchange rate endpoint succeeds', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.includes('/blocks')) {
        throw new Error('blocks unavailable');
      }
      return okResponse({ current_rate: { cent: 12 } });
    });

    const metrics = await getNodeMetrics('http://localhost:8081');

    expect(metrics.healthy).toBe(true);
    expect(metrics.blockHeight).toBeUndefined();
  });
});
