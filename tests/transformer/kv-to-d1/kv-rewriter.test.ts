import { describe, it, expect } from 'vitest';
import {
  Project,
  ScriptTarget,
  ModuleKind,
  ModuleResolutionKind,
  ts,
} from 'ts-morph';
import { kvRewriter } from '../../../src/transformer/transforms/kv-to-d1/kv-rewriter.js';
import type { TransformContext } from '../../../src/transformer/types.js';
import type { DetectedPattern, ProjectModel } from '../../../src/schemas/project-model.js';

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

function makeContext(
  project: Project,
  patterns: DetectedPattern[] = [],
  projectDir = '/test'
): TransformContext {
  const model: ProjectModel = {
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
  return {
    project,
    projectDir,
    model,
    dryRun: false,
  };
}

describe('kvRewriter', () => {
  describe('named import rewrite', () => {
    it('rewrites `import { kv } from "@vercel/kv"` to `import { d1kv as kv } from "./d1-adapter"`', () => {
      const project = createTestProject({
        '/test/lib/store.ts': [
          'import { kv } from "@vercel/kv";',
          '',
          'export async function getData() { return kv.get("key"); }',
        ].join('\n'),
      });
      const sourceFile = project.getSourceFileOrThrow('/test/lib/store.ts');
      const pattern: DetectedPattern = {
        type: 'vercel-kv',
        package: '@vercel/kv',
        operations: ['get'],
        importStyle: 'named',
        file: '/test/lib/store.ts',
        line: 1,
        confidence: 'AUTO',
      };
      const context = makeContext(project, [pattern]);

      const result = kvRewriter.transform(sourceFile, pattern, context);

      const text = sourceFile.getFullText();
      expect(text).not.toContain('@vercel/kv');
      expect(text).toContain('./d1-adapter');
      expect(text).toContain('d1kv as kv');
      expect(result.applied).toBe(true);
      expect(result.ruleId).toBe('kv-rewriter');
    });
  });

  describe('aliased import rewrite', () => {
    it('rewrites `import { kv as store } from "@vercel/kv"` to `import { d1kv as store } from "./d1-adapter"`', () => {
      const project = createTestProject({
        '/test/lib/store.ts': [
          'import { kv as store } from "@vercel/kv";',
          '',
          'export async function getData() { return store.get("key"); }',
        ].join('\n'),
      });
      const sourceFile = project.getSourceFileOrThrow('/test/lib/store.ts');
      const pattern: DetectedPattern = {
        type: 'vercel-kv',
        package: '@vercel/kv',
        operations: ['get'],
        importStyle: 'aliased',
        file: '/test/lib/store.ts',
        line: 1,
        confidence: 'AUTO',
      };
      const context = makeContext(project, [pattern]);

      const result = kvRewriter.transform(sourceFile, pattern, context);

      const text = sourceFile.getFullText();
      expect(text).not.toContain('@vercel/kv');
      expect(text).toContain('./d1-adapter');
      expect(text).toContain('d1kv as store');
      expect(result.applied).toBe(true);
    });
  });

  describe('file generation', () => {
    it('generates lib/d1-adapter.ts in the target project using getAdapterTemplate()', () => {
      const project = createTestProject({
        '/test/lib/store.ts': 'import { kv } from "@vercel/kv";\nexport const x = kv.get("key");',
      });
      const sourceFile = project.getSourceFileOrThrow('/test/lib/store.ts');
      const pattern: DetectedPattern = {
        type: 'vercel-kv',
        package: '@vercel/kv',
        operations: ['get', 'set'],
        importStyle: 'named',
        file: '/test/lib/store.ts',
        line: 1,
        confidence: 'AUTO',
      };
      const context = makeContext(project, [pattern]);

      kvRewriter.transform(sourceFile, pattern, context);

      const adapterFile = project.getSourceFile('/test/lib/d1-adapter.ts');
      expect(adapterFile).toBeDefined();
      expect(adapterFile!.getFullText()).toContain('d1kv');
      expect(adapterFile!.getFullText()).toContain('getCloudflareContext');
    });

    it('generates migrations/0001_kv_schema.sql using generateMigrationSQL()', () => {
      const project = createTestProject({
        '/test/lib/store.ts': 'import { kv } from "@vercel/kv";\nexport const x = kv.get("key");',
      });
      const sourceFile = project.getSourceFileOrThrow('/test/lib/store.ts');
      const pattern: DetectedPattern = {
        type: 'vercel-kv',
        package: '@vercel/kv',
        operations: ['get', 'set', 'lpush', 'lrange'],
        importStyle: 'named',
        file: '/test/lib/store.ts',
        line: 1,
        confidence: 'AUTO',
      };
      const context = makeContext(project, [pattern]);

      const result = kvRewriter.transform(sourceFile, pattern, context);

      const migrationFile = project.getSourceFile('/test/migrations/0001_kv_schema.sql');
      expect(migrationFile).toBeDefined();
      expect(migrationFile!.getFullText()).toContain('kv_store');
      expect(migrationFile!.getFullText()).toContain('kv_list');
      expect(result.filesGenerated).toContain('lib/d1-adapter.ts');
      expect(result.filesGenerated).toContain('migrations/0001_kv_schema.sql');
    });
  });

  describe('idempotency', () => {
    it('returns applied: false when no @vercel/kv import exists (already transformed)', () => {
      const project = createTestProject({
        '/test/lib/store.ts': [
          'import { d1kv as kv } from "./d1-adapter";',
          '',
          'export async function getData() { return kv.get("key"); }',
        ].join('\n'),
      });
      const sourceFile = project.getSourceFileOrThrow('/test/lib/store.ts');
      const pattern: DetectedPattern = {
        type: 'vercel-kv',
        package: '@vercel/kv',
        operations: ['get'],
        importStyle: 'named',
        file: '/test/lib/store.ts',
        line: 1,
        confidence: 'AUTO',
      };
      const context = makeContext(project, [pattern]);

      const result = kvRewriter.transform(sourceFile, pattern, context);

      expect(result.applied).toBe(false);
      expect(result.changes).toHaveLength(0);
    });

    it('does not regenerate adapter file if it already exists', () => {
      const project = createTestProject({
        '/test/lib/store.ts': 'import { kv } from "@vercel/kv";\nexport const x = kv.get("key");',
        '/test/lib/d1-adapter.ts': 'export const d1kv = {};',
      });
      const sourceFile = project.getSourceFileOrThrow('/test/lib/store.ts');
      const pattern: DetectedPattern = {
        type: 'vercel-kv',
        package: '@vercel/kv',
        operations: ['get'],
        importStyle: 'named',
        file: '/test/lib/store.ts',
        line: 1,
        confidence: 'AUTO',
      };
      const context = makeContext(project, [pattern]);

      const result = kvRewriter.transform(sourceFile, pattern, context);

      // Should still rewrite import
      expect(result.applied).toBe(true);
      // But should NOT regenerate adapter (already exists)
      expect(result.filesGenerated).not.toContain('lib/d1-adapter.ts');
      // Adapter content should be unchanged (existing stub, not template)
      const adapterFile = project.getSourceFileOrThrow('/test/lib/d1-adapter.ts');
      expect(adapterFile.getFullText()).toBe('export const d1kv = {};');
    });
  });

  describe('unsupported import styles', () => {
    it('flags namespace import as MANUAL with warning', () => {
      const project = createTestProject({
        '/test/lib/store.ts': [
          'import * as vercelKv from "@vercel/kv";',
          '',
          'export const data = vercelKv.get("key");',
        ].join('\n'),
      });
      const sourceFile = project.getSourceFileOrThrow('/test/lib/store.ts');
      const pattern: DetectedPattern = {
        type: 'vercel-kv',
        package: '@vercel/kv',
        operations: ['get'],
        importStyle: 'namespace',
        file: '/test/lib/store.ts',
        line: 1,
        confidence: 'MANUAL',
      };
      const context = makeContext(project, [pattern]);

      const result = kvRewriter.transform(sourceFile, pattern, context);

      expect(result.applied).toBe(false);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('namespace');
      // Import should NOT be rewritten
      const text = sourceFile.getFullText();
      expect(text).toContain('@vercel/kv');
    });

    it('flags dynamic import as MANUAL with warning', () => {
      const project = createTestProject({
        '/test/lib/store.ts': [
          'const kv = await import("@vercel/kv");',
          '',
          'export const data = kv.get("key");',
        ].join('\n'),
      });
      const sourceFile = project.getSourceFileOrThrow('/test/lib/store.ts');
      const pattern: DetectedPattern = {
        type: 'vercel-kv',
        package: '@vercel/kv',
        operations: ['get'],
        importStyle: 'dynamic',
        file: '/test/lib/store.ts',
        line: 1,
        confidence: 'MANUAL',
      };
      const context = makeContext(project, [pattern]);

      const result = kvRewriter.transform(sourceFile, pattern, context);

      expect(result.applied).toBe(false);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('dynamic');
    });

    it('flags reexport as MANUAL with warning', () => {
      const project = createTestProject({
        '/test/lib/store.ts': [
          'export { kv } from "@vercel/kv";',
        ].join('\n'),
      });
      const sourceFile = project.getSourceFileOrThrow('/test/lib/store.ts');
      const pattern: DetectedPattern = {
        type: 'vercel-kv',
        package: '@vercel/kv',
        operations: [],
        importStyle: 'reexport',
        file: '/test/lib/store.ts',
        line: 1,
        confidence: 'MANUAL',
      };
      const context = makeContext(project, [pattern]);

      const result = kvRewriter.transform(sourceFile, pattern, context);

      expect(result.applied).toBe(false);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('reexport');
    });
  });

  describe('TransformResult shape', () => {
    it('returns correct TransformResult with ruleId, filesModified, filesGenerated, changes', () => {
      const project = createTestProject({
        '/test/lib/store.ts': 'import { kv } from "@vercel/kv";\nexport const x = kv.get("key");',
      });
      const sourceFile = project.getSourceFileOrThrow('/test/lib/store.ts');
      const pattern: DetectedPattern = {
        type: 'vercel-kv',
        package: '@vercel/kv',
        operations: ['get', 'set'],
        importStyle: 'named',
        file: '/test/lib/store.ts',
        line: 1,
        confidence: 'AUTO',
      };
      const context = makeContext(project, [pattern]);

      const result = kvRewriter.transform(sourceFile, pattern, context);

      expect(result.ruleId).toBe('kv-rewriter');
      expect(result.applied).toBe(true);
      expect(result.filesModified).toContain('/test/lib/store.ts');
      expect(result.filesGenerated.length).toBeGreaterThan(0);
      expect(result.changes.length).toBeGreaterThan(0);
      expect(result.warnings).toEqual([]);
    });
  });

  describe('pipeline registration', () => {
    it('kvRewriter has correct static properties', () => {
      expect(kvRewriter.id).toBe('kv-rewriter');
      expect(kvRewriter.appliesTo).toEqual(['vercel-kv']);
      expect(kvRewriter.dependencies).toEqual(['import-rewriter']);
      expect(kvRewriter.handlesManual).toBe(true);
    });
  });

  describe('operation union for migration', () => {
    it('collects operations from all vercel-kv patterns in context.model for migration generation', () => {
      const patterns: DetectedPattern[] = [
        {
          type: 'vercel-kv',
          package: '@vercel/kv',
          operations: ['get', 'set'],
          importStyle: 'named',
          file: '/test/lib/rate-limit.ts',
          line: 1,
          confidence: 'AUTO',
        },
        {
          type: 'vercel-kv',
          package: '@vercel/kv',
          operations: ['get', 'set', 'lpush', 'lrange'],
          importStyle: 'named',
          file: '/test/lib/conversation-log.ts',
          line: 1,
          confidence: 'AUTO',
        },
      ];

      const project = createTestProject({
        '/test/lib/rate-limit.ts': 'import { kv } from "@vercel/kv";\nexport const x = kv.get("key");',
        '/test/lib/conversation-log.ts': 'import { kv } from "@vercel/kv";\nexport const x = kv.lpush("list", "val");',
      });

      const sourceFile = project.getSourceFileOrThrow('/test/lib/rate-limit.ts');
      const context = makeContext(project, patterns);

      // Process rate-limit first (only get/set ops)
      const result = kvRewriter.transform(sourceFile, patterns[0], context);

      // Migration should include kv_list because context.model has patterns with lpush/lrange
      const migrationFile = project.getSourceFile('/test/migrations/0001_kv_schema.sql');
      expect(migrationFile).toBeDefined();
      expect(migrationFile!.getFullText()).toContain('kv_list');
    });
  });
});
