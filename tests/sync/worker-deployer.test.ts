import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// Mock execa before importing the module
vi.mock('execa', () => ({
  execa: vi.fn(),
}));

import { deployWebhookWorker, deleteWebhookWorker } from '../../src/sync/worker-deployer.js';
import { execa } from 'execa';

describe('deployWebhookWorker', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v2cf-deployer-test-'));
    vi.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates .v2cf/worker/ directory with wrangler.toml and index.ts', async () => {
    vi.mocked(execa)
      .mockResolvedValueOnce({
        stdout: 'https://v2cf-sync-my-worker.account.workers.dev',
        stderr: '',
        exitCode: 0,
      } as never)
      .mockResolvedValueOnce({
        stdout: 'Secrets uploaded',
        stderr: '',
        exitCode: 0,
      } as never);

    await deployWebhookWorker('my-worker', tmpDir, {
      VERCEL_WEBHOOK_SECRET: 'whsec_test',
      CLOUDFLARE_API_TOKEN: 'cf_token',
      GITHUB_TOKEN: 'gh_token',
      GITHUB_REPO: 'owner/repo',
    });

    const workerDir = path.join(tmpDir, '.v2cf', 'worker');
    expect(fs.existsSync(path.join(workerDir, 'wrangler.toml'))).toBe(true);
    expect(fs.existsSync(path.join(workerDir, 'index.ts'))).toBe(true);
  });

  it('writes wrangler.toml with correct Worker name and config', async () => {
    vi.mocked(execa)
      .mockResolvedValueOnce({
        stdout: 'https://v2cf-sync-my-worker.account.workers.dev',
        stderr: '',
        exitCode: 0,
      } as never)
      .mockResolvedValueOnce({
        stdout: 'Secrets uploaded',
        stderr: '',
        exitCode: 0,
      } as never);

    await deployWebhookWorker('my-worker', tmpDir, {
      VERCEL_WEBHOOK_SECRET: 'whsec_test',
      CLOUDFLARE_API_TOKEN: 'cf_token',
      GITHUB_TOKEN: 'gh_token',
      GITHUB_REPO: 'owner/repo',
    });

    const wranglerToml = fs.readFileSync(
      path.join(tmpDir, '.v2cf', 'worker', 'wrangler.toml'),
      'utf-8'
    );
    expect(wranglerToml).toContain('name = "v2cf-sync-my-worker"');
    expect(wranglerToml).toContain('main = "index.ts"');
    expect(wranglerToml).toContain('compatibility_date');
  });

  it('runs wrangler deploy in the worker directory', async () => {
    vi.mocked(execa)
      .mockResolvedValueOnce({
        stdout: 'https://v2cf-sync-my-worker.account.workers.dev',
        stderr: '',
        exitCode: 0,
      } as never)
      .mockResolvedValueOnce({
        stdout: 'Secrets uploaded',
        stderr: '',
        exitCode: 0,
      } as never);

    await deployWebhookWorker('my-worker', tmpDir, {
      VERCEL_WEBHOOK_SECRET: 'whsec_test',
      CLOUDFLARE_API_TOKEN: 'cf_token',
      GITHUB_TOKEN: 'gh_token',
      GITHUB_REPO: 'owner/repo',
    });

    expect(execa).toHaveBeenCalledWith(
      'npx',
      ['wrangler', 'deploy'],
      expect.objectContaining({
        cwd: path.join(tmpDir, '.v2cf', 'worker'),
      })
    );
  });

  it('pushes secrets via wrangler secret bulk', async () => {
    vi.mocked(execa)
      .mockResolvedValueOnce({
        stdout: 'https://v2cf-sync-my-worker.account.workers.dev',
        stderr: '',
        exitCode: 0,
      } as never)
      .mockResolvedValueOnce({
        stdout: 'Secrets uploaded',
        stderr: '',
        exitCode: 0,
      } as never);

    await deployWebhookWorker('my-worker', tmpDir, {
      VERCEL_WEBHOOK_SECRET: 'whsec_test',
      CLOUDFLARE_API_TOKEN: 'cf_token',
      GITHUB_TOKEN: 'gh_token',
      GITHUB_REPO: 'owner/repo',
    });

    // Verify second call is secret bulk
    const calls = vi.mocked(execa).mock.calls;
    expect(calls[1][0]).toBe('npx');
    expect(calls[1][1]).toContain('wrangler');
    expect(calls[1][1]).toContain('secret');
    expect(calls[1][1]).toContain('bulk');
  });

  it('returns Worker URL from deploy output', async () => {
    vi.mocked(execa)
      .mockResolvedValueOnce({
        stdout: 'Published https://v2cf-sync-my-worker.account.workers.dev',
        stderr: '',
        exitCode: 0,
      } as never)
      .mockResolvedValueOnce({
        stdout: 'Secrets uploaded',
        stderr: '',
        exitCode: 0,
      } as never);

    const result = await deployWebhookWorker('my-worker', tmpDir, {
      VERCEL_WEBHOOK_SECRET: 'whsec_test',
      CLOUDFLARE_API_TOKEN: 'cf_token',
      GITHUB_TOKEN: 'gh_token',
      GITHUB_REPO: 'owner/repo',
    });

    expect(result.url).toContain('v2cf-sync-my-worker');
    expect(result.url).toContain('workers.dev');
  });
});

describe('deleteWebhookWorker', () => {
  it('runs wrangler delete with correct Worker name', async () => {
    vi.mocked(execa).mockResolvedValue({
      stdout: 'Deleted',
      stderr: '',
      exitCode: 0,
    } as never);

    await deleteWebhookWorker('my-worker', '/some/dir');

    expect(execa).toHaveBeenCalledWith(
      'npx',
      expect.arrayContaining(['wrangler', 'delete', '--name', 'v2cf-sync-my-worker']),
      expect.any(Object)
    );
  });
});
