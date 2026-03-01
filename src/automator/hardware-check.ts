import { execaCommand } from 'execa';
import { cpus, totalmem, freemem, platform, arch } from 'node:os';
import { statfs } from 'node:fs/promises';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface HardwareCheckItem {
  name: string;
  status: CheckStatus;
  actual: string;
  required: string;
  message: string;
}

export interface HardwareReport {
  overall: CheckStatus;
  platform: string;
  arch: string;
  timestamp: string;
  checks: HardwareCheckItem[];
}

/** Block Node minimum specs per HIP-1081. */
export interface HardwareRequirements {
  /** Minimum CPU cores. Default: 4. */
  minCpuCores?: number;
  /** Minimum total RAM in GB. Default: 8. */
  minRamGb?: number;
  /** Minimum free disk space in GB. Default: 50. */
  minDiskGb?: number;
  /** Require Docker to be installed. Default: true. */
  requireDocker?: boolean;
  /** Disk path to check. Default: current working directory. */
  diskPath?: string;
}

// ---------------------------------------------------------------------------
// Default requirements (HIP-1081 Block Node minimum specs)
// ---------------------------------------------------------------------------

const DEFAULT_REQUIREMENTS: Required<HardwareRequirements> = {
  minCpuCores: 4,
  minRamGb: 8,
  minDiskGb: 50,
  requireDocker: true,
  diskPath: '.',
};

// ---------------------------------------------------------------------------
// Hardware check
// ---------------------------------------------------------------------------

/**
 * Validate system resources against Block Node minimum specs from HIP-1081.
 * Returns a report with pass/warn/fail per requirement.
 */
export async function checkHardware(
  requirements?: HardwareRequirements,
): Promise<HardwareReport> {
  const reqs = { ...DEFAULT_REQUIREMENTS, ...requirements };
  const checks: HardwareCheckItem[] = [];

  checks.push(checkCpu(reqs.minCpuCores));
  checks.push(checkRam(reqs.minRamGb));
  checks.push(await checkDisk(reqs.minDiskGb, reqs.diskPath));

  if (reqs.requireDocker) {
    checks.push(await checkDocker());
  }

  const overall = deriveOverall(checks);

  return {
    overall,
    platform: platform(),
    arch: arch(),
    timestamp: new Date().toISOString(),
    checks,
  };
}

/**
 * Print a hardware report to the console in a human-readable format.
 */
export function formatHardwareReport(report: HardwareReport): string {
  const lines: string[] = [
    `Hardware Check Report (${report.platform}/${report.arch})`,
    `${'─'.repeat(60)}`,
  ];

  for (const check of report.checks) {
    const icon = check.status === 'pass' ? '✓' : check.status === 'warn' ? '⚠' : '✗';
    const status = check.status.toUpperCase().padEnd(4);
    lines.push(`  ${icon} [${status}] ${check.name}: ${check.message}`);
    lines.push(`           Actual: ${check.actual} | Required: ${check.required}`);
  }

  lines.push(`${'─'.repeat(60)}`);
  lines.push(`Overall: ${report.overall.toUpperCase()}`);

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

function checkCpu(minCores: number): HardwareCheckItem {
  const cores = cpus().length;
  const status: CheckStatus =
    cores >= minCores ? 'pass' : cores >= minCores / 2 ? 'warn' : 'fail';

  return {
    name: 'CPU Cores',
    status,
    actual: `${cores} cores`,
    required: `≥ ${minCores} cores`,
    message:
      status === 'pass'
        ? `${cores} cores available`
        : status === 'warn'
          ? `${cores} cores (below recommended ${minCores}, may impact performance)`
          : `${cores} cores (below minimum ${minCores})`,
  };
}

function checkRam(minGb: number): HardwareCheckItem {
  const totalGb = totalmem() / (1024 ** 3);
  const freeGb = freemem() / (1024 ** 3);
  const status: CheckStatus =
    totalGb >= minGb ? 'pass' : totalGb >= minGb * 0.75 ? 'warn' : 'fail';

  return {
    name: 'RAM',
    status,
    actual: `${totalGb.toFixed(1)} GB total, ${freeGb.toFixed(1)} GB free`,
    required: `≥ ${minGb} GB`,
    message:
      status === 'pass'
        ? `${totalGb.toFixed(1)} GB available`
        : status === 'warn'
          ? `${totalGb.toFixed(1)} GB (below recommended ${minGb} GB)`
          : `${totalGb.toFixed(1)} GB (below minimum ${minGb} GB)`,
  };
}

async function checkDisk(minGb: number, diskPath: string): Promise<HardwareCheckItem> {
  try {
    const stats = await statfs(diskPath);
    const freeGb = (stats.bavail * stats.bsize) / (1024 ** 3);
    const status: CheckStatus =
      freeGb >= minGb ? 'pass' : freeGb >= minGb * 0.5 ? 'warn' : 'fail';

    return {
      name: 'Disk Space',
      status,
      actual: `${freeGb.toFixed(1)} GB free`,
      required: `≥ ${minGb} GB free`,
      message:
        status === 'pass'
          ? `${freeGb.toFixed(1)} GB free`
          : status === 'warn'
            ? `${freeGb.toFixed(1)} GB free (below recommended ${minGb} GB)`
            : `${freeGb.toFixed(1)} GB free (below minimum ${minGb} GB)`,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      name: 'Disk Space',
      status: 'warn',
      actual: 'Unable to determine',
      required: `≥ ${minGb} GB free`,
      message: `Could not check disk space: ${msg}`,
    };
  }
}

async function checkDocker(): Promise<HardwareCheckItem> {
  try {
    const { stdout } = await execaCommand('docker version --format "{{.Server.Version}}"');
    const version = stdout.trim().replace(/"/g, '');

    return {
      name: 'Docker',
      status: 'pass',
      actual: `v${version}`,
      required: 'Installed and running',
      message: `Docker v${version} available`,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const isDaemonOff = msg.includes('daemon') || msg.includes('connect');

    return {
      name: 'Docker',
      status: 'fail',
      actual: isDaemonOff ? 'Installed but daemon not running' : 'Not found',
      required: 'Installed and running',
      message: isDaemonOff
        ? 'Docker is installed but the daemon is not running. Start Docker Desktop.'
        : 'Docker not found. Install Docker Desktop or Docker Engine.',
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deriveOverall(checks: HardwareCheckItem[]): CheckStatus {
  if (checks.some((c) => c.status === 'fail')) return 'fail';
  if (checks.some((c) => c.status === 'warn')) return 'warn';
  return 'pass';
}
