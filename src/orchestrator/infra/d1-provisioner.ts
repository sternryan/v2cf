import type Cloudflare from 'cloudflare';
import type { WranglerRunner } from '../wrangler-runner.js';

export async function createD1Database(
  client: Cloudflare,
  accountId: string,
  name: string
): Promise<{ uuid: string; name: string }> {
  const db = await client.d1.database.create({
    account_id: accountId,
    name,
  });
  return { uuid: db.uuid!, name: db.name! };
}

export async function runMigration(
  runner: WranglerRunner,
  databaseName: string,
  sqlFilePath: string
): Promise<void> {
  await runner.d1Execute(databaseName, sqlFilePath);
}
