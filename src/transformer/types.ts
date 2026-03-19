import type { SourceFile, Project } from 'ts-morph';
import type { DetectedPattern, ProjectModel } from '../schemas/project-model.js';

export interface TransformContext {
  project: Project;
  projectDir: string;
  model: ProjectModel;
  dryRun: boolean;
}

export interface ChangeDescription {
  file: string;
  line: number;
  description: string;
  confidence: 'AUTO' | 'REVIEW' | 'MANUAL';
}

export interface TransformResult {
  ruleId: string;
  applied: boolean;
  filesModified: string[];
  filesGenerated: string[];
  changes: ChangeDescription[];
  warnings: string[];
}

export interface TransformRule {
  id: string;
  name: string;
  description: string;
  /** Which pattern types this transform handles */
  appliesTo: DetectedPattern['type'][];
  /** IDs of rules that must run before this one */
  dependencies: string[];
  /**
   * Apply transform for a single detected pattern.
   * Called once per matching pattern from the analysis.
   */
  transform(
    sourceFile: SourceFile,
    pattern: DetectedPattern,
    context: TransformContext
  ): TransformResult;
}
