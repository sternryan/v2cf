import { Command } from 'commander';
import path from 'path';
import type { CliOptions } from '../types/index.js';
import type { TransformContext } from '../transformer/types.js';
import { analyze } from '../analyzer/index.js';
import { loadProject } from '../analyzer/project-loader.js';
import { applyTransforms } from '../transformer/index.js';
import { generateImageLoader } from '../transformer/transforms/image-loader-gen.js';
import { formatTransformReport } from '../transformer/report.js';

export function registerTransformCommand(program: Command): void {
  program
    .command('transform')
    .description(
      'Apply Cloudflare transforms to a Next.js project'
    )
    .argument('<project-dir>', 'Path to the Next.js project directory')
    .option('--dry-run', 'Show what would be changed without modifying files')
    .action(async (projectDir: string, cmdOpts: { dryRun?: boolean }) => {
      const opts = program.opts<CliOptions>();
      const resolvedDir = path.resolve(projectDir);

      // Step 1: Analyze to get ProjectModel
      const model = await analyze(resolvedDir, { verbose: opts.verbose });

      // Step 2: Apply transforms
      const dryRun = cmdOpts.dryRun ?? false;
      const { results, manualPatterns } = await applyTransforms(model, {
        dryRun,
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
          dryRun,
        };
        const imageResult = generateImageLoader(imageContext);
        if (imageResult.applied) {
          results.push(imageResult);
        }
        if (!dryRun) {
          await project.save();
        }
      }

      // Step 3: Format and display report
      if (opts.json) {
        console.log(JSON.stringify({ results, manualPatterns }, null, 2));
      } else {
        formatTransformReport(results, manualPatterns);
      }

      if (dryRun) {
        console.log('Dry run complete. No files were modified.');
      }
    });
}
