import { Command } from 'commander';
import type { CliOptions } from '../types/index.js';

export function registerAnalyzeCommand(program: Command): void {
  program
    .command('analyze')
    .description(
      'Analyze a Next.js project for Vercel-specific patterns (dry-run, no changes)'
    )
    .argument('<project-dir>', 'Path to the Next.js project directory')
    .action((projectDir: string) => {
      const opts = program.opts<CliOptions>();
      if (!opts.quiet) {
        console.log(`Analyzing ${projectDir}...`);
        console.log(
          'Scanner pipeline will be wired in Plan 02. This is a placeholder.'
        );
      }
    });
}
