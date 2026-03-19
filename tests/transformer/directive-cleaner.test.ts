import { describe, it, expect } from 'vitest';
import {
  Project,
  ScriptTarget,
  ModuleKind,
  ModuleResolutionKind,
  ts,
} from 'ts-morph';
import { directiveCleaner } from '../../src/transformer/transforms/directive-cleaner.js';
import type { TransformContext } from '../../src/transformer/types.js';
import type { DetectedPattern, ProjectModel } from '../../src/schemas/project-model.js';

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

function makeContext(project: Project): TransformContext {
  return {
    project,
    projectDir: '/test',
    model: {
      projectDir: '/test',
      analyzedAt: new Date().toISOString(),
      dependencies: {},
      patterns: [],
      summary: { total: 0, auto: 0, review: 0, manual: 0 },
    },
    dryRun: false,
  };
}

describe('directive-cleaner', () => {
  it('removes maxDuration export and replaces with v2cf warning comment', () => {
    const project = createTestProject({
      '/test/route.ts': `export const maxDuration = 30;\n\nexport async function POST() {\n  return new Response("ok");\n}\n`,
    });
    const sourceFile = project.getSourceFileOrThrow('/test/route.ts');
    const context = makeContext(project);

    const pattern: DetectedPattern = {
      type: 'max-duration',
      value: 30,
      file: '/test/route.ts',
      line: 1,
      confidence: 'AUTO',
    };

    const result = directiveCleaner.transform(sourceFile, pattern, context);

    const text = sourceFile.getFullText();
    expect(text).not.toContain('export const maxDuration');
    expect(text).toContain('v2cf: Removed maxDuration = 30');
    expect(text).toContain('CF Workers');
    expect(text).toContain('30s CPU limit');
    expect(result.applied).toBe(true);
    expect(result.ruleId).toBe('directive-cleaner');
    expect(result.filesModified).toContain('/test/route.ts');
  });

  it('removes edge-runtime export and replaces with v2cf comment', () => {
    const project = createTestProject({
      '/test/route.ts': `export const runtime = 'edge';\n\nexport async function GET() {\n  return new Response("ok");\n}\n`,
    });
    const sourceFile = project.getSourceFileOrThrow('/test/route.ts');
    const context = makeContext(project);

    const pattern: DetectedPattern = {
      type: 'edge-runtime',
      runtime: 'edge',
      file: '/test/route.ts',
      line: 1,
      confidence: 'AUTO',
    };

    const result = directiveCleaner.transform(sourceFile, pattern, context);

    const text = sourceFile.getFullText();
    expect(text).not.toContain("export const runtime = 'edge'");
    expect(text).toContain('v2cf: Removed runtime');
    expect(text).toContain('edge-native');
    expect(result.applied).toBe(true);
  });

  it('warns when maxDuration > 30', () => {
    const project = createTestProject({
      '/test/route.ts': `export const maxDuration = 120;\n\nexport async function POST() {}\n`,
    });
    const sourceFile = project.getSourceFileOrThrow('/test/route.ts');
    const context = makeContext(project);

    const pattern: DetectedPattern = {
      type: 'max-duration',
      value: 120,
      file: '/test/route.ts',
      line: 1,
      confidence: 'AUTO',
    };

    const result = directiveCleaner.transform(sourceFile, pattern, context);

    expect(result.applied).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('120');
    expect(result.warnings[0]).toContain('30s');
  });

  it('is idempotent -- running on already-transformed code is a no-op', () => {
    const project = createTestProject({
      '/test/route.ts': `// v2cf: Removed maxDuration = 30. CF Workers: 30s CPU limit (paid),\n// wall-clock I/O time is unlimited while client is connected.\n\nexport async function POST() {}\n`,
    });
    const sourceFile = project.getSourceFileOrThrow('/test/route.ts');
    const context = makeContext(project);

    const pattern: DetectedPattern = {
      type: 'max-duration',
      value: 30,
      file: '/test/route.ts',
      line: 1,
      confidence: 'AUTO',
    };

    const result = directiveCleaner.transform(sourceFile, pattern, context);

    expect(result.applied).toBe(false);
    expect(result.changes).toHaveLength(0);
  });

  it('preserves other exports in the same file', () => {
    const project = createTestProject({
      '/test/route.ts': `export const maxDuration = 30;\n\nexport async function POST(req: Request) {\n  return new Response("ok");\n}\n\nexport function GET() {\n  return new Response("hello");\n}\n`,
    });
    const sourceFile = project.getSourceFileOrThrow('/test/route.ts');
    const context = makeContext(project);

    const pattern: DetectedPattern = {
      type: 'max-duration',
      value: 30,
      file: '/test/route.ts',
      line: 1,
      confidence: 'AUTO',
    };

    directiveCleaner.transform(sourceFile, pattern, context);

    const text = sourceFile.getFullText();
    expect(text).toContain('export async function POST');
    expect(text).toContain('export function GET');
    expect(text).not.toContain('export const maxDuration');
  });
});
