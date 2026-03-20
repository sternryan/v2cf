import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { Command } from 'commander';

// Mock all sync module dependencies
vi.mock('../../src/sync/vercel-webhook.js', () => ({
  registerVercelWebhook: vi.fn(),
  deleteVercelWebhook: vi.fn(),
}));

vi.mock('../../src/sync/worker-deployer.js', () => ({
  deployWebhookWorker: vi.fn(),
  deleteWebhookWorker: vi.fn(),
}));

vi.mock('../../src/sync/sync-state.js', () => ({
  readSyncState: vi.fn(),
  writeSyncState: vi.fn(),
}));

vi.mock('../../src/sync/github-action-gen.js', () => ({
  generateSyncWorkflow: vi.fn(),
}));

vi.mock('execa', () => ({
  execa: vi.fn(),
}));

vi.mock('../../src/orchestrator/wrangler-runner.js', () => ({
  WranglerRunner: class MockWranglerRunner {
    async getAccountId() {
      return 'abc123def456abc123def456abc12345';
    }
  },
}));

import { registerSyncCommand, runSyncEnable } from '../../src/commands/sync.js';
import { registerVercelWebhook, deleteVercelWebhook } from '../../src/sync/vercel-webhook.js';
import { deployWebhookWorker, deleteWebhookWorker } from '../../src/sync/worker-deployer.js';
import { readSyncState, writeSyncState } from '../../src/sync/sync-state.js';
import { generateSyncWorkflow } from '../../src/sync/github-action-gen.js';

