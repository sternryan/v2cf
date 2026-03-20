import { Command } from 'commander';
import path from 'path';
import fs from 'node:fs';
import chalk from 'chalk';
import { registerVercelWebhook, deleteVercelWebhook } from '../sync/vercel-webhook.js';
import { deployWebhookWorker, deleteWebhookWorker } from '../sync/worker-deployer.js';
import { readSyncState, writeSyncState } from '../sync/sync-state.js';
import { generateSyncWorkflow } from '../sync/github-action-gen.js';
import { WranglerRunner } from '../orchestrator/wrangler-runner.js';
import { execa } from 'execa';
import type { SyncState } from '../sync/types.js';

/**
 * Format a timestamp as a relative time string (e.g., "2 hours ago").
 */
function formatRelativeTime(timestamp: string): string {
  const diffMs = Date.now() - new Date(timestamp).getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
}

/**
 * Core sync enable logic. Exported for reuse in the `go` command.
 */
export async function runSyncEnable(opts: {
  projectDir: string;
  workerName: string;
  accountId: string;
  vercelProjectId?: string;
  vercelTeamId?: string;
}): Promise<{ webhookWorkerUrl: string; vercelWebhookId: string }> {
  const vercelToken = process.env.VERCEL_TOKEN;
  if (!vercelToken) {
    throw new Error(
      'VERCEL_TOKEN environment variable required for sync. ' +
        'Create a token at https://vercel.com/account/tokens'
    );
  }

  const fullWorkerName = `v2cf-sync-${opts.workerName}`;

  // Deploy webhook Worker
  const workerResult = await deployWebhookWorker(fullWorkerName, opts.projectDir, {
    CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN || '',
    CLOUDFLARE_ACCOUNT_ID: opts.accountId,
    WORKER_NAME: opts.workerName,
  });

  // Register Vercel webhook
  const webhook = await registerVercelWebhook(vercelToken, workerResult.url, {
    projectId: opts.vercelProjectId,
    teamId: opts.vercelTeamId,
  });

  // Push webhook secret to Worker via wrangler secret put
  try {
    await execa('npx', ['wrangler', 'secret', 'put', 'VERCEL_WEBHOOK_SECRET', '--name', fullWorkerName], {
      cwd: opts.projectDir,
      input: webhook.secret,
      stdio: 'pipe',
    });
  } catch {
    // Non-fatal: secret might already be pushed via bulk in deployWebhookWorker
  }

  // Save sync state
  const state: SyncState = {
    enabled: true,
    vercelWebhookId: webhook.id,
    vercelWebhookSecret: webhook.secret,
    webhookWorkerUrl: workerResult.url,
    webhookWorkerName: fullWorkerName,
    vercelProjectId: opts.vercelProjectId,
    vercelTeamId: opts.vercelTeamId,
    rebuildMethod: 'worker',
    createdAt: new Date().toISOString(),
  };

  await writeSyncState(opts.projectDir, state);

  return {
    webhookWorkerUrl: workerResult.url,
    vercelWebhookId: webhook.id,
  };
}

/**
 * Core sync disable logic. Exported for testing.
 */
export async function runSyncDisable(projectDir: string): Promise<void> {
  const vercelToken = process.env.VERCEL_TOKEN;
  const state = await readSyncState(projectDir);

  if (!state || !state.enabled) {
    throw new Error('Sync is not enabled. Run `v2cf sync enable` first.');
  }

  // Delete Vercel webhook
  if (vercelToken) {
    await deleteVercelWebhook(vercelToken, state.vercelWebhookId, state.vercelTeamId);
  }

  // Delete webhook Worker
  await deleteWebhookWorker(state.webhookWorkerName, projectDir);

  // Update state to disabled
  await writeSyncState(projectDir, { ...state, enabled: false });
}

/**
 * Core sync status logic. Returns the formatted status string.
 */
