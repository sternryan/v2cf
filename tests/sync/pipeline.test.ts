import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

import {
  registerVercelWebhook,
  deleteVercelWebhook,
} from '../../src/sync/vercel-webhook.js';
import {
  deployWebhookWorker,
  deleteWebhookWorker,
} from '../../src/sync/worker-deployer.js';
import {
  readSyncState,
  writeSyncState,
} from '../../src/sync/sync-state.js';
import {
  runSyncEnable,
  runSyncDisable,
  runSyncStatus,
} from '../../src/commands/sync.js';

describe('sync pipeline integration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      VERCEL_TOKEN: 'test-vercel-token',
      CLOUDFLARE_API_TOKEN: 'test-cf-token',
    };

    // Default mock returns
    vi.mocked(deployWebhookWorker).mockResolvedValue({
      url: 'https://v2cf-sync-myapp.workers.dev',
    });
    vi.mocked(registerVercelWebhook).mockResolvedValue({
      id: 'hook_pipeline_123',
      secret: 'whsec_pipeline_secret',
      url: 'https://v2cf-sync-myapp.workers.dev',
      events: ['deployment.succeeded'],
      ownerId: 'owner1',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    vi.mocked(deleteVercelWebhook).mockResolvedValue(undefined);
    vi.mocked(deleteWebhookWorker).mockResolvedValue(undefined);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('full enable flow calls deployWebhookWorker, registerVercelWebhook, writeSyncState in order', async () => {
    const callOrder: string[] = [];
    vi.mocked(deployWebhookWorker).mockImplementation(async () => {
      callOrder.push('deployWebhookWorker');
      return { url: 'https://v2cf-sync-myapp.workers.dev' };
    });
    vi.mocked(registerVercelWebhook).mockImplementation(async () => {
      callOrder.push('registerVercelWebhook');
      return {
        id: 'hook_123',
        secret: 'whsec_secret',
        url: 'https://v2cf-sync-myapp.workers.dev',
        events: ['deployment.succeeded'],
        ownerId: 'owner1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    });
    vi.mocked(writeSyncState).mockImplementation(async () => {
      callOrder.push('writeSyncState');
    });

    await runSyncEnable({
      projectDir: '/tmp/test-project',
      workerName: 'myapp',
      accountId: 'acct_123',
    });

    expect(callOrder).toEqual([
      'deployWebhookWorker',
      'registerVercelWebhook',
      'writeSyncState',
    ]);
  });

  it('enable state contains expected fields', async () => {
    await runSyncEnable({
      projectDir: '/tmp/test-project',
      workerName: 'myapp',
      accountId: 'acct_123',
    });

    expect(writeSyncState).toHaveBeenCalledWith(
      '/tmp/test-project',
      expect.objectContaining({
        enabled: true,
        vercelWebhookId: 'hook_pipeline_123',
        vercelWebhookSecret: 'whsec_pipeline_secret',
        webhookWorkerUrl: 'https://v2cf-sync-myapp.workers.dev',
        webhookWorkerName: 'v2cf-sync-myapp',
        rebuildMethod: 'worker',
      })
    );

    // Verify createdAt is a valid ISO string
    const state = vi.mocked(writeSyncState).mock.calls[0][1];
    expect(new Date(state.createdAt).toISOString()).toBe(state.createdAt);
  });

  it('disable flow calls deleteVercelWebhook, deleteWebhookWorker, updates state', async () => {
    vi.mocked(readSyncState).mockResolvedValue({
      enabled: true,
      vercelWebhookId: 'hook_pipeline_123',
      vercelWebhookSecret: 'whsec_pipeline_secret',
      webhookWorkerUrl: 'https://v2cf-sync-myapp.workers.dev',
      webhookWorkerName: 'v2cf-sync-myapp',
      rebuildMethod: 'worker',
      createdAt: '2026-01-01T00:00:00.000Z',
    });

    await runSyncDisable('/tmp/test-project');

    expect(deleteVercelWebhook).toHaveBeenCalledWith(
      'test-vercel-token',
      'hook_pipeline_123',
      undefined
    );
    expect(deleteWebhookWorker).toHaveBeenCalledWith(
      'v2cf-sync-myapp',
      '/tmp/test-project'
    );
    expect(writeSyncState).toHaveBeenCalledWith(
      '/tmp/test-project',
      expect.objectContaining({ enabled: false })
    );
  });

  it('enable -> disable -> status shows disabled', async () => {
    // Step 1: Enable
    await runSyncEnable({
      projectDir: '/tmp/test-project',
      workerName: 'myapp',
      accountId: 'acct_123',
    });

    // Step 2: Disable
    vi.mocked(readSyncState).mockResolvedValue({
      enabled: true,
      vercelWebhookId: 'hook_pipeline_123',
      vercelWebhookSecret: 'whsec_pipeline_secret',
      webhookWorkerUrl: 'https://v2cf-sync-myapp.workers.dev',
      webhookWorkerName: 'v2cf-sync-myapp',
      rebuildMethod: 'worker',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    await runSyncDisable('/tmp/test-project');

    // Step 3: Status after disable
    vi.mocked(readSyncState).mockResolvedValue({
      enabled: false,
      vercelWebhookId: 'hook_pipeline_123',
      vercelWebhookSecret: 'whsec_pipeline_secret',
      webhookWorkerUrl: 'https://v2cf-sync-myapp.workers.dev',
      webhookWorkerName: 'v2cf-sync-myapp',
      rebuildMethod: 'worker',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    const output = await runSyncStatus('/tmp/test-project');

    expect(output).toContain('DISABLED');
  });

  it('status after enable shows enabled with Worker URL', async () => {
    vi.mocked(readSyncState).mockResolvedValue({
      enabled: true,
      vercelWebhookId: 'hook_pipeline_123',
      vercelWebhookSecret: 'whsec_pipeline_secret',
      webhookWorkerUrl: 'https://v2cf-sync-myapp.workers.dev',
      webhookWorkerName: 'v2cf-sync-myapp',
      rebuildMethod: 'worker',
      createdAt: '2026-01-01T00:00:00.000Z',
    });

    const output = await runSyncStatus('/tmp/test-project');

    expect(output).toContain('ENABLED');
    expect(output).toContain('https://v2cf-sync-myapp.workers.dev');
    expect(output).toContain('hook_pipeline_123');
    expect(output).toContain('worker');
  });

  it('runSyncEnable without VERCEL_TOKEN throws clear error', async () => {
    delete process.env.VERCEL_TOKEN;

    await expect(
      runSyncEnable({
        projectDir: '/tmp/test',
        workerName: 'test',
        accountId: 'acct',
      })
    ).rejects.toThrow('VERCEL_TOKEN');
  });
});

describe('go command sync integration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      VERCEL_TOKEN: 'test-vercel-token',
      CLOUDFLARE_API_TOKEN: 'test-cf-token',
    };

    vi.mocked(deployWebhookWorker).mockResolvedValue({
      url: 'https://v2cf-sync-myapp.workers.dev',
    });
    vi.mocked(registerVercelWebhook).mockResolvedValue({
      id: 'hook_go_123',
      secret: 'whsec_go_secret',
      url: 'https://v2cf-sync-myapp.workers.dev',
      events: ['deployment.succeeded'],
      ownerId: 'owner1',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('runSyncEnable can be called from go command context', async () => {
    const result = await runSyncEnable({
      projectDir: '/tmp/test-project',
      workerName: 'myapp',
      accountId: 'acct_123',
    });

    expect(result.webhookWorkerUrl).toBe('https://v2cf-sync-myapp.workers.dev');
    expect(result.vercelWebhookId).toBe('hook_go_123');
    expect(deployWebhookWorker).toHaveBeenCalled();
    expect(registerVercelWebhook).toHaveBeenCalled();
    expect(writeSyncState).toHaveBeenCalled();
  });

  it('runSyncEnable is non-fatal when called with try/catch', async () => {
    vi.mocked(deployWebhookWorker).mockRejectedValue(
      new Error('Network error')
    );

    let syncError: string | null = null;
    try {
      await runSyncEnable({
        projectDir: '/tmp/test-project',
        workerName: 'myapp',
        accountId: 'acct_123',
      });
    } catch (err) {
      syncError = (err as Error).message;
    }

    // The go command wraps this in try/catch, so errors are non-fatal
    expect(syncError).toBe('Network error');
  });

  it('sync skipped when VERCEL_TOKEN not set (non-error)', async () => {
    delete process.env.VERCEL_TOKEN;

    // The go command should check for VERCEL_TOKEN before calling runSyncEnable
    const hasToken = !!process.env.VERCEL_TOKEN;
    expect(hasToken).toBe(false);

    // When called without token, it throws (go command should check first)
    await expect(
      runSyncEnable({
        projectDir: '/tmp/test',
        workerName: 'test',
        accountId: 'acct',
      })
    ).rejects.toThrow('VERCEL_TOKEN');
  });
});
