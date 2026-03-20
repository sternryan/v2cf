import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('execa', () => ({
  execa: vi.fn().mockResolvedValue({ stdout: '', stderr: '' }),
}));

import { execa } from 'execa';
import {
  ensureCleanTree,
  createMigrationBranch,
  commitChanges,
} from '../../src/orchestrator/git-branch.js';

const mockedExeca = vi.mocked(execa);

describe('git-branch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('ensureCleanTree', () => {
    it('passes silently when working tree is clean', async () => {
      mockedExeca.mockResolvedValue({ stdout: '', stderr: '' } as any);

      await ensureCleanTree('/test/project');

      expect(mockedExeca).toHaveBeenCalledWith(
        'git',
        ['status', '--porcelain'],
        { cwd: '/test/project' }
      );
    });

    it('throws if working tree is dirty', async () => {
      mockedExeca.mockResolvedValue({
        stdout: ' M src/index.ts\n',
        stderr: '',
      } as any);

      await expect(ensureCleanTree('/test/project')).rejects.toThrow(
        'Working tree is not clean'
      );
    });
  });

  describe('createMigrationBranch', () => {
    it('runs git checkout -b v2cf/migrate and returns branch name', async () => {
      mockedExeca.mockResolvedValue({ stdout: '', stderr: '' } as any);

      const branch = await createMigrationBranch('/test/project');

      expect(mockedExeca).toHaveBeenCalledWith(
        'git',
        ['checkout', '-b', 'v2cf/migrate'],
        { cwd: '/test/project' }
      );
      expect(branch).toBe('v2cf/migrate');
    });
  });

  describe('commitChanges', () => {
    it('runs git add -A then git commit -m <message>', async () => {
      mockedExeca.mockResolvedValue({ stdout: '', stderr: '' } as any);

      await commitChanges('/test/project', 'chore: configure v2cf');

      expect(mockedExeca).toHaveBeenCalledWith(
        'git',
        ['add', '-A'],
        { cwd: '/test/project' }
      );
      expect(mockedExeca).toHaveBeenCalledWith(
        'git',
        ['commit', '-m', 'chore: configure v2cf'],
        { cwd: '/test/project' }
      );
    });
  });
});
