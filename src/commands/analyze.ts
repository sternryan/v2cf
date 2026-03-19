import { Command } from 'commander';
import path from 'path';
import type { CliOptions } from '../types/index.js';
import { analyze } from '../analyzer/index.js';
import { formatReport } from '../report/formatter.js';
import { writeJsonReport } from '../report/json-writer.js';

export function registerAnalyzeCommand(program: Command): void {
  program
    .command('analyze')
    .description(
      'Analyze a Next.js project for Vercel-specific patterns (dry-run, no changes)'
    )
    .argument('<project-dir>', 'Path to the Next.js project directory')
    .action(async (projectDir: string) => {
      const opts = program.opts<CliOptions>();
      const resolvedDir = path.resolve(projectDir);

      const model = await analyze(resolvedDir, { verbose: opts.verbose });

      if (opts.json) {
        writeJsonReport(model);
      } else {
        formatReport(model);
      }
    });
}
