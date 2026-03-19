import { describe, it, expect } from 'vitest';
import { Project, ScriptTarget, ModuleKind, ModuleResolutionKind, ts } from 'ts-morph';
import path from 'path';
import { loadProject } from '../../src/analyzer/project-loader.js';
import type { ScanContext } from '../../src/analyzer/types.js';
import { patternScanner } from '../../src/analyzer/scanners/pattern-scanner.js';

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

describe('pattern-scanner', () => {
  it('detects export const maxDuration = 30 with value 30 and confidence AUTO', () => {
    const targetDir = path.resolve('tests/fixtures/stripped');
    const { project, sourceFiles, dependencies } = loadProject(targetDir);
    const context: ScanContext = {
      project,
      sourceFiles,
      dependencies,
      detectedPackages: [],
    };

    const patterns = patternScanner.scan(context);

    const maxDuration = patterns.find((p) => p.type === 'max-duration');
    expect(maxDuration).toBeDefined();
    expect(maxDuration!.confidence).toBe('AUTO');
    if (maxDuration!.type === 'max-duration') {
      expect(maxDuration!.value).toBe(30);
    }
  });

  it('detects x-forwarded-for header with confidence AUTO', () => {
    const targetDir = path.resolve('tests/fixtures/stripped');
    const { project, sourceFiles, dependencies } = loadProject(targetDir);
    const context: ScanContext = {
      project,
      sourceFiles,
      dependencies,
      detectedPackages: [],
    };

    const patterns = patternScanner.scan(context);

    const ipHeader = patterns.find((p) => p.type === 'ip-header');
    expect(ipHeader).toBeDefined();
    expect(ipHeader!.confidence).toBe('AUTO');
    if (ipHeader!.type === 'ip-header') {
      expect(ipHeader!.headerName).toBe('x-forwarded-for');
    }
  });

  it('detects fs.readFileSync with static path and confidence REVIEW', () => {
    const targetDir = path.resolve('tests/fixtures/stripped');
    const { project, sourceFiles, dependencies } = loadProject(targetDir);
    const context: ScanContext = {
      project,
      sourceFiles,
      dependencies,
      detectedPackages: [],
    };

    const patterns = patternScanner.scan(context);

    const fsPatterns = patterns.filter((p) => p.type === 'runtime-fs');
    expect(fsPatterns.length).toBeGreaterThanOrEqual(1);

    const profileLoaderFs = fsPatterns.find((p) =>
      p.file.includes('profile-loader')
    );
    expect(profileLoaderFs).toBeDefined();
    expect(profileLoaderFs!.confidence).toBe('REVIEW');
    if (profileLoaderFs!.type === 'runtime-fs') {
      expect(profileLoaderFs!.isStaticPath).toBe(true);
    }
  });

  it('does not flag fs.readFileSync in non-runtime files (e.g., scripts/)', () => {
    const ctx = createInMemoryContext({
      'scripts/build.ts':
        'import fs from "fs";\nconst data = fs.readFileSync("config.json", "utf-8");',
    });

    const patterns = patternScanner.scan(ctx);

    const fsPatterns = patterns.filter((p) => p.type === 'runtime-fs');
    expect(fsPatterns).toHaveLength(0);
  });

  it('detects export const runtime = "edge" with confidence AUTO', () => {
    const ctx = createInMemoryContext({
      'app/api/edge/route.ts':
        'export const runtime = "edge";\nexport function GET() { return new Response("ok"); }',
    });

    const patterns = patternScanner.scan(ctx);

    const edgeRuntime = patterns.find((p) => p.type === 'edge-runtime');
    expect(edgeRuntime).toBeDefined();
    expect(edgeRuntime!.confidence).toBe('AUTO');
    if (edgeRuntime!.type === 'edge-runtime') {
      expect(edgeRuntime!.runtime).toBe('edge');
    }
  });

  it('assigns AUTO confidence for maxDuration pattern', () => {
    const ctx = createInMemoryContext({
      'app/api/route.ts': 'export const maxDuration = 60;',
    });

    const patterns = patternScanner.scan(ctx);

    expect(patterns).toHaveLength(1);
    expect(patterns[0].confidence).toBe('AUTO');
  });

  it('assigns AUTO confidence for ip-header pattern', () => {
    const ctx = createInMemoryContext({
      'app/api/route.ts':
        'import { headers } from "next/headers";\nconst h = headers();\nconst ip = h.get("x-forwarded-for");',
    });

    const patterns = patternScanner.scan(ctx);

    const ipHeader = patterns.find((p) => p.type === 'ip-header');
    expect(ipHeader).toBeDefined();
    expect(ipHeader!.confidence).toBe('AUTO');
  });

  it('assigns REVIEW confidence for static-path fs.readFileSync', () => {
    const ctx = createInMemoryContext({
      'lib/reader.ts':
        'import fs from "fs";\nconst data = fs.readFileSync("data.json", "utf-8");',
    });

    const patterns = patternScanner.scan(ctx);

    expect(patterns).toHaveLength(1);
    expect(patterns[0].type).toBe('runtime-fs');
    expect(patterns[0].confidence).toBe('REVIEW');
  });
});
