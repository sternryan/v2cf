import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('execa', () => ({
  execa: vi.fn().mockResolvedValue({ stdout: '', stderr: '' }),
}));

import { execa } from 'execa';
import {
  createMigrationBranch,
  commitChanges,
} from '../../src/orchestrator/git-branch.js';

const mockedExeca = vi.mocked(execa);

describe('git-branch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createMigrationBranch', () => {
    it('runs git status --porcelain then git checkout -b v2cf/migrate', async () => {
      mockedExeca.mockResolvedValue({ stdout: '', stderr: '' } as any);

      const branch = await createMigrationBranch('/test/project');

      expect(mockedExeca).toHaveBeenCalledWith(
        'git',
        ['status', '--porcelain'],
        { cwd: '/test/project' }
      );
      expect(mockedExeca).toHaveBeenCalledWith(
        'git',
        ['checkout', '-b', 'v2cf/migrate'],
        { cwd: '/test/project' }
      );
      expect(branch).toBe('v2cf/migrate');
    });

    it('throws if working tree is dirty', async () => {
      mockedExeca.mockResolvedValue({
        stdout: ' M src/index.ts\n',
        stderr: '',
      } as any);

      await expect(createMigrationBranch('/test/project')).rejects.toThrow(
        'Working tree is not clean'
      );

      // Should NOT have called checkout
      expect(mockedExeca).toHaveBeenCalledTimes(1);
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
