import { describe, it, expect } from 'vitest';
import { Project, ScriptTarget, ModuleKind, ModuleResolutionKind, ts } from 'ts-morph';
import path from 'path';
import { loadProject } from '../../src/analyzer/project-loader.js';
import type { ScanContext } from '../../src/analyzer/types.js';
import { dependencyScanner } from '../../src/analyzer/scanners/dependency-scanner.js';

describe('dependency-scanner', () => {
  it('detects @vercel/kv in stripped fixture dependencies', () => {
    const targetDir = path.resolve('tests/fixtures/stripped');
    const { project, sourceFiles, dependencies } = loadProject(targetDir);
    const context: ScanContext = {
      project,
      sourceFiles,
      dependencies,
      detectedPackages: [],
    };

    dependencyScanner.scan(context);

    expect(context.detectedPackages).toContain('@vercel/kv');
  });

  it('populates detectedPackages array for downstream scanners', () => {
    const targetDir = path.resolve('tests/fixtures/edge-cases');
    const { project, sourceFiles, dependencies } = loadProject(targetDir);
    const context: ScanContext = {
      project,
      sourceFiles,
      dependencies,
      detectedPackages: [],
    };

    dependencyScanner.scan(context);

    expect(context.detectedPackages).toContain('@vercel/kv');
    expect(context.detectedPackages).toContain('@vercel/analytics');
  });

  it('returns vercel-analytics pattern for @vercel/analytics dependency', () => {
    const targetDir = path.resolve('tests/fixtures/edge-cases');
    const { project, sourceFiles, dependencies } = loadProject(targetDir);
    const context: ScanContext = {
      project,
      sourceFiles,
      dependencies,
      detectedPackages: [],
    };

    const patterns = dependencyScanner.scan(context);

    const analyticsPattern = patterns.find(
      (p) => p.type === 'vercel-analytics'
    );
    expect(analyticsPattern).toBeDefined();
    expect(analyticsPattern!.confidence).toBe('AUTO');
  });

  it('returns empty array for project with no @vercel/* deps', () => {
    const project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: {
        target: ScriptTarget.ES2022,
        module: ModuleKind.ESNext,
        moduleResolution: ModuleResolutionKind.Bundler,
        jsx: ts.JsxEmit.ReactJSX,
      },
    });

    const context: ScanContext = {
      project,
      sourceFiles: [],
      dependencies: { react: '^18', next: '14.2.0' },
      detectedPackages: [],
    };

    const patterns = dependencyScanner.scan(context);

    expect(patterns).toHaveLength(0);
    expect(context.detectedPackages).toHaveLength(0);
  });

  it('does not return patterns for @vercel/kv (handled by import-scanner)', () => {
    const targetDir = path.resolve('tests/fixtures/stripped');
    const { project, sourceFiles, dependencies } = loadProject(targetDir);
    const context: ScanContext = {
      project,
      sourceFiles,
      dependencies,
      detectedPackages: [],
    };

    const patterns = dependencyScanner.scan(context);

    const kvPatterns = patterns.filter((p) => p.type === 'vercel-kv');
    expect(kvPatterns).toHaveLength(0);
  });
});
