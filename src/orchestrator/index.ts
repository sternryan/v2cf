import fs from 'fs';
import path from 'path';
import { execa } from 'execa';
import consola from 'consola';
import type { DeployResult } from './types.js';
import { WranglerRunner } from './wrangler-runner.js';
import { generateOpenNextConfig } from './config-gen/opennext-config.js';
import { generateWranglerConfig } from './config-gen/wrangler-config.js';
import { generatePackageScriptUpdates } from './config-gen/package-scripts.js';
import { mapEnvToSecrets } from './config-gen/env-mapper.js';
import { createD1Database, runMigration } from './infra/d1-provisioner.js';
import { pushSecrets } from './infra/secret-pusher.js';
import { buildAndDeploy } from './infra/deployer.js';
import {
  configureDomain,
  resolveZone,
  isDomainConfigAvailable,
} from './infra/domain-configurator.js';
import { createMigrationBranch, commitChanges } from './git-branch.js';

interface PipelineOptions {
  projectDir: string;
  workerName: string;
  subdomain?: string;
}

export async function runDeployPipeline(
  options: PipelineOptions
): Promise<DeployResult> {
  const { projectDir, workerName, subdomain } = options;
  const dbName = workerName + '-db';

  // ── Phase A: File Generation ──────────────────────────────────────

  // Step 1: Validate wrangler auth
  consola.start('Validating Cloudflare credentials...');
  const runner = new WranglerRunner({ cwd: projectDir });
  const accountId = await runner.getAccountId();
  consola.success(`Authenticated to account ${accountId}`);

  // Step 2: Create D1 database (need real ID for wrangler.jsonc)
  consola.start(`Creating D1 database "${dbName}"...`);
  let d1Result: { uuid: string; name: string };
  try {
    d1Result = await createD1Database(runner, dbName);
  } catch (err) {
    throw new Error(
      `D1 database creation failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  consola.success(`D1 database created: ${d1Result.uuid}`);

  // Step 3: Generate config files
  consola.start('Generating configuration files...');

  // 3a: open-next.config.ts
  const openNextContent = generateOpenNextConfig();
  fs.writeFileSync(
    path.join(projectDir, 'open-next.config.ts'),
    openNextContent
  );

  // 3b: wrangler.jsonc (with real D1 database ID)
  const wranglerContent = generateWranglerConfig({
    workerName,
    d1DatabaseName: dbName,
    d1DatabaseId: d1Result.uuid,
    compatibilityDate: new Date().toISOString().slice(0, 10),
  });
  fs.writeFileSync(
    path.join(projectDir, 'wrangler.jsonc'),
    wranglerContent
  );

  // 3c: Update package.json
  const pkgPath = path.join(projectDir, 'package.json');
  const existingPkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  const updates = generatePackageScriptUpdates();
  existingPkg.scripts = { ...existingPkg.scripts, ...updates.scripts };
  existingPkg.devDependencies = {
    ...existingPkg.devDependencies,
    ...updates.devDependencies,
  };
  fs.writeFileSync(pkgPath, JSON.stringify(existingPkg, null, 2) + '\n');

  // 3d: Parse .env and create .dev.vars if env file exists
  let secrets: Record<string, string> = {};
  const envPath = path.join(projectDir, '.env');
  const envLocalPath = path.join(projectDir, '.env.local');
  const envFile = fs.existsSync(envPath)
    ? envPath
    : fs.existsSync(envLocalPath)
      ? envLocalPath
      : null;

  if (envFile) {
    const envContent = fs.readFileSync(envFile, 'utf-8');
    const mapped = mapEnvToSecrets(envContent);
    secrets = mapped.secrets;

    // Write .dev.vars for local development
    const devVarsEntries = [
      ...Object.entries(mapped.plainVars),
      ...Object.entries(mapped.secrets),
    ];
    if (devVarsEntries.length > 0) {
      const devVarsContent = devVarsEntries
        .map(([k, v]) => `${k}=${v}`)
        .join('\n');
      fs.writeFileSync(
        path.join(projectDir, '.dev.vars'),
        devVarsContent + '\n'
      );
    }
  }

  // 3e: Add .open-next to .gitignore
  const gitignorePath = path.join(projectDir, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    const existing = fs.readFileSync(gitignorePath, 'utf-8');
    if (!existing.includes('.open-next')) {
      fs.writeFileSync(gitignorePath, existing.trimEnd() + '\n.open-next\n');
    }
  } else {
    fs.writeFileSync(gitignorePath, '.open-next\n');
  }

  consola.success('Configuration files generated');

  // Step 4: Install new dependencies
  consola.start('Installing dependencies...');
  await execa('npm', ['install'], { cwd: projectDir, stdio: 'inherit' });
  consola.success('Dependencies installed');

  // Step 5: Create git branch and commit
  consola.start('Creating migration branch...');
  await createMigrationBranch(projectDir);
  await commitChanges(
    projectDir,
    'chore: configure Cloudflare deployment via v2cf'
  );
  consola.success('Changes committed to v2cf/migrate branch');

  // ── Phase B: Infrastructure Provisioning ──────────────────────────

  // Step 6: Run migration SQL if exists
  const migrationPath = path.join(
    projectDir,
    'migrations',
    '0001_kv_schema.sql'
  );
  if (fs.existsSync(migrationPath)) {
    consola.start('Running D1 migration...');
    await runMigration(runner, dbName, migrationPath);
    consola.success('Migration complete');
  }

  // Step 7: Build and deploy
  consola.start('Building and deploying...');
  await buildAndDeploy(runner);
  consola.success('Deployed to Cloudflare Workers');

  // Step 8: Push secrets (after deploy so worker exists)
  let secretsCount = 0;
  if (Object.keys(secrets).length > 0) {
    consola.start('Pushing secrets...');
    secretsCount = await pushSecrets(runner, secrets, projectDir);
    consola.success(`${secretsCount} secrets pushed`);
  }

  // Step 9: Configure custom domain (requires CLOUDFLARE_API_TOKEN)
  let customDomain: string | undefined;
  if (subdomain) {
    if (!isDomainConfigAvailable()) {
      consola.warn(
        `Custom domain skipped — CLOUDFLARE_API_TOKEN not set.\n` +
          `Your app is live at https://${workerName}.workers.dev\n` +
          `To add a custom domain later, set CLOUDFLARE_API_TOKEN and re-run with --subdomain.`
      );
    } else {
      consola.start(`Configuring custom domain: ${subdomain}...`);
      const zone = await resolveZone(accountId, subdomain);
      await configureDomain(
        accountId,
        subdomain,
        workerName,
        zone.zoneId,
        zone.zoneName
      );
      customDomain = subdomain;
      consola.success(`Custom domain configured: ${subdomain}`);
    }
  }

  // Step 10: Return result
  return {
    success: true,
    workerUrl: `https://${workerName}.workers.dev`,
    customDomain,
    d1DatabaseId: d1Result.uuid,
    secretsCount,
  };
}
