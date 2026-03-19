import fs from 'fs';
import path from 'path';
import os from 'os';
import type { WranglerRunner } from '../wrangler-runner.js';

export async function pushSecrets(
  runner: WranglerRunner,
  secrets: Record<string, string>,
  projectDir: string
): Promise<number> {
  const count = Object.keys(secrets).length;
  if (count === 0) return 0;

  const tempPath = path.join(
    os.tmpdir(),
    `v2cf-secrets-${Date.now()}.json`
  );

  try {
    fs.writeFileSync(tempPath, JSON.stringify(secrets));
    await runner.secretBulk(tempPath);
  } finally {
    fs.unlinkSync(tempPath);
  }

  return count;
}
