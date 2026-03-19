import { describe, it, expect } from 'vitest';
import {
  Project,
  ScriptTarget,
  ModuleKind,
  ModuleResolutionKind,
  ts,
} from 'ts-morph';
import { importRewriter } from '../../src/transformer/transforms/import-rewriter.js';
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

describe('import-rewriter', () => {
  it('removes @vercel/analytics import AND removes <Analytics /> JSX element', () => {
    const project = createTestProject({
      '/test/layout.tsx': [
        'import { Analytics } from "@vercel/analytics/react";',
        'import { Inter } from "next/font/google";',
        '',
        'export default function RootLayout({ children }: { children: React.ReactNode }) {',
        '  return (',
        '    <html>',
        '      <body>',
        '        {children}',
        '        <Analytics />',
        '      </body>',
        '    </html>',
        '  );',
        '}',
      ].join('\n'),
    });
    const sourceFile = project.getSourceFileOrThrow('/test/layout.tsx');
    const context = makeContext(project);

    const pattern: DetectedPattern = {
      type: 'vercel-analytics',
      package: '@vercel/analytics',
      file: '/test/layout.tsx',
      line: 1,
      confidence: 'AUTO',
    };

    const result = importRewriter.transform(sourceFile, pattern, context);

    const text = sourceFile.getFullText();
    expect(text).not.toContain('@vercel/analytics');
    expect(text).not.toContain('<Analytics />');
    expect(text).not.toContain('<Analytics/>');
    // Should preserve other imports
    expect(text).toContain('next/font/google');
    expect(result.applied).toBe(true);
    expect(result.ruleId).toBe('import-rewriter');
  });

  it('removes @vercel/analytics/react subpath import variant', () => {
    const project = createTestProject({
      '/test/layout.tsx': [
        'import { Analytics } from "@vercel/analytics/react";',
        '',
        'export default function Layout() {',
        '  return <div><Analytics /></div>;',
        '}',
      ].join('\n'),
    });
    const sourceFile = project.getSourceFileOrThrow('/test/layout.tsx');
    const context = makeContext(project);

    const pattern: DetectedPattern = {
      type: 'vercel-analytics',
      package: '@vercel/analytics',
      file: '/test/layout.tsx',
      line: 1,
      confidence: 'AUTO',
    };

    const result = importRewriter.transform(sourceFile, pattern, context);

    const text = sourceFile.getFullText();
    expect(text).not.toContain('@vercel/analytics');
    expect(text).not.toContain('Analytics');
    expect(result.applied).toBe(true);
  });

  it('removes @vercel/speed-insights import AND <SpeedInsights /> JSX element', () => {
    const project = createTestProject({
      '/test/layout.tsx': [
        'import { SpeedInsights } from "@vercel/speed-insights/react";',
        'import { Inter } from "next/font/google";',
        '',
        'export default function RootLayout({ children }: { children: React.ReactNode }) {',
        '  return (',
        '    <html>',
        '      <body>',
        '        {children}',
        '        <SpeedInsights />',
        '      </body>',
        '    </html>',
        '  );',
        '}',
      ].join('\n'),
    });
    const sourceFile = project.getSourceFileOrThrow('/test/layout.tsx');
    const context = makeContext(project);

    const pattern: DetectedPattern = {
      type: 'vercel-analytics',
      package: '@vercel/speed-insights',
      file: '/test/layout.tsx',
      line: 1,
      confidence: 'AUTO',
    };

    const result = importRewriter.transform(sourceFile, pattern, context);

    const text = sourceFile.getFullText();
    expect(text).not.toContain('@vercel/speed-insights');
    expect(text).not.toContain('<SpeedInsights />');
    expect(text).not.toContain('<SpeedInsights/>');
    expect(text).toContain('next/font/google');
    expect(result.applied).toBe(true);
  });

  it('rewrites @vercel/og to next/og preserving named imports', () => {
    const project = createTestProject({
      '/test/og.tsx': [
        'import { ImageResponse } from "@vercel/og";',
        '',
        'export async function GET() {',
        '  return new ImageResponse(<div>Hello</div>);',
        '}',
      ].join('\n'),
    });
    const sourceFile = project.getSourceFileOrThrow('/test/og.tsx');
    const context = makeContext(project);

    const pattern: DetectedPattern = {
      type: 'vercel-og',
      package: '@vercel/og',
      file: '/test/og.tsx',
      line: 1,
      confidence: 'AUTO',
    };

    const result = importRewriter.transform(sourceFile, pattern, context);

    const text = sourceFile.getFullText();
    expect(text).not.toContain('@vercel/og');
    expect(text).toContain('next/og');
    expect(text).toContain('ImageResponse');
    expect(result.applied).toBe(true);
  });

  it('is idempotent -- running on code with no @vercel imports is a no-op', () => {
    const project = createTestProject({
      '/test/layout.tsx': [
        'import { Inter } from "next/font/google";',
        '',
        'export default function RootLayout({ children }: { children: React.ReactNode }) {',
        '  return <html><body>{children}</body></html>;',
        '}',
      ].join('\n'),
    });
    const sourceFile = project.getSourceFileOrThrow('/test/layout.tsx');
    const context = makeContext(project);

    const pattern: DetectedPattern = {
      type: 'vercel-analytics',
      package: '@vercel/analytics',
      file: '/test/layout.tsx',
      line: 1,
      confidence: 'AUTO',
    };

    const result = importRewriter.transform(sourceFile, pattern, context);

    expect(result.applied).toBe(false);
    expect(result.changes).toHaveLength(0);
  });

  it('does NOT touch @vercel/kv imports (Phase 3)', () => {
    const project = createTestProject({
      '/test/store.ts': [
        'import { kv } from "@vercel/kv";',
        '',
        'export async function getData() { return kv.get("key"); }',
      ].join('\n'),
    });
    const sourceFile = project.getSourceFileOrThrow('/test/store.ts');
    const context = makeContext(project);

    // importRewriter does not apply to vercel-kv patterns -- verify
    expect(importRewriter.appliesTo).not.toContain('vercel-kv');

    // Even if called directly (shouldn't happen), verify it doesn't touch kv imports
    const pattern: DetectedPattern = {
      type: 'vercel-analytics',
      package: '@vercel/analytics',
      file: '/test/store.ts',
      line: 1,
      confidence: 'AUTO',
    };

    importRewriter.transform(sourceFile, pattern, context);

    const text = sourceFile.getFullText();
    expect(text).toContain('@vercel/kv');
  });
});
