import { describe, it, expect, vi, afterEach } from 'vitest';
import { ThrottleMonitor } from '../../../src/migration/throttle-monitor.js';
import { silentLogger } from '../../setup.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a monitor with a tiny limit so thresholds are easy to hit. */
function createMonitor(overrides?: Record<string, unknown>) {
  return new ThrottleMonitor({
    limits: [
      {
        id: 'test-limit',
        name: 'Test Limit',
        category: 'test',
        maxPerSecond: 10,
        warnThreshold: 70,
        criticalThreshold: 90,
      },
    ],
    windowMs: 1000,
    evaluateIntervalMs: 50,
    logger: silentLogger,
    ...overrides,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// record() and recordByType()
// ---------------------------------------------------------------------------

describe('ThrottleMonitor — record()', () => {
  it('adds operations to the sliding window', () => {
    const monitor = createMonitor();
    monitor.record('test-limit', 5);

    const snapshot = monitor.getSnapshot('test-limit');
    expect(snapshot).toBeDefined();
    expect(snapshot!.totalOperations).toBe(5);
    expect(snapshot!.currentRate).toBeGreaterThan(0);
  });

  it('records multiple calls cumulatively', () => {
    const monitor = createMonitor();
    monitor.record('test-limit', 3);
    monitor.record('test-limit', 2);

    const snapshot = monitor.getSnapshot('test-limit');
    expect(snapshot!.totalOperations).toBe(5);
  });
});

describe('ThrottleMonitor — recordByType()', () => {
  it("recordByType('CryptoTransfer') maps to 'crypto-transfer' limit", () => {
    const monitor = createMonitor();
    monitor.recordByType('CryptoTransfer', 3);

    const snapshot = monitor.getSnapshot('crypto-transfer');
    expect(snapshot).toBeDefined();
    expect(snapshot!.totalOperations).toBe(3);
  });

  it("recordByType('TokenMint') maps to 'token-mint' limit", () => {
    const monitor = createMonitor();
    monitor.recordByType('TokenMint', 1);

    const snapshot = monitor.getSnapshot('token-mint');
    expect(snapshot).toBeDefined();
    expect(snapshot!.totalOperations).toBe(1);
  });

  it('unknown type is silently ignored', () => {
    const monitor = createMonitor();
    monitor.recordByType('NonExistentType', 5);

    // Should not create any snapshot for an unknown type
    const all = monitor.getAllSnapshots();
    const unknownOps = all.filter((s) => s.totalOperations > 0 && s.limitId !== 'test-limit');
    expect(unknownOps.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getSnapshot() — status thresholds
// ---------------------------------------------------------------------------

describe('ThrottleMonitor — status thresholds', () => {
  it("status is 'ok' when under 70% utilization", () => {
    const monitor = createMonitor();
    // 6 ops in 1s window → 6/10 = 60%
    monitor.record('test-limit', 6);

    const snapshot = monitor.getSnapshot('test-limit')!;
    expect(snapshot.status).toBe('ok');
    expect(snapshot.utilizationPct).toBeLessThan(70);
  });

  it("status is 'warning' at 70–89% utilization", () => {
    const monitor = createMonitor();
    // 8 ops in 1s window → 8/10 = 80%
    monitor.record('test-limit', 8);

    const snapshot = monitor.getSnapshot('test-limit')!;
    expect(snapshot.status).toBe('warning');
    expect(snapshot.utilizationPct).toBeGreaterThanOrEqual(70);
    expect(snapshot.utilizationPct).toBeLessThan(90);
  });

  it("status is 'critical' at 90–99% utilization", () => {
    const monitor = createMonitor();
    // 9 ops in 1s window → 9/10 = 90%
    monitor.record('test-limit', 9);

    const snapshot = monitor.getSnapshot('test-limit')!;
    expect(snapshot.status).toBe('critical');
    expect(snapshot.utilizationPct).toBeGreaterThanOrEqual(90);
    expect(snapshot.utilizationPct).toBeLessThan(100);
  });

  it("status is 'exceeded' at 100%+ utilization", () => {
    const monitor = createMonitor();
    // 12 ops in 1s window → 12/10 = 120%
    monitor.record('test-limit', 12);

    const snapshot = monitor.getSnapshot('test-limit')!;
    expect(snapshot.status).toBe('exceeded');
    expect(snapshot.utilizationPct).toBeGreaterThanOrEqual(100);
  });
});

// ---------------------------------------------------------------------------
// Lifecycle — start() / stop()
// ---------------------------------------------------------------------------

describe('ThrottleMonitor — lifecycle', () => {
  it('start() begins periodic evaluation', async () => {
    const monitor = createMonitor();
    const warningHandler = vi.fn();
    monitor.on('warning', warningHandler);

    // Record enough to trigger warning (80%)
    monitor.record('test-limit', 8);
    monitor.start();

    // Wait for at least one evaluation cycle
    await new Promise((r) => setTimeout(r, 100));
    monitor.stop();

    expect(warningHandler).toHaveBeenCalled();
  });

  it('stop() stops periodic evaluation', async () => {
    const monitor = createMonitor();
    const warningHandler = vi.fn();
    monitor.on('warning', warningHandler);

    monitor.start();
    monitor.stop();

    // Record after stop
    monitor.record('test-limit', 8);

    // Wait — no evaluation should fire
    await new Promise((r) => setTimeout(r, 100));

    expect(warningHandler).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Events — status transitions
// ---------------------------------------------------------------------------

describe('ThrottleMonitor — events', () => {
  it('warning event fires on status transition to warning', async () => {
    const monitor = createMonitor();
    const handler = vi.fn();
    monitor.on('warning', handler);

    monitor.record('test-limit', 8); // 80% → warning
    monitor.start();
    await new Promise((r) => setTimeout(r, 100));
    monitor.stop();

    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].status).toBe('warning');
    expect(handler.mock.calls[0][0].limitId).toBe('test-limit');
  });

  it('exceeded event fires on status transition to exceeded', async () => {
    const monitor = createMonitor();
    const handler = vi.fn();
    monitor.on('exceeded', handler);

    monitor.record('test-limit', 12); // 120% → exceeded
    monitor.start();
    await new Promise((r) => setTimeout(r, 100));
    monitor.stop();

    expect(handler).toHaveBeenCalled();
    expect(handler.mock.calls[0][0].status).toBe('exceeded');
  });

  it('recovered event fires when rate drops back', async () => {
    const monitor = createMonitor({ evaluateIntervalMs: 30, windowMs: 80 });
    const recoveredHandler = vi.fn();
    monitor.on('recovered', recoveredHandler);

    // Push into warning
    monitor.record('test-limit', 8);
    monitor.start();

    // Wait for evaluation to detect warning, then wait for window to expire
    await new Promise((r) => setTimeout(r, 200));
    monitor.stop();

    // After the window expires, the rate drops to 0 → recovered
    expect(recoveredHandler).toHaveBeenCalled();
    expect(recoveredHandler.mock.calls[0][0].status).toBe('ok');
  });
});

// ---------------------------------------------------------------------------
// reset()
// ---------------------------------------------------------------------------

describe('ThrottleMonitor — reset()', () => {
  it('clears all counters', () => {
    const monitor = createMonitor();
    monitor.record('test-limit', 10);

    const before = monitor.getSnapshot('test-limit')!;
    expect(before.totalOperations).toBe(10);

    monitor.reset();

    const after = monitor.getSnapshot('test-limit')!;
    expect(after.totalOperations).toBe(0);
    expect(after.currentRate).toBe(0);
    expect(after.status).toBe('ok');
  });
});

// ---------------------------------------------------------------------------
// getAllSnapshots / getAlerts
// ---------------------------------------------------------------------------

describe('ThrottleMonitor — snapshots', () => {
  it('getAllSnapshots() returns all limits', () => {
    const monitor = createMonitor();
    const snapshots = monitor.getAllSnapshots();

    // Default limits (10) plus our custom test-limit
    expect(snapshots.length).toBeGreaterThanOrEqual(10);
    const ids = snapshots.map((s) => s.limitId);
    expect(ids).toContain('test-limit');
    expect(ids).toContain('crypto-transfer');
    expect(ids).toContain('crypto-create');
  });

  it('getAlerts() returns only non-ok limits', () => {
    const monitor = createMonitor();

    // Before any recording, all should be ok
    expect(monitor.getAlerts().length).toBe(0);

    // Push test-limit into warning
    monitor.record('test-limit', 8);
    const alerts = monitor.getAlerts();
    expect(alerts.length).toBe(1);
    expect(alerts[0].limitId).toBe('test-limit');
    expect(alerts[0].status).toBe('warning');
  });
});

// ---------------------------------------------------------------------------
// formatSnapshots
// ---------------------------------------------------------------------------

describe('ThrottleMonitor.formatSnapshots()', () => {
  it('produces readable table', () => {
    const monitor = createMonitor();
    monitor.record('test-limit', 5);

    const snapshots = monitor.getAllSnapshots();
    const output = ThrottleMonitor.formatSnapshots(snapshots);

    expect(output).toContain('Throttle Monitor');
    expect(output).toContain('test-limit');
    expect(output).toContain('/s');
    expect(output).toContain('%');
    expect(output).toContain('OK');
  });
});
