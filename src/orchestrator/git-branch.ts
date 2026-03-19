import { execa } from 'execa';

export async function createMigrationBranch(cwd: string): Promise<string> {
  const { stdout } = await execa('git', ['status', '--porcelain'], { cwd });
  if (stdout.trim()) {
    throw new Error(
      'Working tree is not clean. Commit or stash changes before running v2cf.'
    );
  }
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
