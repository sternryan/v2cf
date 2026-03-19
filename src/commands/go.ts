import { Command } from 'commander';
import path from 'path';
import type { CliOptions } from '../types/index.js';
import { analyze } from '../analyzer/index.js';
import { formatReport } from '../report/formatter.js';
import { writeJsonReport } from '../report/json-writer.js';

export function registerGoCommand(program: Command): void {
  program
    .command('go')
    .description(
      'Run the full v2cf pipeline (analyze -> transform -> deploy -> sync)'
    )
    .argument('<project-dir>', 'Path to the Next.js project directory')
    .action(async (projectDir: string) => {
      const opts = program.opts<CliOptions>();
      const resolvedDir = path.resolve(projectDir);

      // Step 1: Analyze
      const model = await analyze(resolvedDir, { verbose: opts.verbose });

      if (opts.json) {
        writeJsonReport(model);
      } else {
        formatReport(model);
      }

      // Future pipeline steps
      console.log(
        'Transform, deploy, and sync steps coming in future phases.\n'
      );
    });
}
