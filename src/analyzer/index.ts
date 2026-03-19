import { loadProject } from './project-loader.js';
import { scanners } from './scanners/index.js';
import type { ScanContext } from './types.js';
import type { DetectedPattern } from '../schemas/project-model.js';
import { ProjectModelSchema } from '../schemas/project-model.js';
import type { ProjectModel } from '../schemas/project-model.js';

export async function analyze(
  targetDir: string,
  options?: { verbose?: boolean }
): Promise<ProjectModel> {
  const { project, sourceFiles, dependencies } = loadProject(targetDir);

  // Extract @vercel/* packages from dependencies
  const detectedPackages = Object.keys(dependencies).filter((dep) =>
    dep.startsWith('@vercel/')
  );

  if (options?.verbose) {
    console.log(`Loaded ${sourceFiles.length} source files`);
    console.log(
      `Detected Vercel packages: ${detectedPackages.length > 0 ? detectedPackages.join(', ') : 'none'}`
    );
  }

  // Build scan context shared across all scanners
  const context: ScanContext = {
    project,
    sourceFiles,
    dependencies,
    detectedPackages,
  };

  // Run all scanners and collect patterns
  const patterns: DetectedPattern[] = [];
  for (const scanner of scanners) {
    if (options?.verbose) {
      console.log(`Running scanner: ${scanner.name}`);
    }
    const found = scanner.scan(context);
    patterns.push(...found);
  }

  // Build summary by confidence tier
  const summary = {
    total: patterns.length,
    auto: patterns.filter((p) => p.confidence === 'AUTO').length,
    review: patterns.filter((p) => p.confidence === 'REVIEW').length,
    manual: patterns.filter((p) => p.confidence === 'MANUAL').length,
  };

  const result: ProjectModel = {
    projectDir: targetDir,
    analyzedAt: new Date().toISOString(),
    dependencies,
    patterns,
    summary,
  };

  // Validate through Zod schema before returning
  return ProjectModelSchema.parse(result);
}
