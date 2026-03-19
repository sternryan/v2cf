import { describe, it, expect } from 'vitest';
import { Project, ScriptTarget, ModuleKind, ModuleResolutionKind, ts } from 'ts-morph';
import path from 'path';
import { loadProject } from '../../src/analyzer/project-loader.js';
import type { ScanContext } from '../../src/analyzer/types.js';
import { streamingScanner } from '../../src/analyzer/scanners/streaming-scanner.js';

function createInMemoryContext(
  files: Record<string, string>
): ScanContext {
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

  return {
    project,
    sourceFiles: project.getSourceFiles(),
    dependencies: {},
    detectedPackages: [],
  };
}

describe('streaming-scanner', () => {
  it('detects onFinish callback inside streamText call in route.ts', () => {
    const targetDir = path.resolve('tests/fixtures/stripped');
    const { project, sourceFiles, dependencies } = loadProject(targetDir);
    const context: ScanContext = {
      project,
      sourceFiles,
      dependencies,
      detectedPackages: [],
    };

    const patterns = streamingScanner.scan(context);

    const onFinish = patterns.find((p) => p.type === 'streaming-callback');
    expect(onFinish).toBeDefined();
    if (onFinish!.type === 'streaming-callback') {
      expect(onFinish!.callbackName).toBe('onFinish');
    }
  });

  it('assigns REVIEW confidence for streaming-callback', () => {
    const targetDir = path.resolve('tests/fixtures/stripped');
    const { project, sourceFiles, dependencies } = loadProject(targetDir);
    const context: ScanContext = {
      project,
      sourceFiles,
      dependencies,
      detectedPackages: [],
    };

    const patterns = streamingScanner.scan(context);

    const onFinish = patterns.find((p) => p.type === 'streaming-callback');
    expect(onFinish).toBeDefined();
    expect(onFinish!.confidence).toBe('REVIEW');
  });

  it('does not false-positive on unrelated onFinish properties', () => {
    const ctx = createInMemoryContext({
      'lib/animation.ts':
        'const config = { onFinish: () => console.log("done") };\nfunction animate(opts: any) { opts.onFinish?.(); }',
    });

    const patterns = streamingScanner.scan(ctx);

    // Should not detect onFinish that is not inside a streaming function call
    expect(patterns).toHaveLength(0);
  });

  it('detects onFinish in streamObject call', () => {
    const ctx = createInMemoryContext({
      'app/api/gen/route.ts': `
import { streamObject } from "ai";
const result = await streamObject({
  model: someModel,
  schema: mySchema,
  onFinish: async ({ object }) => {
    await saveToDb(object);
  },
});`,
    });

    const patterns = streamingScanner.scan(ctx);

    expect(patterns).toHaveLength(1);
    expect(patterns[0].type).toBe('streaming-callback');
    if (patterns[0].type === 'streaming-callback') {
      expect(patterns[0].callbackName).toBe('onFinish');
    }
  });
});