export async function runSyncStatus(projectDir: string): Promise<string> {
  const state = await readSyncState(projectDir);
  const lines: string[] = [];

  if (!state) {
    lines.push('Sync: NOT CONFIGURED');
    lines.push('Run `v2cf sync enable <project-dir>` to set up auto-sync');
    return lines.join('\n');
  }

  if (state.enabled) {
    lines.push(`Sync: ${chalk.green('ENABLED')}`);
  } else {
    lines.push(`Sync: ${chalk.yellow('DISABLED')}`);
  }

  lines.push(`Webhook Worker: ${state.webhookWorkerUrl}`);
  lines.push(`Vercel Webhook ID: ${state.vercelWebhookId}`);
  lines.push(`Rebuild Method: ${state.rebuildMethod}`);

  if (state.lastSync) {
    lines.push('');
    lines.push('Last Sync:');
    lines.push(`  Time: ${state.lastSync.timestamp} (${formatRelativeTime(state.lastSync.timestamp)})`);

    if (state.lastSync.success) {
      lines.push(`  Status: ${chalk.green('SUCCESS')}`);
    } else {
      lines.push(`  Status: ${chalk.red('FAILED')}`);
    }

    if (state.lastSync.deploymentId) {
      lines.push(`  Deployment: ${state.lastSync.deploymentId}`);
    }

    if (state.lastSync.error) {
      lines.push(`  Error: ${state.lastSync.error}`);
    }
  }

  lines.push('');
  if (state.enabled && (!state.lastSync || state.lastSync.success)) {
    lines.push('Health: All systems operational');
  } else if (state.lastSync && !state.lastSync.success) {
    lines.push(`Health: ${chalk.yellow('Last sync failed')}`);
  }

  return lines.join('\n');
}

/**
 * Register the `v2cf sync` command with enable, disable, and status subcommands.
 */
export function registerSyncCommand(program: Command): void {
  const syncCmd = program
    .command('sync')
    .description('Manage Vercel-to-Cloudflare auto-sync');

  // sync enable <project-dir>
  syncCmd
    .command('enable')
    .description('Set up automatic Cloudflare rebuilds triggered by Vercel deploys')
    .argument('<project-dir>', 'Path to the project directory')
    .option('--worker-name <name>', 'Cloudflare Worker name (defaults to directory name)')
    .option('--github-action', 'Also generate a GitHub Action workflow file')
    .option('--team-id <id>', 'Vercel team ID override')
    .action(async (projectDir: string, cmdOpts: { workerName?: string; githubAction?: boolean; teamId?: string }) => {
      const resolvedDir = path.resolve(projectDir);
      const workerName = cmdOpts.workerName || path.basename(resolvedDir);

      // Get account ID
      const runner = new WranglerRunner({ cwd: resolvedDir });
      const accountId = await runner.getAccountId();

      // Check for .vercel/project.json for optional project scoping
      let vercelProjectId: string | undefined;
      let vercelTeamId: string | undefined = cmdOpts.teamId;

      const vercelProjectPath = path.join(resolvedDir, '.vercel', 'project.json');
      if (fs.existsSync(vercelProjectPath)) {
        try {
          const vercelProject = JSON.parse(fs.readFileSync(vercelProjectPath, 'utf-8'));
          vercelProjectId = vercelProject.projectId;
          if (!vercelTeamId) {
            vercelTeamId = vercelProject.orgId;
          }
        } catch {
          // Ignore parse errors
        }
      }

      const result = await runSyncEnable({
        projectDir: resolvedDir,
        workerName,
        accountId,
        vercelProjectId,
        vercelTeamId,
      });

      // Generate GitHub Action workflow if requested
      if (cmdOpts.githubAction) {
        const workflowContent = generateSyncWorkflow({ workerName });
        const workflowDir = path.join(resolvedDir, '.github', 'workflows');
        fs.mkdirSync(workflowDir, { recursive: true });
        fs.writeFileSync(path.join(workflowDir, 'v2cf-sync.yml'), workflowContent, 'utf-8');
        console.log(chalk.green('\u2714') + ' Generated .github/workflows/v2cf-sync.yml');
      }

      console.log(chalk.green('\u2714') + ' Sync enabled');
      console.log('Worker URL: ' + result.webhookWorkerUrl);
      console.log('Webhook ID: ' + result.vercelWebhookId);
    });

  // sync disable <project-dir>
  syncCmd
    .command('disable')
    .description('Remove Vercel webhook and webhook Worker')
    .argument('<project-dir>', 'Path to the project directory')
    .action(async (projectDir: string) => {
      const resolvedDir = path.resolve(projectDir);
      await runSyncDisable(resolvedDir);
      console.log(chalk.green('\u2714') + ' Sync disabled');
    });

  // sync status <project-dir>
  syncCmd
    .command('status')
    .description('Show sync configuration and health')
    .argument('<project-dir>', 'Path to the project directory')
    .action(async (projectDir: string) => {
      const resolvedDir = path.resolve(projectDir);
      const output = await runSyncStatus(resolvedDir);
      console.log(output);
    });
}
