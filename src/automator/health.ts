import { createLogger } from '../core/logger.js';
import type pino from 'pino';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HealthCheckResult {
  url: string;
  healthy: boolean;
  statusCode?: number;
  latencyMs: number;
  error?: string;
  timestamp: string;
}

export interface NodeMetrics {
  url: string;
  healthy: boolean;
  latencyMs: number;
  blockHeight?: number;
  version?: string;
  uptimeSeconds?: number;
  timestamp: string;
}

export interface WaitForReadyOptions {
  /** Maximum time to wait in milliseconds. Default: 120_000 (2 min). */
  timeoutMs?: number;
  /** Initial polling interval in milliseconds. Default: 1_000. */
  initialIntervalMs?: number;
  /** Maximum polling interval after backoff. Default: 10_000. */
  maxIntervalMs?: number;
  /** Backoff multiplier. Default: 1.5. */
  backoffMultiplier?: number;
  logger?: pino.Logger;
}

// ---------------------------------------------------------------------------
// Health check functions
// ---------------------------------------------------------------------------

/**
 * Ping a Block Node REST/gRPC endpoint to determine availability.
 * Tries the `/health` and `/api/v1/blocks` endpoints in sequence.
 */
export async function checkBlockNodeHealth(
  url: string,
  timeoutMs = 5_000,
): Promise<HealthCheckResult> {
  const baseUrl = url.replace(/\/+$/, '');
  const start = Date.now();
  const timestamp = new Date().toISOString();

  const endpoints = [
    `${baseUrl}/health`,
    `${baseUrl}/api/v1/blocks?limit=1`,
  ];

  for (const endpoint of endpoints) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(endpoint, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });

      clearTimeout(timer);

      return {
        url: baseUrl,
        healthy: response.ok,
        statusCode: response.status,
        latencyMs: Date.now() - start,
        timestamp,
      };
    } catch {
      continue;
    }
  }

  return {
    url: baseUrl,
    healthy: false,
    latencyMs: Date.now() - start,
    error: 'All health endpoints unreachable',
    timestamp,
  };
}

/**
 * Ping a Mirror Node REST API to check availability.
 * Uses the standard `/api/v1/transactions?limit=1` endpoint.
 */
export async function checkMirrorNodeHealth(
  url: string,
  timeoutMs = 5_000,
): Promise<HealthCheckResult> {
  const baseUrl = url.replace(/\/+$/, '');
  const start = Date.now();
  const timestamp = new Date().toISOString();

  const endpoints = [
    `${baseUrl}/api/v1/transactions?limit=1`,
    `${baseUrl}/health`,
  ];

  for (const endpoint of endpoints) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(endpoint, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });

      clearTimeout(timer);

      return {
        url: baseUrl,
        healthy: response.ok,
        statusCode: response.status,
        latencyMs: Date.now() - start,
        timestamp,
      };
    } catch {
      continue;
    }
  }

  return {
    url: baseUrl,
    healthy: false,
    latencyMs: Date.now() - start,
    error: 'All health endpoints unreachable',
    timestamp,
  };
}

/**
 * Poll an endpoint until it responds successfully, using exponential backoff.
 * Resolves when healthy, rejects on timeout.
 */
export async function waitForReady(
  url: string,
  options?: WaitForReadyOptions,
): Promise<HealthCheckResult> {
  const timeoutMs = options?.timeoutMs ?? 120_000;
  const initialInterval = options?.initialIntervalMs ?? 1_000;
  const maxInterval = options?.maxIntervalMs ?? 10_000;
  const multiplier = options?.backoffMultiplier ?? 1.5;
  const logger = options?.logger ?? createLogger({ level: 'info' });

  const deadline = Date.now() + timeoutMs;
  let interval = initialInterval;
  let attempt = 0;

  logger.info({ url, timeoutMs }, 'Waiting for endpoint to become ready');

  while (Date.now() < deadline) {
    attempt++;

    const result = await checkBlockNodeHealth(url, 5_000);
    if (result.healthy) {
      logger.info({ url, attempt, latencyMs: result.latencyMs }, 'Endpoint is ready');
      return result;
    }

    logger.debug(
      { url, attempt, nextRetryMs: interval, error: result.error },
      'Endpoint not ready, retrying',
    );

    const remainingMs = deadline - Date.now();
    await sleep(Math.min(interval, remainingMs));

    interval = Math.min(interval * multiplier, maxInterval);
  }

  throw new Error(`Endpoint ${url} did not become ready within ${timeoutMs}ms (${attempt} attempts)`);
}

/**
 * Fetch basic performance metrics from a Block Node or Mirror Node.
 * Attempts to read block height, version, and response latency.
 */
export async function getNodeMetrics(
  url: string,
  timeoutMs = 5_000,
): Promise<NodeMetrics> {
  const baseUrl = url.replace(/\/+$/, '');
  const start = Date.now();
  const timestamp = new Date().toISOString();

  const metrics: NodeMetrics = {
    url: baseUrl,
    healthy: false,
    latencyMs: 0,
    timestamp,
  };

  try {
    // Fetch latest block to determine block height
    const blockResponse = await fetchJson(
      `${baseUrl}/api/v1/blocks?limit=1&order=desc`,
      timeoutMs,
    );

    metrics.healthy = true;
    metrics.latencyMs = Date.now() - start;

    if (blockResponse) {
      const blocks = blockResponse['blocks'] as Array<Record<string, unknown>> | undefined;
      if (blocks && blocks.length > 0 && typeof blocks[0]['number'] === 'number') {
        metrics.blockHeight = blocks[0]['number'];
      }
    }
  } catch {
    metrics.latencyMs = Date.now() - start;
  }

  try {
    // Fetch network info for version
    const statusResponse = await fetchJson(
      `${baseUrl}/api/v1/network/exchangerate`,
      timeoutMs,
    );

    if (statusResponse) {
      metrics.healthy = true;
    }
  } catch {
    // Non-critical
  }

  return metrics;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(
  url: string,
  timeoutMs: number,
): Promise<Record<string, unknown> | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    clearTimeout(timer);

    if (!response.ok) return null;
    return (await response.json()) as Record<string, unknown>;
  } catch {
    clearTimeout(timer);
    return null;
  }
}
