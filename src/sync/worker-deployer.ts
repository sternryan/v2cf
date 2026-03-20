import * as fs from 'node:fs';
import * as path from 'node:path';
import { execa } from 'execa';
import { generateWebhookWorkerSource } from './webhook-worker-template.js';

/**
 * Deploy the v2cf webhook Worker to Cloudflare.
 *
 * Creates a temporary directory under .v2cf/worker/ with:
 * - wrangler.toml (Worker config)
 * - index.ts (generated Worker source)
 *
 * Then runs `wrangler deploy` and pushes secrets.
 */
export async function deployWebhookWorker(
  workerName: string,
  projectDir: string,
  secrets: Record<string, string>
): Promise<{ url: string }> {
  const fullWorkerName = `v2cf-sync-${workerName}`;
  const workerDir = path.join(projectDir, '.v2cf', 'worker');

  // Create worker directory
  fs.mkdirSync(workerDir, { recursive: true });

  // Write wrangler.toml
  const today = new Date().toISOString().split('T')[0];
  const wranglerConfig = `name = "${fullWorkerName}"
main = "index.ts"
compatibility_date = "${today}"
`;
  fs.writeFileSync(path.join(workerDir, 'wrangler.toml'), wranglerConfig, 'utf-8');

  // Write Worker source
  const workerSource = generateWebhookWorkerSource({
    accountId: secrets.CLOUDFLARE_API_TOKEN ? 'from-env' : '',
    workerName,
  });
  fs.writeFileSync(path.join(workerDir, 'index.ts'), workerSource, 'utf-8');

  // Run wrangler deploy
  const deployResult = await execa('npx', ['wrangler', 'deploy'], {
    cwd: workerDir,
    stdio: 'pipe',
  });

  // Push secrets via wrangler secret bulk
  const secretsFile = path.join(workerDir, '.secrets.json');
  fs.writeFileSync(secretsFile, JSON.stringify(secrets), 'utf-8');

  try {
    await execa('npx', ['wrangler', 'secret', 'bulk', secretsFile], {
      cwd: workerDir,
      stdio: 'pipe',
    });
  } finally {
    // Clean up secrets file
    if (fs.existsSync(secretsFile)) {
      fs.unlinkSync(secretsFile);
    }
  }

  // Parse Worker URL from deploy output
  const urlMatch = deployResult.stdout.match(
    /(https:\/\/[^\s]+\.workers\.dev)/
  );
  const url = urlMatch
    ? urlMatch[1]
    : `https://${fullWorkerName}.workers.dev`;

  return { url };
}

/**
 * Delete the v2cf webhook Worker from Cloudflare.
 */
export async function deleteWebhookWorker(
  workerName: string,
  projectDir: string
): Promise<void> {
  // workerName is the full name (e.g., v2cf-sync-stripped) from stored state
  await execa('npx', ['wrangler', 'delete', '--name', workerName, '--force'], {
    cwd: projectDir,
    stdio: 'pipe',
  });
}
