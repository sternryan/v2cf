import type { WranglerRunner } from '../wrangler-runner.js';

export async function createD1Database(
  runner: WranglerRunner,
  name: string
): Promise<{ uuid: string; name: string }> {
  return runner.d1Create(name);
}

export async function runMigration(
  runner: WranglerRunner,
  databaseName: string,
  sqlFilePath: string
): Promise<void> {
  await runner.d1Execute(databaseName, sqlFilePath);
}
