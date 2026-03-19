import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('execa', () => ({
  execa: vi.fn().mockResolvedValue({ stdout: 'mock output', stderr: '' }),
}));

import { execa } from 'execa';
import { WranglerRunner } from '../../src/orchestrator/wrangler-runner.js';

const mockedExeca = vi.mocked(execa);

describe('WranglerRunner', () => {
  let runner: WranglerRunner;

  beforeEach(() => {
    vi.clearAllMocks();
    runner = new WranglerRunner({ cwd: '/test/project' });
  });

  describe('d1Execute', () => {
    it('calls execa with correct args', async () => {
      await runner.d1Execute('my-db', '/path/to/migration.sql');
      expect(mockedExeca).toHaveBeenCalledWith(
        'npx',
        ['wrangler', 'd1', 'execute', 'my-db', '--file', '/path/to/migration.sql', '--remote', '--yes'],
        expect.objectContaining({
          cwd: '/test/project',
        })
      );
    });
  });

  describe('secretBulk', () => {
    it('calls execa with correct args', async () => {
      await runner.secretBulk('/path/to/secrets.json');
      expect(mockedExeca).toHaveBeenCalledWith(
        'npx',
        ['wrangler', 'secret', 'bulk', '/path/to/secrets.json'],
        expect.objectContaining({
          cwd: '/test/project',
        })
      );
    });
  });

  describe('deploy', () => {
    it('calls execa with correct args', async () => {
      await runner.deploy();
      expect(mockedExeca).toHaveBeenCalledWith(
        'npx',
        ['opennextjs-cloudflare', 'deploy'],
        expect.objectContaining({
          cwd: '/test/project',
        })
      );
    });
  });

  describe('build', () => {
    it('calls execa with correct args', async () => {
      await runner.build();
      expect(mockedExeca).toHaveBeenCalledWith(
        'npx',
        ['opennextjs-cloudflare', 'build'],
        expect.objectContaining({
          cwd: '/test/project',
        })
      );
    });
  });

  describe('environment passing', () => {
    it('passes cwd and merged env to execa', async () => {
      const runnerWithEnv = new WranglerRunner({
        cwd: '/test/project',
        env: { CUSTOM_VAR: 'custom-value' },
      });
      await runnerWithEnv.d1Execute('db', 'file.sql');
      const callOptions = mockedExeca.mock.calls[0][2] as Record<string, unknown>;
      expect(callOptions.cwd).toBe('/test/project');
      const passedEnv = callOptions.env as Record<string, string>;
      expect(passedEnv.CUSTOM_VAR).toBe('custom-value');
    });
  });
});
