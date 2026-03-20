import { execa } from 'execa';

/** Check that working tree is clean BEFORE v2cf makes any changes. */
export async function ensureCleanTree(cwd: string): Promise<void> {
  const { stdout } = await execa('git', ['status', '--porcelain'], { cwd });
  if (stdout.trim()) {
    throw new Error(
      'Working tree is not clean. Commit or stash changes before running v2cf.'
    );
  }
}

export async function createMigrationBranch(cwd: string): Promise<string> {
  await execa('git', ['checkout', '-b', 'v2cf/migrate'], { cwd });
  return 'v2cf/migrate';
}

export async function commitChanges(
  cwd: string,
  message: string
): Promise<void> {
  await execa('git', ['add', '-A'], { cwd });
  await execa('git', ['commit', '-m', message], { cwd });
}