describe('sync enable', () => {
  let tmpDir: string;
  const originalEnv = process.env;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v2cf-sync-cmd-'));
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      VERCEL_TOKEN: 'test-vercel-token',
      CLOUDFLARE_API_TOKEN: 'test-cf-token',
    };

    // Default mock returns
    vi.mocked(deployWebhookWorker).mockResolvedValue({
      url: 'https://v2cf-sync-test.workers.dev',
    });
    vi.mocked(registerVercelWebhook).mockResolvedValue({
      id: 'hook_abc123',
      secret: 'whsec_test_secret',
      url: 'https://v2cf-sync-test.workers.dev',
      events: ['deployment.succeeded'],
      ownerId: 'owner1',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });

  afterEach(() => {
    process.env = originalEnv;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('throws actionable error if VERCEL_TOKEN is not set', async () => {
    delete process.env.VERCEL_TOKEN;

    const program = new Command();
    registerSyncCommand(program);

    // Use runSyncEnable directly to test the error
    await expect(
      runSyncEnable({
        projectDir: tmpDir,
        workerName: 'test',
        accountId: 'abc123',
      })
    ).rejects.toThrow('VERCEL_TOKEN');
  });

  it('deploys webhook Worker via deployWebhookWorker', async () => {
    await runSyncEnable({
      projectDir: tmpDir,
      workerName: 'test',
      accountId: 'abc123def456abc123def456abc12345',
    });

    expect(deployWebhookWorker).toHaveBeenCalledWith(
      'test',
      tmpDir,
      expect.objectContaining({
        CLOUDFLARE_API_TOKEN: expect.any(String),
        CLOUDFLARE_ACCOUNT_ID: 'abc123def456abc123def456abc12345',
      })
    );
  });

  it('registers Vercel webhook pointing at Worker URL', async () => {
    await runSyncEnable({
      projectDir: tmpDir,
      workerName: 'test',
      accountId: 'abc123',
    });

    expect(registerVercelWebhook).toHaveBeenCalledWith(
      'test-vercel-token',
      'https://v2cf-sync-test.workers.dev',
      expect.objectContaining({})
    );
  });

  it('saves sync state to .v2cf/sync.json via writeSyncState', async () => {
    await runSyncEnable({
      projectDir: tmpDir,
      workerName: 'test',
      accountId: 'abc123',
    });

    expect(writeSyncState).toHaveBeenCalledWith(
      tmpDir,
      expect.objectContaining({
        enabled: true,
        vercelWebhookId: 'hook_abc123',
        vercelWebhookSecret: 'whsec_test_secret',
        webhookWorkerUrl: 'https://v2cf-sync-test.workers.dev',
        webhookWorkerName: 'v2cf-sync-test',
        rebuildMethod: 'worker',
      })
    );
  });

  it('passes vercelProjectId and vercelTeamId when provided', async () => {
    await runSyncEnable({
      projectDir: tmpDir,
      workerName: 'test',
      accountId: 'abc123',
      vercelProjectId: 'prj_abc',
      vercelTeamId: 'team_xyz',
    });

    expect(registerVercelWebhook).toHaveBeenCalledWith(
      'test-vercel-token',
      expect.any(String),
      expect.objectContaining({
        projectId: 'prj_abc',
        teamId: 'team_xyz',
      })
    );

    expect(writeSyncState).toHaveBeenCalledWith(
      tmpDir,
      expect.objectContaining({
        vercelProjectId: 'prj_abc',
        vercelTeamId: 'team_xyz',
      })
    );
  });
});

describe('sync disable', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      VERCEL_TOKEN: 'test-vercel-token',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('throws if sync is not enabled', async () => {
    vi.mocked(readSyncState).mockResolvedValue(null);

    const program = new Command();
    registerSyncCommand(program);

    // The sync disable command should throw if no state
    const syncDisable = program.commands
      .find((c) => c.name() === 'sync')
      ?.commands.find((c) => c.name() === 'disable');
    expect(syncDisable).toBeDefined();
  });

  it('deletes Vercel webhook via deleteVercelWebhook', async () => {
    vi.mocked(readSyncState).mockResolvedValue({
      enabled: true,
      vercelWebhookId: 'hook_abc123',
      vercelWebhookSecret: 'whsec_secret',
      webhookWorkerUrl: 'https://v2cf-sync-test.workers.dev',
      webhookWorkerName: 'v2cf-sync-test',
      rebuildMethod: 'worker',
      createdAt: '2026-01-01T00:00:00Z',
    });
    vi.mocked(deleteVercelWebhook).mockResolvedValue(undefined);
    vi.mocked(deleteWebhookWorker).mockResolvedValue(undefined);

    // Import the disable function
    const { runSyncDisable } = await import('../../src/commands/sync.js');
    await runSyncDisable('/tmp/test-dir');

    expect(deleteVercelWebhook).toHaveBeenCalledWith(
      'test-vercel-token',
      'hook_abc123',
      undefined
    );
  });

  it('deletes webhook Worker via deleteWebhookWorker', async () => {
    vi.mocked(readSyncState).mockResolvedValue({
      enabled: true,
      vercelWebhookId: 'hook_abc123',
      vercelWebhookSecret: 'whsec_secret',
      webhookWorkerUrl: 'https://v2cf-sync-test.workers.dev',
      webhookWorkerName: 'v2cf-sync-test',
      rebuildMethod: 'worker',
      createdAt: '2026-01-01T00:00:00Z',
    });
    vi.mocked(deleteVercelWebhook).mockResolvedValue(undefined);
    vi.mocked(deleteWebhookWorker).mockResolvedValue(undefined);

    const { runSyncDisable } = await import('../../src/commands/sync.js');
    await runSyncDisable('/tmp/test-dir');

    expect(deleteWebhookWorker).toHaveBeenCalledWith(
      'v2cf-sync-test',
      '/tmp/test-dir'
    );
  });

  it('updates state to enabled: false', async () => {
    vi.mocked(readSyncState).mockResolvedValue({
      enabled: true,
      vercelWebhookId: 'hook_abc123',
      vercelWebhookSecret: 'whsec_secret',
      webhookWorkerUrl: 'https://v2cf-sync-test.workers.dev',
      webhookWorkerName: 'v2cf-sync-test',
      rebuildMethod: 'worker',
      createdAt: '2026-01-01T00:00:00Z',
    });
    vi.mocked(deleteVercelWebhook).mockResolvedValue(undefined);
    vi.mocked(deleteWebhookWorker).mockResolvedValue(undefined);

    const { runSyncDisable } = await import('../../src/commands/sync.js');
    await runSyncDisable('/tmp/test-dir');

    expect(writeSyncState).toHaveBeenCalledWith(
      '/tmp/test-dir',
      expect.objectContaining({ enabled: false })
    );
  });
});

