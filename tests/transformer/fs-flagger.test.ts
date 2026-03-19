import { describe, it, expect } from 'vitest';
import {
  Project,
  ScriptTarget,
  ModuleKind,
  ModuleResolutionKind,
  ts,
} from 'ts-morph';
import { fsFlagger } from '../../src/transformer/transforms/fs-flagger.js';
import type { TransformContext } from '../../src/transformer/types.js';
import type { DetectedPattern } from '../../src/schemas/project-model.js';

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

describe('fs-flagger', () => {
  it('inserts V2CF_MANUAL warning comment above fs.readFileSync call', () => {
    const project = createTestProject({
      '/test/loader.ts': `import fs from "fs";\n\nfunction load() {\n  const raw = fs.readFileSync(filePath, "utf-8");\n  return raw;\n}\n`,
    });
    const sourceFile = project.getSourceFileOrThrow('/test/loader.ts');
    const context = makeContext(project);

    const pattern: DetectedPattern = {
      type: 'runtime-fs',
      method: 'readFileSync',
      pathExpression: 'filePath',
      isStaticPath: false,
      file: '/test/loader.ts',
      line: 4,
      confidence: 'REVIEW',
    };

    const result = fsFlagger.transform(sourceFile, pattern, context);

    const text = sourceFile.getFullText();
    expect(text).toContain('V2CF_MANUAL');
    expect(text).toContain('fs.readFileSync call will fail in CF Workers runtime');
    expect(result.applied).toBe(true);
    expect(result.ruleId).toBe('fs-flagger');
  });

  it('includes suggestion guidance text', () => {
    const project = createTestProject({
      '/test/loader.ts': `import fs from "fs";\n\nfunction load() {\n  const raw = fs.readFileSync(filePath, "utf-8");\n  return raw;\n}\n`,
    });
    const sourceFile = project.getSourceFileOrThrow('/test/loader.ts');
    const context = makeContext(project);

    const pattern: DetectedPattern = {
      type: 'runtime-fs',
      method: 'readFileSync',
      pathExpression: 'filePath',
      isStaticPath: false,
      file: '/test/loader.ts',
      line: 4,
      confidence: 'REVIEW',
    };

    fsFlagger.transform(sourceFile, pattern, context);

    const text = sourceFile.getFullText();
    expect(text).toContain('Suggestion: Move this read to build-time or use a static import');
  });

  it('does NOT modify or remove the fs.readFileSync call itself', () => {
    const project = createTestProject({
      '/test/loader.ts': `import fs from "fs";\n\nfunction load() {\n  const raw = fs.readFileSync(filePath, "utf-8");\n  return raw;\n}\n`,
    });
    const sourceFile = project.getSourceFileOrThrow('/test/loader.ts');
    const context = makeContext(project);

    const pattern: DetectedPattern = {
      type: 'runtime-fs',
      method: 'readFileSync',
      pathExpression: 'filePath',
      isStaticPath: false,
      file: '/test/loader.ts',
      line: 4,
      confidence: 'REVIEW',
    };

    fsFlagger.transform(sourceFile, pattern, context);

    const text = sourceFile.getFullText();
    // The original call must still be present
    expect(text).toContain('fs.readFileSync(filePath, "utf-8")');
  });

  it('is idempotent -- does not insert duplicate comment if V2CF_MANUAL already present', () => {
    const project = createTestProject({
      '/test/loader.ts': `import fs from "fs";\n\nfunction load() {\n  // V2CF_MANUAL: This fs.readFileSync call will fail in CF Workers runtime.\n  // Suggestion: Move this read to build-time or use a static import.\n  const raw = fs.readFileSync(filePath, "utf-8");\n  return raw;\n}\n`,
    });
    const sourceFile = project.getSourceFileOrThrow('/test/loader.ts');
    const context = makeContext(project);

    const pattern: DetectedPattern = {
      type: 'runtime-fs',
      method: 'readFileSync',
      pathExpression: 'filePath',
      isStaticPath: false,
      file: '/test/loader.ts',
      line: 6,
      confidence: 'REVIEW',
    };

    const result = fsFlagger.transform(sourceFile, pattern, context);

    expect(result.applied).toBe(false);
    expect(result.changes).toHaveLength(0);

    // Count occurrences of V2CF_MANUAL -- should be exactly 1
    const text = sourceFile.getFullText();
    const matches = text.match(/V2CF_MANUAL/g);
    expect(matches).toHaveLength(1);
  });

  it('works for both REVIEW and MANUAL confidence patterns', () => {
    const project = createTestProject({
      '/test/loader.ts': `import fs from "fs";\n\nfunction load() {\n  const raw = fs.readFileSync(filePath, "utf-8");\n  return raw;\n}\n`,
    });
    const sourceFile = project.getSourceFileOrThrow('/test/loader.ts');
    const context = makeContext(project);

    // MANUAL confidence pattern
    const pattern: DetectedPattern = {
      type: 'runtime-fs',
      method: 'readFileSync',
      pathExpression: 'filePath',
      isStaticPath: false,
      file: '/test/loader.ts',
      line: 4,
      confidence: 'MANUAL',
    };

    const result = fsFlagger.transform(sourceFile, pattern, context);

    const text = sourceFile.getFullText();
    expect(text).toContain('V2CF_MANUAL');
    expect(result.applied).toBe(true);
    // Record the change with original confidence
    expect(result.changes[0].confidence).toBe('MANUAL');
  });

  it('records the flagged item in changes with original confidence tier', () => {
    const project = createTestProject({
      '/test/loader.ts': `import fs from "fs";\n\nfunction load() {\n  const raw = fs.readFileSync(filePath, "utf-8");\n  return raw;\n}\n`,
    });
    const sourceFile = project.getSourceFileOrThrow('/test/loader.ts');
    const context = makeContext(project);

    const pattern: DetectedPattern = {
      type: 'runtime-fs',
      method: 'readFileSync',
      pathExpression: 'filePath',
      isStaticPath: false,
      file: '/test/loader.ts',
      line: 4,
      confidence: 'REVIEW',
    };

    const result = fsFlagger.transform(sourceFile, pattern, context);

    expect(result.changes).toHaveLength(1);
    expect(result.changes[0].confidence).toBe('REVIEW');
    expect(result.changes[0].description).toContain('fs.readFileSync');
    expect(result.filesModified).toContain('/test/loader.ts');
  });
});
