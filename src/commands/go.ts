import { Command } from 'commander';
import path from 'path';
import type { CliOptions } from '../types/index.js';
import type { TransformContext } from '../transformer/types.js';
import { analyze } from '../analyzer/index.js';
import { loadProject } from '../analyzer/project-loader.js';
import { formatReport } from '../report/formatter.js';
import { writeJsonReport } from '../report/json-writer.js';
import { applyTransforms } from '../transformer/index.js';
import { generateImageLoader } from '../transformer/transforms/image-loader-gen.js';
import { formatTransformReport } from '../transformer/report.js';

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

      // Future pipeline steps
      console.log('Deploy and sync steps coming in future phases.\n');
    });
}
