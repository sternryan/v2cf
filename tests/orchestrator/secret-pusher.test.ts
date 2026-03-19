import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import { WranglerRunner } from '../../src/orchestrator/wrangler-runner.js';
import { pushSecrets } from '../../src/orchestrator/infra/secret-pusher.js';

vi.mock('fs');

describe('secret-pusher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes secrets JSON to temp file, calls runner.secretBulk, then cleans up', async () => {
    const mockRunner = {
      secretBulk: vi.fn().mockResolvedValue(undefined),
    } as unknown as WranglerRunner;

    const secrets = { API_KEY: 'key-123', DB_SECRET: 'db-456' };

    const result = await pushSecrets(mockRunner, secrets, '/test/project');

    // Should have written a temp file
    expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
    const writtenPath = vi.mocked(fs.writeFileSync).mock.calls[0][0] as string;
    expect(writtenPath).toContain('v2cf-secrets-');
    const writtenContent = vi.mocked(fs.writeFileSync).mock.calls[0][1] as string;
    expect(JSON.parse(writtenContent)).toEqual(secrets);

    // Should have called secretBulk with that temp file
    expect(mockRunner.secretBulk).toHaveBeenCalledWith(writtenPath);

    // Should have cleaned up the temp file
    expect(fs.unlinkSync).toHaveBeenCalledWith(writtenPath);

    // Should return count
    expect(result).toBe(2);
  });

  it('skips if secrets object is empty (no wrangler call)', async () => {
    const mockRunner = {
      secretBulk: vi.fn().mockResolvedValue(undefined),
    } as unknown as WranglerRunner;

    const result = await pushSecrets(mockRunner, {}, '/test/project');

    expect(mockRunner.secretBulk).not.toHaveBeenCalled();
    expect(fs.writeFileSync).not.toHaveBeenCalled();
    expect(result).toBe(0);
  });

  it('cleans up temp file even if secretBulk throws', async () => {
    const mockRunner = {
      secretBulk: vi.fn().mockRejectedValue(new Error('wrangler failed')),
    } as unknown as WranglerRunner;

    const secrets = { API_KEY: 'key-123' };

    await expect(pushSecrets(mockRunner, secrets, '/test/project')).rejects.toThrow(
      'wrangler failed'
    );

    // Should still clean up
    expect(fs.unlinkSync).toHaveBeenCalledTimes(1);
  });
});