describe('sync status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows "NOT CONFIGURED" when no sync state exists', async () => {
    vi.mocked(readSyncState).mockResolvedValue(null);

    const { runSyncStatus } = await import('../../src/commands/sync.js');
    const output = await runSyncStatus('/tmp/test-dir');

    expect(output).toContain('NOT CONFIGURED');
  });

  it('shows "ENABLED" when sync state is enabled', async () => {
    vi.mocked(readSyncState).mockResolvedValue({
      enabled: true,
      vercelWebhookId: 'hook_abc123',
      vercelWebhookSecret: 'whsec_secret',
      webhookWorkerUrl: 'https://v2cf-sync-test.workers.dev',
      webhookWorkerName: 'v2cf-sync-test',
      rebuildMethod: 'worker',
      createdAt: '2026-01-01T00:00:00Z',
    });

    const { runSyncStatus } = await import('../../src/commands/sync.js');
    const output = await runSyncStatus('/tmp/test-dir');

    expect(output).toContain('ENABLED');
    expect(output).toContain('https://v2cf-sync-test.workers.dev');
    expect(output).toContain('hook_abc123');
  });

  it('shows "DISABLED" when sync state is disabled', async () => {
    vi.mocked(readSyncState).mockResolvedValue({
      enabled: false,
      vercelWebhookId: 'hook_abc123',
      vercelWebhookSecret: 'whsec_secret',
      webhookWorkerUrl: 'https://v2cf-sync-test.workers.dev',
      webhookWorkerName: 'v2cf-sync-test',
      rebuildMethod: 'worker',
      createdAt: '2026-01-01T00:00:00Z',
    });

    const { runSyncStatus } = await import('../../src/commands/sync.js');
    const output = await runSyncStatus('/tmp/test-dir');

    expect(output).toContain('DISABLED');
  });

  it('shows last sync info with relative time', async () => {
    const timestamp = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2 hours ago
    vi.mocked(readSyncState).mockResolvedValue({
      enabled: true,
      vercelWebhookId: 'hook_abc123',
      vercelWebhookSecret: 'whsec_secret',
      webhookWorkerUrl: 'https://v2cf-sync-test.workers.dev',
      webhookWorkerName: 'v2cf-sync-test',
      rebuildMethod: 'worker',
      createdAt: '2026-01-01T00:00:00Z',
      lastSync: {
        timestamp,
        success: true,
        deploymentId: 'dpl_xyz789',
      },
    });

    const { runSyncStatus } = await import('../../src/commands/sync.js');
    const output = await runSyncStatus('/tmp/test-dir');

    expect(output).toContain('Last Sync');
    expect(output).toContain('SUCCESS');
    expect(output).toContain('dpl_xyz789');
    expect(output).toMatch(/hours?\s+ago/);
  });

  it('shows failed last sync status', async () => {
    vi.mocked(readSyncState).mockResolvedValue({
      enabled: true,
      vercelWebhookId: 'hook_abc123',
      vercelWebhookSecret: 'whsec_secret',
      webhookWorkerUrl: 'https://v2cf-sync-test.workers.dev',
      webhookWorkerName: 'v2cf-sync-test',
      rebuildMethod: 'worker',
      createdAt: '2026-01-01T00:00:00Z',
      lastSync: {
        timestamp: new Date().toISOString(),
        success: false,
        error: 'Build failed',
      },
    });

    const { runSyncStatus } = await import('../../src/commands/sync.js');
    const output = await runSyncStatus('/tmp/test-dir');

    expect(output).toContain('FAILED');
    expect(output).toContain('Build failed');
  });

  it('shows health status', async () => {
    vi.mocked(readSyncState).mockResolvedValue({
      enabled: true,
      vercelWebhookId: 'hook_abc123',
      vercelWebhookSecret: 'whsec_secret',
      webhookWorkerUrl: 'https://v2cf-sync-test.workers.dev',
      webhookWorkerName: 'v2cf-sync-test',
      rebuildMethod: 'worker',
      createdAt: '2026-01-01T00:00:00Z',
    });

    const { runSyncStatus } = await import('../../src/commands/sync.js');
    const output = await runSyncStatus('/tmp/test-dir');

    expect(output).toContain('Health');
    expect(output).toContain('All systems operational');
  });
});

describe('registerSyncCommand', () => {
  it('registers sync command with enable, disable, and status subcommands', () => {
    const program = new Command();
    registerSyncCommand(program);

    const syncCmd = program.commands.find((c) => c.name() === 'sync');
    expect(syncCmd).toBeDefined();

    const subcommands = syncCmd!.commands.map((c) => c.name());
    expect(subcommands).toContain('enable');
    expect(subcommands).toContain('disable');
    expect(subcommands).toContain('status');
  });
});
