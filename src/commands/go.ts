import { Command } from 'commander';
import path from 'path';
import chalk from 'chalk';
import type { CliOptions } from '../types/index.js';
import type { TransformContext } from '../transformer/types.js';
import type { DeployResult } from '../orchestrator/types.js';
import { analyze } from '../analyzer/index.js';
import { loadProject } from '../analyzer/project-loader.js';
import { formatReport } from '../report/formatter.js';
import { writeJsonReport } from '../report/json-writer.js';
import { applyTransforms } from '../transformer/index.js';
import { generateImageLoader } from '../transformer/transforms/image-loader-gen.js';
import { formatTransformReport } from '../transformer/report.js';
import { runDeployPipeline } from '../orchestrator/index.js';
import { ensureCleanTree } from '../orchestrator/git-branch.js';
import { runSyncEnable } from './sync.js';
import { WranglerRunner } from '../orchestrator/wrangler-runner.js';

export function registerGoCommand(program: Command): void {
  program
    .command('go')
    .description(
      'Run the full v2cf pipeline (analyze -> transform -> deploy -> sync)'
    )
    .argument('<project-dir>', 'Path to the Next.js project directory')
    .option(
      '--worker-name <name>',
      'Cloudflare Worker name (defaults to directory name)'
    )
    .option(
      '--subdomain <domain>',
      'Custom subdomain to configure (e.g., cf.quartermint.com)'
    )
    .option('--skip-deploy', 'Run analyze and transform only, skip deployment')
    .option('--skip-sync', 'Skip auto-sync setup after deployment')
    .option('--skip-replay', 'Skip replay validation step')
    .action(async (projectDir: string, cmdOpts: { workerName?: string; subdomain?: string; skipDeploy?: boolean; skipSync?: boolean; skipReplay?: boolean }) => {
      const opts = program.opts<CliOptions>();
      const resolvedDir = path.resolve(projectDir);

      // Step 0: Ensure clean tree before making any changes
      if (!cmdOpts.skipDeploy) {
        await ensureCleanTree(resolvedDir);
      }

      // Step 1: Analyze
      const model = await analyze(resolvedDir, { verbose: opts.verbose });

      if (opts.json) {
        writeJsonReport(model);
      } else {
        formatReport(model);
      }

      // Step 2: Transform
      const { results, manualPatterns } = await applyTransforms(model, {
        dryRun: false,
      });

      // XFRM-04: Generate image loader if project uses next/image
      const { project } = loadProject(resolvedDir);
      const usesNextImage = project.getSourceFiles().some((sf) =>
        sf.getImportDeclarations().some((imp) =>
          imp.getModuleSpecifierValue() === 'next/image'
        )
      );
      if (usesNextImage) {
        const imageContext: TransformContext = {
          project,
          projectDir: resolvedDir,
          model,
          dryRun: false,
        };
        const imageResult = generateImageLoader(imageContext);
        if (imageResult.applied) {
          results.push(imageResult);
          await project.save();
        }
      }

      formatTransformReport(results, manualPatterns);

      // Step 3: Deploy to Cloudflare
      if (!cmdOpts.skipDeploy) {
        const workerName = cmdOpts.workerName || path.basename(resolvedDir);
        console.log('\n--- Step 3: Deploy to Cloudflare ---\n');
        const result: DeployResult = await runDeployPipeline({
          projectDir: resolvedDir,
          workerName,
          subdomain: cmdOpts.subdomain,
        });
        console.log(chalk.green('\u2714 Deployed successfully!'));
        console.log('Worker URL: ' + result.workerUrl);
        if (result.customDomain) {
          console.log('Custom domain: https://' + result.customDomain);
        }
        console.log('D1 Database: ' + result.d1DatabaseId);
        console.log('Secrets pushed: ' + result.secretsCount);
        // Step 4: Enable Auto-Sync
        if (!cmdOpts.skipSync) {
          if (!process.env.VERCEL_TOKEN) {
            console.log(
              chalk.cyan('\nSync skipped') +
                ' -- set VERCEL_TOKEN to enable auto-sync. See: https://vercel.com/account/tokens'
            );
          } else {
            console.log('\n--- Step 4: Enable Auto-Sync ---\n');
            try {
              const runner = new WranglerRunner({ cwd: resolvedDir });
              const accountId = await runner.getAccountId();
              const syncResult = await runSyncEnable({
                projectDir: resolvedDir,
                workerName,
                accountId,
              });
              console.log(
                chalk.green('\u2714') +
                  ' Auto-sync enabled! Cloudflare will rebuild on every Vercel deploy.'
              );
              console.log('Sync Worker URL: ' + syncResult.webhookWorkerUrl);
            } catch (err) {
              console.log(
                chalk.yellow(
                  'Sync setup failed (non-fatal): ' +
                    (err instanceof Error ? err.message : String(err))
                )
              );
              console.log(
                'You can set up sync later with `v2cf sync enable`'
              );
            }
          }
        }

        // Step 5: Replay Validation (optional)
        if (!cmdOpts.skipReplay) {
          console.log('\n--- Step 5: Replay Validation ---\n');
          try {
            const sessionsDir = path.join(resolvedDir, '.v2cf', 'sessions');
            const fs = await import('node:fs');
            if (fs.existsSync(sessionsDir) && fs.readdirSync(sessionsDir).some((f: string) => f.endsWith('.json'))) {
              console.log(
                chalk.cyan('Captured sessions found.') +
                  ' Run `v2cf replay run ' + projectDir + ' --target <cloudflare-url>` to compare Vercel vs Cloudflare behavior.'
              );
            } else {
              console.log(
                'No captured sessions found. To validate behavioral parity:'
              );
              console.log(
                '  1. Run `v2cf replay capture ' + projectDir + '` to generate a recorder script'
              );
              console.log(
                '  2. Paste the script into your Vercel site\'s <head> and interact with it'
              );
              console.log(
                '  3. Save the session data, then run `v2cf replay run ' + projectDir + ' --target <cloudflare-url>`'
              );
            }
          } catch (err) {
            console.log(
              chalk.yellow(
                'Replay check failed (non-fatal): ' +
                  (err instanceof Error ? err.message : String(err))
              )
            );
            console.log(
              'You can run replay validation later with `v2cf replay`'
            );
          }
        }
      } else {
        console.log('\nDeploy skipped (--skip-deploy flag).\n');
      }
    });
}
