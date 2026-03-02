import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import { readFile, unlink, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DockerManager } from '../../../src/automator/docker.js';
import { HieroBridgeError, ErrorCode } from '../../../src/types/errors.js';
import { silentLogger } from '../../setup.js';

// ---------------------------------------------------------------------------
// Mock execa — We mock the entire module so shell commands are never executed.
// ---------------------------------------------------------------------------

vi.mock('execa', () => ({
  execaCommand: vi.fn().mockResolvedValue({ stdout: '', stderr: '' }),
}));

import { execaCommand } from 'execa';
const mockExeca = vi.mocked(execaCommand);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let workDir: string;

function createManager(overrides?: Record<string, unknown>) {
  return new DockerManager({
    workDir,
    projectName: 'test-project',
    grpcPort: 9080,
    restPort: 9081,
    mirrorPort: 9551,
    logger: silentLogger,
    ...overrides,
  });
}

beforeEach(() => {
  workDir = join(tmpdir(), `hiero-test-${Date.now()}`);
  mockExeca.mockReset();
  mockExeca.mockResolvedValue({ stdout: '', stderr: '' } as any);
});

afterEach(async () => {
  // Clean up temp directory
  try {
    await rm(workDir, { recursive: true, force: true });
  } catch {
    // Ignore
  }
});

// ---------------------------------------------------------------------------
// Compose file management
// ---------------------------------------------------------------------------

