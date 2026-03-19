import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  Project,
  ScriptTarget,
  ModuleKind,
  ModuleResolutionKind,
  ts,
} from 'ts-morph';
import { headerAdapter } from '../../src/transformer/transforms/header-adapter.js';
import type { TransformContext } from '../../src/transformer/types.js';
import type { DetectedPattern } from '../../src/schemas/project-model.js';
import fs from 'fs';
import path from 'path';

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

function makeContext(project: Project, projectDir = '/test'): TransformContext {
  return {
    project,
    projectDir,
    model: {
      projectDir,
      analyzedAt: new Date().toISOString(),
      dependencies: {},
      patterns: [],
      summary: { total: 0, auto: 0, review: 0, manual: 0 },
    },
    dryRun: false,
  };
}

describe('header-adapter', () => {
  it('records getClientIp helper file in filesGenerated', () => {
    const project = createTestProject({
      '/test/app/api/chat/route.ts': [
        'import { headers } from "next/headers";',
        '',
        'export async function POST(req: Request) {',
        '  const headersList = headers();',
        '  const ip = headersList.get("x-forwarded-for")?.split(",")[0] || "unknown";',
        '  return new Response(ip);',
        '}',
      ].join('\n'),
    });

    const sourceFile = project.getSourceFileOrThrow(
      '/test/app/api/chat/route.ts'
    );
    const context = makeContext(project);

    const pattern: DetectedPattern = {
      type: 'ip-header',
      headerName: 'x-forwarded-for',
      file: '/test/app/api/chat/route.ts',
      line: 5,
      confidence: 'AUTO',
    };

    const result = headerAdapter.transform(sourceFile, pattern, context);

    expect(result.applied).toBe(true);
    expect(result.ruleId).toBe('header-adapter');
    expect(result.filesGenerated.length).toBeGreaterThan(0);
    expect(result.filesGenerated[0]).toContain('get-client-ip');
  });

  it('replaces inline x-forwarded-for header access with getClientIp call', () => {
    const project = createTestProject({
      '/test/app/api/chat/route.ts': [
        'import { headers } from "next/headers";',
        '',
        'export async function POST(req: Request) {',
        '  const headersList = headers();',
        '  const ip = headersList.get("x-forwarded-for")?.split(",")[0] || "unknown";',
        '  return new Response(ip);',
        '}',
      ].join('\n'),
    });

    const sourceFile = project.getSourceFileOrThrow(
      '/test/app/api/chat/route.ts'
    );
    const context = makeContext(project);

    const pattern: DetectedPattern = {
      type: 'ip-header',
      headerName: 'x-forwarded-for',
      file: '/test/app/api/chat/route.ts',
      line: 5,
      confidence: 'AUTO',
    };

    headerAdapter.transform(sourceFile, pattern, context);

    const text = sourceFile.getFullText();
    expect(text).toContain('getClientIp');
    expect(text).not.toContain(
      'headersList.get("x-forwarded-for")?.split(",")[0] || "unknown"'
    );
  });

  it('adds import for getClientIp at top of transformed file', () => {
    const project = createTestProject({
      '/test/app/api/chat/route.ts': [
        'import { headers } from "next/headers";',
        '',
        'export async function POST(req: Request) {',
        '  const headersList = headers();',
        '  const ip = headersList.get("x-forwarded-for")?.split(",")[0] || "unknown";',
        '  return new Response(ip);',
        '}',
      ].join('\n'),
    });

    const sourceFile = project.getSourceFileOrThrow(
      '/test/app/api/chat/route.ts'
    );
    const context = makeContext(project);

    const pattern: DetectedPattern = {
      type: 'ip-header',
      headerName: 'x-forwarded-for',
      file: '/test/app/api/chat/route.ts',
      line: 5,
      confidence: 'AUTO',
    };

    headerAdapter.transform(sourceFile, pattern, context);

    const text = sourceFile.getFullText();
    expect(text).toContain('getClientIp');
    // Should have an import for the helper
    const importDecls = sourceFile.getImportDeclarations();
    const helperImport = importDecls.find((imp) =>
      imp.getModuleSpecifierValue().includes('get-client-ip')
    );
    expect(helperImport).toBeDefined();
  });

  it('is idempotent -- if getClientIp import already exists, does not add duplicate', () => {
    const project = createTestProject({
      '/test/app/api/chat/route.ts': [
        'import { headers } from "next/headers";',
        'import { getClientIp } from "@/lib/get-client-ip";',
        '',
        'export async function POST(req: Request) {',
        '  const headersList = headers();',
        '  const ip = getClientIp(headersList);',
        '  return new Response(ip);',
        '}',
      ].join('\n'),
    });

    const sourceFile = project.getSourceFileOrThrow(
      '/test/app/api/chat/route.ts'
    );
    const context = makeContext(project);

    const pattern: DetectedPattern = {
      type: 'ip-header',
      headerName: 'x-forwarded-for',
      file: '/test/app/api/chat/route.ts',
      line: 5,
      confidence: 'AUTO',
    };

    const result = headerAdapter.transform(sourceFile, pattern, context);

    expect(result.applied).toBe(false);

    // Should not have duplicate imports
    const importDecls = sourceFile.getImportDeclarations();
    const helperImports = importDecls.filter((imp) =>
      imp.getModuleSpecifierValue().includes('get-client-ip')
    );
    expect(helperImports.length).toBe(1);
  });

  it('handles the exact stripped pattern with || "unknown" fallback', () => {
    const project = createTestProject({
      '/test/app/api/chat/route.ts': [
        'import { anthropic } from "@ai-sdk/anthropic";',
        'import { streamText } from "ai";',
        'import { headers } from "next/headers";',
        '',
        'export const maxDuration = 30;',
        '',
        'export async function POST(req: Request) {',
        '  const headersList = headers();',
        '  const ip =',
        '    headersList.get("x-forwarded-for")?.split(",")[0] || "unknown";',
        '  const userAgent = headersList.get("user-agent") || "unknown";',
        '  return new Response(ip);',
        '}',
      ].join('\n'),
    });

    const sourceFile = project.getSourceFileOrThrow(
      '/test/app/api/chat/route.ts'
    );
    const context = makeContext(project);

    const pattern: DetectedPattern = {
      type: 'ip-header',
      headerName: 'x-forwarded-for',
      file: '/test/app/api/chat/route.ts',
      line: 10,
      confidence: 'AUTO',
    };

    const result = headerAdapter.transform(sourceFile, pattern, context);

    const text = sourceFile.getFullText();
    expect(result.applied).toBe(true);
    expect(text).toContain('getClientIp');
    // user-agent access should not be affected
    expect(text).toContain('headersList.get("user-agent")');
  });
});
