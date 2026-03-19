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

describe('end-to-end pipeline integration', () => {
  it('applies all transforms to stripped-like patterns in a single pipeline run', async () => {
    const project = createTestProject({
      '/test/app/api/chat/route.ts': `export const maxDuration = 30;

import { streamText } from 'ai';
import { headers } from 'next/headers';

export async function POST(req: Request) {
  const headersList = headers();
  const ip = headersList.get("x-forwarded-for")?.split(",")[0] || "unknown";

  const result = await streamText({
    model: anthropic('claude-sonnet-4-6'),
    messages,
    onFinish: async ({ text }) => {
      await appendMessage(convId, { role: 'assistant', content: text });
    },
  });
}
`,
      '/test/lib/profile-loader.ts': `import fs from "fs";

function load() {
  const raw = fs.readFileSync(filePath, "utf-8");
  return raw;
}
`,
    });

    const patterns: DetectedPattern[] = [
      // XFRM-01: maxDuration
      { type: 'max-duration', value: 30, file: '/test/app/api/chat/route.ts', line: 1, confidence: 'AUTO' },
      // XFRM-03: IP header
      { type: 'ip-header', headerName: 'x-forwarded-for', file: '/test/app/api/chat/route.ts', line: 8, confidence: 'AUTO' },
      // XFRM-07: streaming callback
      { type: 'streaming-callback', callbackName: 'onFinish', file: '/test/app/api/chat/route.ts', line: 14, confidence: 'REVIEW' },
      // XFRM-06: fs.readFileSync (MANUAL -- should be flagged not transformed)
      { type: 'runtime-fs', method: 'readFileSync', pathExpression: 'filePath', isStaticPath: false, file: '/test/lib/profile-loader.ts', line: 4, confidence: 'MANUAL' },
    ];

    const model = makeModel(patterns);
    const { results, manualPatterns } = await applyTransforms(model, {
      dryRun: true,
      project,
    });

    // Verify XFRM-01: maxDuration removed
    const routeText = project.getSourceFileOrThrow('/test/app/api/chat/route.ts').getFullText();
    expect(routeText).not.toContain('export const maxDuration');
    expect(routeText).toContain('v2cf: Removed maxDuration');

    // Verify XFRM-03: IP header adapted
    expect(routeText).toContain('getClientIp');

    // Verify XFRM-07: streaming callback wrapped
    expect(routeText).toContain('getCloudflareContext');
    expect(routeText).toContain('ctx.waitUntil');

    // Verify MANUAL patterns are still collected for the report
    expect(manualPatterns).toHaveLength(1);
    expect(manualPatterns[0].type).toBe('runtime-fs');

    // Verify XFRM-06: fsFlagger receives MANUAL runtime-fs patterns via handlesManual
    const profileText = project.getSourceFileOrThrow('/test/lib/profile-loader.ts').getFullText();
    expect(profileText).toContain('V2CF_MANUAL');

    // At least some results were applied
    const appliedResults = results.filter((r) => r.applied);
    expect(appliedResults.length).toBeGreaterThan(0);
  });

  it('handlesManual transforms receive MANUAL-confidence patterns', async () => {
    const manualTransformFn = vi.fn().mockReturnValue({
      ruleId: 'manual-handler',
      applied: true,
      filesModified: [],
      filesGenerated: [],
      changes: [],
      warnings: [],
    });

    const nonManualTransformFn = vi.fn().mockReturnValue({
      ruleId: 'non-manual-handler',
      applied: true,
      filesModified: [],
      filesGenerated: [],
      changes: [],
      warnings: [],
    });

    const manualRule: TransformRule = {
      id: 'manual-handler',
      name: 'Manual Handler',
      description: 'handles manual patterns',
      appliesTo: ['max-duration'],
      dependencies: [],
      handlesManual: true,
      transform: manualTransformFn,
    };

    const nonManualRule: TransformRule = {
      id: 'non-manual-handler',
      name: 'Non-Manual Handler',
      description: 'does not handle manual patterns',
      appliesTo: ['max-duration'],
      dependencies: [],
      transform: nonManualTransformFn,
    };

    const model = makeModel([
      { type: 'max-duration', value: 60, file: '/test/route.ts', line: 1, confidence: 'MANUAL' },
    ]);

    const project = createTestProject({
      '/test/route.ts': 'export const maxDuration = 60;',
    });

    await applyTransforms(model, {
      dryRun: true,
      transforms: [manualRule, nonManualRule],
      project,
    });

    // handlesManual rule should be called for MANUAL patterns
    expect(manualTransformFn).toHaveBeenCalledTimes(1);
    // non-handlesManual rule should NOT be called for MANUAL patterns
    expect(nonManualTransformFn).toHaveBeenCalledTimes(0);
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
