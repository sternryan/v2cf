import { Command } from 'commander';
import path from 'path';
import chalk from 'chalk';
import { runDeployPipeline } from '../orchestrator/index.js';
import type { DeployResult } from '../orchestrator/types.js';

export function registerDeployCommand(program: Command): void {
  program
    .command('deploy')
    .description('Deploy a transformed project to Cloudflare Workers')
    .argument(
      '<project-dir>',
      'Path to the transformed Next.js project directory'
    )
    .option(
      '--worker-name <name>',
      'Cloudflare Worker name (defaults to directory name)'
    )
    .option(
      '--subdomain <domain>',
      'Custom subdomain to configure (e.g., cf.quartermint.com)'
    )
    .action(
      async (
        projectDir: string,
        cmdOpts: { workerName?: string; subdomain?: string }
      ) => {
        const resolvedDir = path.resolve(projectDir);
        const workerName = cmdOpts.workerName || path.basename(resolvedDir);

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
      }
    );
}
