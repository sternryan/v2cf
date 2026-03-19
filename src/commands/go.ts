import { Command } from 'commander';
import type { CliOptions } from '../types/index.js';

export function registerGoCommand(program: Command): void {
  program
    .command('go')
    .description(
      'Run the full v2cf pipeline (analyze -> transform -> deploy -> sync)'
    )
    .argument('<project-dir>', 'Path to the Next.js project directory')
    .action((projectDir: string) => {
      const opts = program.opts<CliOptions>();
      if (!opts.quiet) {
        console.log(`Running full pipeline on ${projectDir}...`);
        console.log(
          'Transform, deploy, and sync steps coming in future phases.'
        );
      }
    });
}
