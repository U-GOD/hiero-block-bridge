import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  checkHardware,
  formatHardwareReport,
  type HardwareReport,
  type HardwareCheckItem,
} from '../../../src/automator/hardware-check.js';

// ---------------------------------------------------------------------------
// Mock execa (Docker check)
// ---------------------------------------------------------------------------

vi.mock('execa', () => ({
  execaCommand: vi.fn().mockResolvedValue({ stdout: '24.0.7', stderr: '' }),
}));

import { execaCommand } from 'execa';
const mockExeca = vi.mocked(execaCommand);

// ---------------------------------------------------------------------------
// Mock node:os (CPU & RAM)
// ---------------------------------------------------------------------------

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return {
    ...actual,
    cpus: vi.fn(() => new Array(8).fill({ model: 'Mock CPU', speed: 3000 })),
    totalmem: vi.fn(() => 16 * 1024 ** 3),  // 16 GB
    freemem: vi.fn(() => 8 * 1024 ** 3),     // 8 GB free
  };
});

import { cpus, totalmem, freemem } from 'node:os';

// ---------------------------------------------------------------------------
// Mock node:fs/promises (Disk check)
// ---------------------------------------------------------------------------

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    statfs: vi.fn().mockResolvedValue({
      bavail: 100 * 1024 * 1024,  // blocks available
      bsize: 1024,                 // block size → 100 GB free
    }),
  };
});

import { statfs } from 'node:fs/promises';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockExeca.mockReset();
  mockExeca.mockResolvedValue({ stdout: '24.0.7', stderr: '' } as any);

  vi.mocked(cpus).mockReturnValue(
    new Array(8).fill({ model: 'Mock CPU', speed: 3000 }) as any,
  );
  vi.mocked(totalmem).mockReturnValue(16 * 1024 ** 3);
  vi.mocked(freemem).mockReturnValue(8 * 1024 ** 3);
  vi.mocked(statfs).mockResolvedValue({
    bavail: 100 * 1024 * 1024,
    bsize: 1024,
  } as any);
});

// ---------------------------------------------------------------------------
// checkHardware — complete report
// ---------------------------------------------------------------------------

describe('checkHardware()', () => {
  it('returns a complete report with all expected fields', async () => {
    const report = await checkHardware();

    expect(report.overall).toBeDefined();
    expect(report.platform).toBeTruthy();
    expect(report.arch).toBeTruthy();
    expect(report.timestamp).toBeTruthy();
    expect(report.checks.length).toBeGreaterThanOrEqual(4);
  });

  it('report includes CPU, RAM, Disk, and Docker checks', async () => {
    const report = await checkHardware();
    const names = report.checks.map((c) => c.name);

    expect(names).toContain('CPU Cores');
    expect(names).toContain('RAM');
    expect(names).toContain('Disk Space');
    expect(names).toContain('Docker');
  });

  it('skips Docker check when requireDocker is false', async () => {
    const report = await checkHardware({ requireDocker: false });
    const names = report.checks.map((c) => c.name);

    expect(names).not.toContain('Docker');
  });
});

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

describe('checkHardware() — CPU', () => {
  it('reports correct core count', async () => {
    vi.mocked(cpus).mockReturnValue(
      new Array(6).fill({ model: 'CPU', speed: 3000 }) as any,
    );

    const report = await checkHardware({ requireDocker: false });
    const cpuCheck = report.checks.find((c) => c.name === 'CPU Cores')!;

    expect(cpuCheck.actual).toContain('6 cores');
    expect(cpuCheck.status).toBe('pass');
  });

  it('warns when CPU cores are below minimum but ≥ half', async () => {
    vi.mocked(cpus).mockReturnValue(
      new Array(2).fill({ model: 'CPU', speed: 3000 }) as any,
    );

    const report = await checkHardware({ minCpuCores: 4, requireDocker: false });
    const cpuCheck = report.checks.find((c) => c.name === 'CPU Cores')!;

    expect(cpuCheck.status).toBe('warn');
  });

  it('fails when CPU cores are below half of minimum', async () => {
    vi.mocked(cpus).mockReturnValue(
      new Array(1).fill({ model: 'CPU', speed: 3000 }) as any,
    );

    const report = await checkHardware({ minCpuCores: 4, requireDocker: false });
    const cpuCheck = report.checks.find((c) => c.name === 'CPU Cores')!;

    expect(cpuCheck.status).toBe('fail');
  });
});

