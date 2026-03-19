import { describe, it, expect, vi } from 'vitest';
import {
  Project,
  ScriptTarget,
  ModuleKind,
  ModuleResolutionKind,
  ts,
} from 'ts-morph';
import type { SourceFile } from 'ts-morph';
import type { ProjectModel, DetectedPattern } from '../../src/schemas/project-model.js';
import type { TransformRule, TransformResult, TransformContext } from '../../src/transformer/types.js';
import { applyTransforms } from '../../src/transformer/index.js';
import { formatTransformReport } from '../../src/transformer/report.js';

function createTestProject(files: Record<string, string>): Project {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      target: ScriptTarget.ES2022,
      module: ModuleKind.ESNext,
      moduleResolution: ModuleResolutionKind.Bundler,
      jsx: ts.JsxEmit.ReactJSX,
    },
  });
  for (const [name, content] of Object.entries(files)) {
    project.createSourceFile(name, content);
  }
  return project;
}

function makeModel(patterns: DetectedPattern[], projectDir = '/test'): ProjectModel {
  return {
    projectDir,
    analyzedAt: new Date().toISOString(),
    dependencies: {},
    patterns,
    summary: {
      total: patterns.length,
      auto: patterns.filter((p) => p.confidence === 'AUTO').length,
      review: patterns.filter((p) => p.confidence === 'REVIEW').length,
      manual: patterns.filter((p) => p.confidence === 'MANUAL').length,
    },
  };
}

describe('transform pipeline', () => {
  it('returns empty results with empty transforms list', async () => {
    const model = makeModel([]);
    const project = createTestProject({});
    const results = await applyTransforms(model, { dryRun: true, transforms: [], project });
    expect(results.results).toEqual([]);
  });

  it('filters out MANUAL-confidence patterns', async () => {
    const transformFn = vi.fn().mockReturnValue({
      ruleId: 'test-rule',
      applied: true,
      filesModified: [],
      filesGenerated: [],
      changes: [],
      warnings: [],
    });

    const mockRule: TransformRule = {
      id: 'test-rule',
      name: 'Test Rule',
      description: 'test',
      appliesTo: ['max-duration'],
      dependencies: [],
      transform: transformFn,
    };

    const model = makeModel([
      { type: 'max-duration', value: 30, file: '/test/route.ts', line: 1, confidence: 'AUTO' },
      { type: 'max-duration', value: 60, file: '/test/route2.ts', line: 1, confidence: 'MANUAL' },
    ]);

    const project = createTestProject({
      '/test/route.ts': 'export const maxDuration = 30;',
      '/test/route2.ts': 'export const maxDuration = 60;',
    });

    const results = await applyTransforms(model, {
      dryRun: true,
      transforms: [mockRule],
      project,
    });

    // Should only be called once (for the AUTO pattern, not the MANUAL one)
    expect(transformFn).toHaveBeenCalledTimes(1);
    expect(results.manualPatterns).toHaveLength(1);
    expect(results.manualPatterns[0].confidence).toBe('MANUAL');
  });

  it('calls transforms in registered order', async () => {
    const callOrder: string[] = [];

    const rule1: TransformRule = {
      id: 'first',
      name: 'First',
      description: 'first',
      appliesTo: ['max-duration'],
      dependencies: [],
      transform: () => {
        callOrder.push('first');
        return {
          ruleId: 'first',
          applied: true,
          filesModified: [],
          filesGenerated: [],
          changes: [],
          warnings: [],
        };
      },
    };

    const rule2: TransformRule = {
      id: 'second',
      name: 'Second',
      description: 'second',
      appliesTo: ['max-duration'],
      dependencies: [],
      transform: () => {
        callOrder.push('second');
        return {
          ruleId: 'second',
          applied: true,
          filesModified: [],
          filesGenerated: [],
          changes: [],
          warnings: [],
        };
      },
    };

    const model = makeModel([
      { type: 'max-duration', value: 30, file: '/test/route.ts', line: 1, confidence: 'AUTO' },
    ]);

    const project = createTestProject({
      '/test/route.ts': 'export const maxDuration = 30;',
    });

    await applyTransforms(model, {
      dryRun: true,
      transforms: [rule1, rule2],
      project,
    });

    expect(callOrder).toEqual(['first', 'second']);
  });

  it('does NOT call project.save() when dryRun is true', async () => {
    const project = createTestProject({
      '/test/route.ts': 'export const maxDuration = 30;',
    });
    const saveSpy = vi.spyOn(project, 'save');

    const model = makeModel([]);

    await applyTransforms(model, {
      dryRun: true,
      transforms: [],
      project,
    });

    expect(saveSpy).not.toHaveBeenCalled();
  });

  it('calls project.save() when dryRun is false', async () => {
    const project = createTestProject({
      '/test/route.ts': 'export const maxDuration = 30;',
    });
    const saveSpy = vi.spyOn(project, 'save').mockResolvedValue(undefined);

    const model = makeModel([]);

    await applyTransforms(model, {
      dryRun: false,
      transforms: [],
      project,
    });

    expect(saveSpy).toHaveBeenCalledTimes(1);
  });
});

describe('formatTransformReport', () => {
  it('separates applied changes from flagged manual items', () => {
    const results: TransformResult[] = [
      {
        ruleId: 'directive-cleaner',
        applied: true,
        filesModified: ['/app/route.ts'],
        filesGenerated: [],
        changes: [
          {
            file: '/app/route.ts',
            line: 5,
            description: 'Removed export const maxDuration = 30',
            confidence: 'AUTO',
          },
        ],
        warnings: [],
      },
      {
        ruleId: 'import-rewriter',
        applied: false,
        filesModified: [],
        filesGenerated: [],
        changes: [],
        warnings: [],
      },
    ];

    const manualPatterns: DetectedPattern[] = [
      {
        type: 'runtime-fs',
        method: 'readFileSync',
        pathExpression: 'filePath',
        isStaticPath: false,
        file: '/lib/loader.ts',
        line: 10,
        confidence: 'MANUAL',
      },
    ];

    // Capture console output
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(' '));

    formatTransformReport(results, manualPatterns);

    console.log = originalLog;

    const output = logs.join('\n');

    // Should contain applied changes section
    expect(output).toContain('Applied Changes');
    expect(output).toContain('Removed export const maxDuration');

    // Should contain flagged items section
    expect(output).toContain('Flagged');
    expect(output).toContain('Manual');
    expect(output).toContain('readFileSync');

    // Should contain summary line
    expect(output).toMatch(/Applied \d+ change/);
    expect(output).toMatch(/\d+ item.*flagged/i);
  });
});
