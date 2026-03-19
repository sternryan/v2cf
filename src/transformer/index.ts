import { transforms as defaultTransforms } from './transforms/index.js';
import type { TransformRule, TransformContext, TransformResult } from './types.js';
import type { ProjectModel, DetectedPattern } from '../schemas/project-model.js';
import { loadProject } from '../analyzer/project-loader.js';
import type { Project } from 'ts-morph';

export interface ApplyTransformsOptions {
  dryRun?: boolean;
  /** Override transforms list (for testing). Uses registered transforms if not provided. */
  transforms?: TransformRule[];
  /** Override ts-morph Project (for testing with in-memory projects). */
  project?: Project;
}

export interface ApplyTransformsResult {
  results: TransformResult[];
  manualPatterns: DetectedPattern[];
}

export async function applyTransforms(
  model: ProjectModel,
  options: ApplyTransformsOptions = {}
): Promise<ApplyTransformsResult> {
  const dryRun = options.dryRun ?? false;
  const ruleSet = options.transforms ?? defaultTransforms;

  // Use provided project or load from disk
  const project = options.project ?? loadProject(model.projectDir).project;

  const context: TransformContext = {
    project,
    projectDir: model.projectDir,
    model,
    dryRun,
  };

  const results: TransformResult[] = [];

  // Collect MANUAL patterns separately -- never auto-transform them
  const manualPatterns = model.patterns.filter(
    (p) => p.confidence === 'MANUAL'
  );

  // Process transforms in registered order
  for (const rule of ruleSet) {
    // Find patterns this rule handles, excluding MANUAL confidence
    const matchingPatterns = model.patterns.filter(
      (p) => rule.appliesTo.includes(p.type) && p.confidence !== 'MANUAL'
    );

    for (const pattern of matchingPatterns) {
      const sourceFile = project.getSourceFile(pattern.file);
      if (!sourceFile) continue;

      const result = rule.transform(sourceFile, pattern, context);
      results.push(result);
    }
  }

  // Save all modified files at once (atomic batch)
  if (!dryRun) {
    await project.save();
  }

  return { results, manualPatterns };
}