describe('checkHardware() — RAM', () => {
  it('reports correct total GB', async () => {
    vi.mocked(totalmem).mockReturnValue(32 * 1024 ** 3);

    const report = await checkHardware({ requireDocker: false });
    const ramCheck = report.checks.find((c) => c.name === 'RAM')!;

    expect(ramCheck.actual).toContain('32.0 GB');
    expect(ramCheck.status).toBe('pass');
  });

  it('warns when RAM is below minimum but ≥ 75%', async () => {
    vi.mocked(totalmem).mockReturnValue(7 * 1024 ** 3); // 7 GB (75% of 8 = 6)

    const report = await checkHardware({ minRamGb: 8, requireDocker: false });
    const ramCheck = report.checks.find((c) => c.name === 'RAM')!;

    expect(ramCheck.status).toBe('warn');
  });
});

describe('checkHardware() — Disk', () => {
  it('reports free space', async () => {
    const report = await checkHardware({ requireDocker: false });
    const diskCheck = report.checks.find((c) => c.name === 'Disk Space')!;

    expect(diskCheck.actual).toContain('GB free');
    expect(diskCheck.status).toBe('pass');
  });

  it('warns when disk check fails to read', async () => {
    vi.mocked(statfs).mockRejectedValueOnce(new Error('Permission denied'));

    const report = await checkHardware({ requireDocker: false });
    const diskCheck = report.checks.find((c) => c.name === 'Disk Space')!;

    expect(diskCheck.status).toBe('warn');
    expect(diskCheck.message).toContain('Could not check');
  });
});

describe('checkHardware() — Docker', () => {
  it('passes when Docker is available', async () => {
    const report = await checkHardware();
    const dockerCheck = report.checks.find((c) => c.name === 'Docker')!;

    expect(dockerCheck.status).toBe('pass');
    expect(dockerCheck.actual).toContain('v24.0.7');
  });

  it('fails when Docker is not found', async () => {
    mockExeca.mockRejectedValueOnce(new Error('command not found'));

    const report = await checkHardware();
    const dockerCheck = report.checks.find((c) => c.name === 'Docker')!;

    expect(dockerCheck.status).toBe('fail');
    expect(dockerCheck.message).toContain('not found');
  });
});

// ---------------------------------------------------------------------------
// Overall status derivation
// ---------------------------------------------------------------------------

describe('checkHardware() — overall status', () => {
  it('overall is pass when all checks pass', async () => {
    const report = await checkHardware();
    expect(report.overall).toBe('pass');
  });

  it('overall is fail if any check fails', async () => {
    // Make Docker fail
    mockExeca.mockRejectedValueOnce(new Error('not found'));

    const report = await checkHardware();
    expect(report.overall).toBe('fail');
  });

  it('overall is warn if any check warns (none fail)', async () => {
    // 2 cores → warn for minCpuCores=4
    vi.mocked(cpus).mockReturnValue(
      new Array(2).fill({ model: 'CPU', speed: 3000 }) as any,
    );

    const report = await checkHardware({ minCpuCores: 4 });
    expect(report.overall).toBe('warn');
  });
});

// ---------------------------------------------------------------------------
// formatHardwareReport
// ---------------------------------------------------------------------------

describe('formatHardwareReport()', () => {
  it('produces readable output with all checks', async () => {
    const report = await checkHardware();
    const output = formatHardwareReport(report);

    expect(output).toContain('Hardware Check Report');
    expect(output).toContain('CPU Cores');
    expect(output).toContain('RAM');
    expect(output).toContain('Disk Space');
    expect(output).toContain('Docker');
    expect(output).toContain('Overall:');
  });

  it('uses correct icons for each status', () => {
    const report: HardwareReport = {
      overall: 'warn',
      platform: 'test',
      arch: 'x64',
      timestamp: new Date().toISOString(),
      checks: [
        { name: 'Pass Check', status: 'pass', actual: 'ok', required: 'ok', message: 'Good' },
        { name: 'Warn Check', status: 'warn', actual: 'low', required: 'high', message: 'Low' },
        { name: 'Fail Check', status: 'fail', actual: 'bad', required: 'good', message: 'Bad' },
      ],
    };

    const output = formatHardwareReport(report);

    expect(output).toContain('✓');
    expect(output).toContain('⚠');
    expect(output).toContain('✗');
  });
});
