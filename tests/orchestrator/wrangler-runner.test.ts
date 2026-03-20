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

  describe('getAccountId', () => {
    it('parses account ID from wrangler whoami table output', async () => {
      mockedExeca.mockResolvedValueOnce({
        stdout:
          '┌─────────────────────────────┬──────────────────────────────────┐\n' +
          '│ Account Name                │ Account ID                       │\n' +
          '├─────────────────────────────┼──────────────────────────────────┤\n' +
          '│ Test Account                │ cae9e896661b2f81818cfe6a713aada8 │\n' +
          '└─────────────────────────────┴──────────────────────────────────┘',
        stderr: '',
      } as any);

      const accountId = await runner.getAccountId();
      expect(accountId).toBe('cae9e896661b2f81818cfe6a713aada8');
    });

    it('throws with helpful message when account ID cannot be parsed', async () => {
      mockedExeca.mockResolvedValueOnce({
        stdout: 'Not logged in',
        stderr: '',
      } as any);

      await expect(runner.getAccountId()).rejects.toThrow('wrangler login');
    });
  });

  describe('d1Create', () => {
    it('parses database UUID from wrangler d1 create output', async () => {
      mockedExeca.mockResolvedValueOnce({
        stdout:
          "✅ Successfully created DB 'my-db' in region WNAM\n\n" +
          '{\n  "d1_databases": [\n    {\n' +
          '      "binding": "my_db",\n' +
          '      "database_name": "my-db",\n' +
          '      "database_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"\n' +
          '    }\n  ]\n}',
        stderr: '',
      } as any);

      const result = await runner.d1Create('my-db');
      expect(result).toEqual({
        uuid: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        name: 'my-db',
      });
    });

    it('throws when UUID cannot be parsed from output', async () => {
      mockedExeca.mockResolvedValueOnce({
        stdout: 'Unexpected output',
        stderr: '',
      } as any);

      await expect(runner.d1Create('my-db')).rejects.toThrow(
        'could not parse UUID'
      );
    });
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
