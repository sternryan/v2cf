import { describe, it, expect } from 'vitest';
import { Project, ScriptTarget, ModuleKind, ModuleResolutionKind, ts } from 'ts-morph';
import path from 'path';
import { loadProject } from '../../src/analyzer/project-loader.js';
import type { ScanContext } from '../../src/analyzer/types.js';
import { importScanner } from '../../src/analyzer/scanners/import-scanner.js';

function createInMemoryContext(files: Record<string, string>, deps: string[] = ['@vercel/kv']): ScanContext {
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

  const depObj: Record<string, string> = {};
  for (const d of deps) {
    depObj[d] = '^1.0.0';
  }

  return {
    project,
    sourceFiles: project.getSourceFiles(),
    dependencies: depObj,
    detectedPackages: deps,
  };
}

describe('import-scanner', () => {
  it('detects named import from @vercel/kv in conversation-log.ts', () => {
    const targetDir = path.resolve('tests/fixtures/stripped');
    const { project, sourceFiles, dependencies } = loadProject(targetDir);
    const context: ScanContext = {
      project,
      sourceFiles,
      dependencies,
      detectedPackages: ['@vercel/kv'],
    };

    const patterns = importScanner.scan(context);

    const convLogPatterns = patterns.filter((p) =>
      p.file.includes('conversation-log')
    );
    expect(convLogPatterns.length).toBeGreaterThanOrEqual(1);
    expect(convLogPatterns[0].type).toBe('vercel-kv');
  });

  it('detects named import from @vercel/kv in rate-limit.ts', () => {
    const targetDir = path.resolve('tests/fixtures/stripped');
    const { project, sourceFiles, dependencies } = loadProject(targetDir);
    const context: ScanContext = {
      project,
      sourceFiles,
      dependencies,
      detectedPackages: ['@vercel/kv'],
    };

    const patterns = importScanner.scan(context);

    const rateLimitPatterns = patterns.filter((p) =>
      p.file.includes('rate-limit')
    );
    expect(rateLimitPatterns.length).toBeGreaterThanOrEqual(1);
    expect(rateLimitPatterns[0].type).toBe('vercel-kv');
  });

  it('detects aliased import: import { kv as store } from "@vercel/kv"', () => {
    const ctx = createInMemoryContext({
      'lib/aliased.ts': 'import { kv as store } from "@vercel/kv";\nexport async function getData() { return store.get("key"); }',
    });

    const patterns = importScanner.scan(ctx);

    expect(patterns).toHaveLength(1);
    expect(patterns[0].type).toBe('vercel-kv');
    if (patterns[0].type === 'vercel-kv') {
      expect(patterns[0].importStyle).toBe('aliased');
    }
  });

  it('detects dynamic import: await import("@vercel/kv")', () => {
    const ctx = createInMemoryContext({
      'lib/dynamic.ts': 'export async function lazyKv() {\n  const { kv } = await import("@vercel/kv");\n  return kv.get("key");\n}',
    });

    const patterns = importScanner.scan(ctx);

    expect(patterns).toHaveLength(1);
    expect(patterns[0].type).toBe('vercel-kv');
    if (patterns[0].type === 'vercel-kv') {
      expect(patterns[0].importStyle).toBe('dynamic');
    }
  });

  it('detects namespace import: import * as vercelKv from "@vercel/kv"', () => {
    const ctx = createInMemoryContext({
      'lib/namespace.ts': 'import * as vercelKv from "@vercel/kv";\nexport async function getData() { return vercelKv.kv.get("key"); }',
    });

    const patterns = importScanner.scan(ctx);

    expect(patterns).toHaveLength(1);
    expect(patterns[0].type).toBe('vercel-kv');
    if (patterns[0].type === 'vercel-kv') {
      expect(patterns[0].importStyle).toBe('namespace');
    }
  });

  it('detects re-export: export { kv } from "@vercel/kv"', () => {
    const ctx = createInMemoryContext({
      'lib/barrel.ts': 'export { kv } from "@vercel/kv";',
    });

    const patterns = importScanner.scan(ctx);

    expect(patterns).toHaveLength(1);
    expect(patterns[0].type).toBe('vercel-kv');
    if (patterns[0].type === 'vercel-kv') {
      expect(patterns[0].importStyle).toBe('reexport');
    }
  });

  it('traces kv operations (lpush, lrange) and assigns REVIEW confidence', () => {
    const targetDir = path.resolve('tests/fixtures/stripped');
    const { project, sourceFiles, dependencies } = loadProject(targetDir);
    const context: ScanContext = {
      project,
      sourceFiles,
      dependencies,
      detectedPackages: ['@vercel/kv'],
    };

    const patterns = importScanner.scan(context);

    const convLogPattern = patterns.find(
      (p) => p.file.includes('conversation-log') && p.type === 'vercel-kv'
    );
    expect(convLogPattern).toBeDefined();
    expect(convLogPattern!.confidence).toBe('REVIEW');
    if (convLogPattern!.type === 'vercel-kv') {
      expect(convLogPattern!.operations).toContain('lpush');
      expect(convLogPattern!.operations).toContain('lrange');
    }
  });

  it('traces kv operations (get, set) and assigns AUTO confidence', () => {
    const targetDir = path.resolve('tests/fixtures/stripped');
    const { project, sourceFiles, dependencies } = loadProject(targetDir);
    const context: ScanContext = {
      project,
      sourceFiles,
      dependencies,
      detectedPackages: ['@vercel/kv'],
    };

    const patterns = importScanner.scan(context);

    const rateLimitPattern = patterns.find(
      (p) => p.file.includes('rate-limit') && p.type === 'vercel-kv'
    );
    expect(rateLimitPattern).toBeDefined();
    expect(rateLimitPattern!.confidence).toBe('AUTO');
    if (rateLimitPattern!.type === 'vercel-kv') {
      expect(rateLimitPattern!.operations).toContain('get');
      expect(rateLimitPattern!.operations).toContain('set');
    }
  });

  it('detects @vercel/analytics import', () => {
    const ctx = createInMemoryContext(
      {
        'app/layout.tsx': 'import { Analytics } from "@vercel/analytics/react";\nexport default function Layout() { return <Analytics />; }',
      },
      ['@vercel/analytics']
    );

    const patterns = importScanner.scan(ctx);

    expect(patterns).toHaveLength(1);
    expect(patterns[0].type).toBe('vercel-analytics');
  });
});
