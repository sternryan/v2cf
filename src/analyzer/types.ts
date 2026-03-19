import type { Project, SourceFile } from 'ts-morph';
import type { DetectedPattern } from '../schemas/project-model.js';

export interface ScanContext {
  project: Project;
  sourceFiles: SourceFile[];
  dependencies: Record<string, string>;
  detectedPackages: string[];
}

export interface Scanner {
  name: string;
  scan(context: ScanContext): DetectedPattern[];
}