describe('DockerManager — compose file management', () => {
  it('generateCompose() creates a YAML file', async () => {
    const manager = createManager();
    const path = await manager.generateCompose();

    expect(existsSync(path)).toBe(true);
    expect(path).toContain('docker-compose.yml');
  });

  it('generated YAML contains configured ports', async () => {
    const manager = createManager({ grpcPort: 9080, restPort: 9081 });
    await manager.generateCompose();

    const yaml = await manager.getCompose();
    expect(yaml).toContain('"9080:8080"');
    expect(yaml).toContain('"9081:8081"');
  });

  it('generated YAML contains custom environment variables', async () => {
    const manager = createManager({
      env: { MY_VAR: 'test-value', ANOTHER: '42' },
    });
    await manager.generateCompose();

    const yaml = await manager.getCompose();
    expect(yaml).toContain('MY_VAR: "test-value"');
    expect(yaml).toContain('ANOTHER: "42"');
  });

  it('generated YAML contains the project name in container names', async () => {
    const manager = createManager({ projectName: 'my-project' });
    await manager.generateCompose();

    const yaml = await manager.getCompose();
    expect(yaml).toContain('my-project-block-node');
    expect(yaml).toContain('my-project-mirror-node');
  });

  it('getCompose() reads back the generated file', async () => {
    const manager = createManager();
    await manager.generateCompose();

    const yaml = await manager.getCompose();
    expect(yaml).toContain('version:');
    expect(yaml).toContain('services:');
    expect(yaml).toContain('block-node:');
  });

  it('getCompose() throws when no file exists', async () => {
    const manager = createManager();
    await expect(manager.getCompose()).rejects.toThrow(HieroBridgeError);
  });

  it('cleanCompose() removes the file', async () => {
    const manager = createManager();
    const path = await manager.generateCompose();
    expect(existsSync(path)).toBe(true);

    await manager.cleanCompose();
    expect(existsSync(path)).toBe(false);
  });

  it('cleanCompose() is safe when file does not exist', async () => {
    const manager = createManager();
    await expect(manager.cleanCompose()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Accessors
// ---------------------------------------------------------------------------

describe('DockerManager — accessors', () => {
  it('getProjectName() returns configured project name', () => {
    const manager = createManager({ projectName: 'my-test' });
    expect(manager.getProjectName()).toBe('my-test');
  });

  it('getProjectName() returns default when not configured', () => {
    const manager = new DockerManager({ workDir, logger: silentLogger });
    expect(manager.getProjectName()).toBe('hiero-block-node');
  });

  it('getPorts() returns configured ports', () => {
    const manager = createManager({ grpcPort: 1111, restPort: 2222, mirrorPort: 3333 });
    const ports = manager.getPorts();
    expect(ports).toEqual({ grpc: 1111, rest: 2222, mirror: 3333 });
  });

  it('getPorts() returns defaults when not configured', () => {
    const manager = new DockerManager({ workDir, logger: silentLogger });
    expect(manager.getPorts()).toEqual({ grpc: 8080, rest: 8081, mirror: 5551 });
  });

  it('getComposePath() returns expected path', () => {
    const manager = createManager();
    expect(manager.getComposePath()).toBe(join(workDir, 'docker-compose.yml'));
  });
});

// ---------------------------------------------------------------------------
// Docker availability check (mocked execa)
// ---------------------------------------------------------------------------

describe('DockerManager — checkDocker', () => {
  it('returns available: true with version when Docker is present', async () => {
    mockExeca.mockResolvedValueOnce({ stdout: '24.0.7', stderr: '' } as any);

    const manager = createManager();
    const result = await manager.checkDocker();

    expect(result.available).toBe(true);
    expect(result.version).toBe('24.0.7');
    expect(mockExeca).toHaveBeenCalledWith(
      expect.stringContaining('docker version'),
    );
  });

  it('returns available: false when Docker is not found', async () => {
    mockExeca.mockRejectedValueOnce(new Error('docker: command not found'));

    const manager = createManager();
    const result = await manager.checkDocker();

    expect(result.available).toBe(false);
    expect(result.error).toContain('not found');
  });
});

// ---------------------------------------------------------------------------
// Container lifecycle (mocked execa)
// ---------------------------------------------------------------------------

describe('DockerManager — container lifecycle', () => {
  it('up() calls docker compose up -d', async () => {
    const manager = createManager();
    await manager.generateCompose();

    await manager.up();

    expect(mockExeca).toHaveBeenCalledWith(
      expect.stringContaining('up -d'),
    );
  });

  it('up() emits containerUp event', async () => {
    const manager = createManager();
    await manager.generateCompose();

    const handler = vi.fn();
    manager.on('containerUp', handler);

    await manager.up();
    expect(handler).toHaveBeenCalledWith('test-project');
  });

  it('down() calls docker compose down', async () => {
    const manager = createManager();

    await manager.down();

    expect(mockExeca).toHaveBeenCalledWith(
      expect.stringContaining('down'),
    );
  });

  it('down() emits containerDown event', async () => {
    const manager = createManager();
    const handler = vi.fn();
    manager.on('containerDown', handler);

    await manager.down();
    expect(handler).toHaveBeenCalledWith('test-project');
  });
});

// ---------------------------------------------------------------------------
// Error wrapping
// ---------------------------------------------------------------------------

describe('DockerManager — error wrapping', () => {
  it('wraps "not found" errors as DOCKER_NOT_FOUND', async () => {
    mockExeca.mockRejectedValueOnce(new Error('docker: command not found'));

    const manager = createManager();
    await manager.generateCompose();

    await expect(manager.up()).rejects.toThrow(HieroBridgeError);
    try {
      await manager.up();
    } catch (e) {
      expect((e as HieroBridgeError).code).toBe(ErrorCode.DOCKER_NOT_FOUND);
    }
  });

  it('wraps other errors as DOCKER_COMPOSE_FAILED', async () => {
    mockExeca.mockRejectedValueOnce(new Error('permission denied'));

    const manager = createManager();
    await manager.generateCompose();

    await expect(manager.up()).rejects.toThrow(HieroBridgeError);
    try {
      await manager.up();
    } catch (e) {
      expect((e as HieroBridgeError).code).toBe(ErrorCode.DOCKER_COMPOSE_FAILED);
    }
  });
});

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

describe('DockerManager — events', () => {
  it('emits composeGenerated on generateCompose()', async () => {
    const manager = createManager();
    const handler = vi.fn();
    manager.on('composeGenerated', handler);

    await manager.generateCompose();
    expect(handler).toHaveBeenCalledWith(expect.stringContaining('docker-compose.yml'));
  });
});
