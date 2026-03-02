import { describe, it, expect, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rm } from 'node:fs/promises';
import { DockerManager } from '../../src/automator/docker.js';
import { checkHardware } from '../../src/automator/hardware-check.js';
import { checkBlockNodeHealth, waitForReady } from '../../src/automator/health.js';
import { silentLogger } from '../setup.js';

// ---------------------------------------------------------------------------
// Mock execa so Docker commands don't actually execute
// ---------------------------------------------------------------------------

vi.mock('execa', () => ({
  execaCommand: vi.fn().mockResolvedValue({ stdout: '24.0.7', stderr: '' }),
}));

// ---------------------------------------------------------------------------
// DockerManager — compose file lifecycle
// ---------------------------------------------------------------------------

describe('Automator E2E — DockerManager compose lifecycle', () => {
  const workDir = join(tmpdir(), `hiero-e2e-${Date.now()}`);

  it('generateCompose() → file exists → read it back → clean it', async () => {
    const manager = new DockerManager({
      workDir,
      projectName: 'e2e-test',
      grpcPort: 19080,
      restPort: 19081,
      mirrorPort: 19551,
      logger: silentLogger,
    });

    // 1. Generate
    const composePath = await manager.generateCompose();
    expect(existsSync(composePath)).toBe(true);
    expect(composePath).toContain('docker-compose.yml');

    // 2. Read back
    const yaml = await manager.getCompose();
    expect(yaml).toContain('version:');
    expect(yaml).toContain('services:');
    expect(yaml).toContain('e2e-test-block-node');
    expect(yaml).toContain('"19080:8080"');
    expect(yaml).toContain('"19081:8081"');
    expect(yaml).toContain('"19551:5551"');

    // 3. Clean
    await manager.cleanCompose();
    expect(existsSync(composePath)).toBe(false);

    // Cleanup temp dir
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  });
});

// ---------------------------------------------------------------------------
// checkHardware — real machine
// ---------------------------------------------------------------------------

describe('Automator E2E — Hardware check', () => {
  it('checkHardware() returns a valid report on the current machine', async () => {
    // Skip Docker check to avoid dependency on Docker being installed
    const report = await checkHardware({ requireDocker: false });

    expect(report.overall).toBeDefined();
    expect(['pass', 'warn', 'fail']).toContain(report.overall);
    expect(report.platform).toBeTruthy();
    expect(report.arch).toBeTruthy();
    expect(report.timestamp).toBeTruthy();
    expect(report.checks.length).toBeGreaterThanOrEqual(3); // CPU, RAM, Disk

    const names = report.checks.map((c) => c.name);
    expect(names).toContain('CPU Cores');
    expect(names).toContain('RAM');
    expect(names).toContain('Disk Space');

    // CPU should report at least 1 core
    const cpuCheck = report.checks.find((c) => c.name === 'CPU Cores')!;
    expect(cpuCheck.actual).toMatch(/\d+ cores/);

    // RAM should report a positive amount
    const ramCheck = report.checks.find((c) => c.name === 'RAM')!;
    expect(ramCheck.actual).toMatch(/\d+\.\d+ GB/);
  });
});

// ---------------------------------------------------------------------------
// Health checks — real network (unreachable URLs)
// ---------------------------------------------------------------------------

describe('Automator E2E — Health checks (unreachable)', () => {
  it('checkBlockNodeHealth() against unreachable URL returns unhealthy', async () => {
    const result = await checkBlockNodeHealth('http://127.0.0.1:19999', 3000);

    expect(result.healthy).toBe(false);
    expect(result.url).toBe('http://127.0.0.1:19999');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.error).toBeTruthy();
  }, 10_000);

  it('waitForReady() with 2s timeout rejects for unreachable URL', async () => {
    await expect(
      waitForReady('http://127.0.0.1:19999', {
        timeoutMs: 2000,
        initialIntervalMs: 300,
        maxIntervalMs: 600,
        logger: silentLogger,
      }),
    ).rejects.toThrow();
  }, 10_000);
});
