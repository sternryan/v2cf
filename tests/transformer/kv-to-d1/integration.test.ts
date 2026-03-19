import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  Project,
  ScriptTarget,
  ModuleKind,
  ModuleResolutionKind,
  ts,
} from 'ts-morph';
import { kvRewriter } from '../../../src/transformer/transforms/kv-to-d1/kv-rewriter.js';
import { applyTransforms } from '../../../src/transformer/index.js';
import type { DetectedPattern, ProjectModel } from '../../../src/schemas/project-model.js';

const FIXTURES_DIR = resolve(__dirname, '../../fixtures/stripped');

function loadFixture(relativePath: string): string {
  return readFileSync(resolve(FIXTURES_DIR, relativePath), 'utf-8');
}

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

function makeModel(
  patterns: DetectedPattern[],
  projectDir = '/project'
): ProjectModel {
  return {
    projectDir,
    analyzedAt: new Date().toISOString(),
    dependencies: { '@vercel/kv': '^1.0.0' },
    patterns,
    summary: {
      total: patterns.length,
      auto: patterns.filter((p) => p.confidence === 'AUTO').length,
      review: patterns.filter((p) => p.confidence === 'REVIEW').length,
      manual: patterns.filter((p) => p.confidence === 'MANUAL').length,
    },
  };
}

describe('kv-to-d1 integration', () => {
  describe('conversation-log.ts end-to-end', () => {
    it('rewrites @vercel/kv import to ./d1-adapter with d1kv as kv', async () => {
      const fixtureContent = loadFixture('lib/conversation-log.ts');
      const project = createTestProject({
        '/project/lib/conversation-log.ts': fixtureContent,
      });

      const pattern: DetectedPattern = {
        type: 'vercel-kv',
        package: '@vercel/kv',
        operations: ['set', 'get', 'lpush', 'lrange'],
        importStyle: 'named',
        file: '/project/lib/conversation-log.ts',
        line: 3,
        confidence: 'REVIEW',
      };

      const model = makeModel([pattern]);
      const { results } = await applyTransforms(model, {
        dryRun: true,
        transforms: [kvRewriter],
        project,
      });

      const text = project
        .getSourceFileOrThrow('/project/lib/conversation-log.ts')
        .getFullText();

      // Import rewritten
      expect(text).not.toContain('@vercel/kv');
      expect(text).toContain('./d1-adapter');
      expect(text).toContain('d1kv as kv');

      // At least one result applied
      expect(results.some((r) => r.applied)).toBe(true);
    });

    it('preserves all call sites unchanged (kv.set, kv.get, kv.lpush, kv.lrange)', async () => {
      const fixtureContent = loadFixture('lib/conversation-log.ts');
      const project = createTestProject({
        '/project/lib/conversation-log.ts': fixtureContent,
      });

      const pattern: DetectedPattern = {
        type: 'vercel-kv',
        package: '@vercel/kv',
        operations: ['set', 'get', 'lpush', 'lrange'],
        importStyle: 'named',
        file: '/project/lib/conversation-log.ts',
        line: 3,
        confidence: 'REVIEW',
      };

      const model = makeModel([pattern]);
      await applyTransforms(model, {
        dryRun: true,
        transforms: [kvRewriter],
        project,
      });

      const text = project
        .getSourceFileOrThrow('/project/lib/conversation-log.ts')
        .getFullText();

      // Call sites preserved
      expect(text).toContain('kv.set');
      expect(text).toContain('kv.get');
      expect(text).toContain('kv.lpush');
      expect(text).toContain('kv.lrange');
    });

    it('generates lib/d1-adapter.ts in the project', async () => {
      const fixtureContent = loadFixture('lib/conversation-log.ts');
      const project = createTestProject({
        '/project/lib/conversation-log.ts': fixtureContent,
      });

      const pattern: DetectedPattern = {
        type: 'vercel-kv',
        package: '@vercel/kv',
        operations: ['set', 'get', 'lpush', 'lrange'],
        importStyle: 'named',
        file: '/project/lib/conversation-log.ts',
        line: 3,
        confidence: 'REVIEW',
      };

      const model = makeModel([pattern]);
      await applyTransforms(model, {
        dryRun: true,
        transforms: [kvRewriter],
        project,
      });

      const adapterFile = project.getSourceFile('/project/lib/d1-adapter.ts');
      expect(adapterFile).toBeDefined();
      expect(adapterFile!.getFullText()).toContain('d1kv');
      expect(adapterFile!.getFullText()).toContain('getCloudflareContext');
    });

    it('generates migration SQL with BOTH kv_store AND kv_list tables', async () => {
      const fixtureContent = loadFixture('lib/conversation-log.ts');
      const project = createTestProject({
        '/project/lib/conversation-log.ts': fixtureContent,
      });

      const pattern: DetectedPattern = {
        type: 'vercel-kv',
        package: '@vercel/kv',
        operations: ['set', 'get', 'lpush', 'lrange'],
        importStyle: 'named',
        file: '/project/lib/conversation-log.ts',
        line: 3,
        confidence: 'REVIEW',
      };

      const model = makeModel([pattern]);
      await applyTransforms(model, {
        dryRun: true,
        transforms: [kvRewriter],
        project,
      });

      const migrationFile = project.getSourceFile(
        '/project/migrations/0001_kv_schema.sql'
      );
      expect(migrationFile).toBeDefined();
      const sql = migrationFile!.getFullText();
      expect(sql).toContain('kv_store');
      expect(sql).toContain('kv_list');
    });
  });

  describe('rate-limit.ts end-to-end', () => {
    it('rewrites @vercel/kv import to ./d1-adapter with d1kv as kv', async () => {
      const fixtureContent = loadFixture('lib/rate-limit.ts');
      const project = createTestProject({
        '/project/lib/rate-limit.ts': fixtureContent,
      });

      const pattern: DetectedPattern = {
        type: 'vercel-kv',
        package: '@vercel/kv',
        operations: ['get', 'set'],
        importStyle: 'named',
        file: '/project/lib/rate-limit.ts',
        line: 3,
        confidence: 'AUTO',
      };

      const model = makeModel([pattern]);
      const { results } = await applyTransforms(model, {
        dryRun: true,
        transforms: [kvRewriter],
        project,
      });

      const text = project
        .getSourceFileOrThrow('/project/lib/rate-limit.ts')
        .getFullText();

      expect(text).not.toContain('@vercel/kv');
      expect(text).toContain('./d1-adapter');
      expect(text).toContain('d1kv as kv');
      expect(results.some((r) => r.applied)).toBe(true);
    });

    it('preserves call sites unchanged (kv.get, kv.set)', async () => {
      const fixtureContent = loadFixture('lib/rate-limit.ts');
      const project = createTestProject({
        '/project/lib/rate-limit.ts': fixtureContent,
      });

      const pattern: DetectedPattern = {
        type: 'vercel-kv',
        package: '@vercel/kv',
        operations: ['get', 'set'],
        importStyle: 'named',
        file: '/project/lib/rate-limit.ts',
        line: 3,
        confidence: 'AUTO',
      };

      const model = makeModel([pattern]);
      await applyTransforms(model, {
        dryRun: true,
        transforms: [kvRewriter],
        project,
      });

      const text = project
        .getSourceFileOrThrow('/project/lib/rate-limit.ts')
        .getFullText();

      expect(text).toContain('kv.get');
      expect(text).toContain('kv.set');
    });

    it('generates migration SQL with kv_store table ONLY (no kv_list)', async () => {
      const fixtureContent = loadFixture('lib/rate-limit.ts');
      const project = createTestProject({
        '/project/lib/rate-limit.ts': fixtureContent,
      });

      const pattern: DetectedPattern = {
        type: 'vercel-kv',
        package: '@vercel/kv',
        operations: ['get', 'set'],
        importStyle: 'named',
        file: '/project/lib/rate-limit.ts',
        line: 3,
        confidence: 'AUTO',
      };

      const model = makeModel([pattern]);
      await applyTransforms(model, {
        dryRun: true,
        transforms: [kvRewriter],
        project,
      });

      const migrationFile = project.getSourceFile(
        '/project/migrations/0001_kv_schema.sql'
      );
      expect(migrationFile).toBeDefined();
      const sql = migrationFile!.getFullText();
      expect(sql).toContain('kv_store');
      expect(sql).not.toContain('kv_list');
    });
  });

  describe('multi-file transform', () => {
    it('rewrites both imports in same project', async () => {
      const convContent = loadFixture('lib/conversation-log.ts');
      const rateContent = loadFixture('lib/rate-limit.ts');
      const project = createTestProject({
        '/project/lib/conversation-log.ts': convContent,
        '/project/lib/rate-limit.ts': rateContent,
      });

      const patterns: DetectedPattern[] = [
        {
          type: 'vercel-kv',
          package: '@vercel/kv',
          operations: ['get', 'set'],
          importStyle: 'named',
          file: '/project/lib/rate-limit.ts',
          line: 3,
          confidence: 'AUTO',
        },
        {
          type: 'vercel-kv',
          package: '@vercel/kv',
          operations: ['set', 'get', 'lpush', 'lrange'],
          importStyle: 'named',
          file: '/project/lib/conversation-log.ts',
          line: 3,
          confidence: 'REVIEW',
        },
      ];

      const model = makeModel(patterns);
      const { results } = await applyTransforms(model, {
        dryRun: true,
        transforms: [kvRewriter],
        project,
      });

      // Both files should be rewritten
      const convText = project
        .getSourceFileOrThrow('/project/lib/conversation-log.ts')
        .getFullText();
      const rateText = project
        .getSourceFileOrThrow('/project/lib/rate-limit.ts')
        .getFullText();

      expect(convText).not.toContain('@vercel/kv');
      expect(convText).toContain('./d1-adapter');
      expect(rateText).not.toContain('@vercel/kv');
      expect(rateText).toContain('./d1-adapter');

      // Both should have been applied
      const appliedResults = results.filter((r) => r.applied);
      expect(appliedResults).toHaveLength(2);
    });

    it('generates adapter file exactly once (not duplicated)', async () => {
      const convContent = loadFixture('lib/conversation-log.ts');
      const rateContent = loadFixture('lib/rate-limit.ts');
      const project = createTestProject({
        '/project/lib/conversation-log.ts': convContent,
        '/project/lib/rate-limit.ts': rateContent,
      });

      const patterns: DetectedPattern[] = [
        {
          type: 'vercel-kv',
          package: '@vercel/kv',
          operations: ['get', 'set'],
          importStyle: 'named',
          file: '/project/lib/rate-limit.ts',
          line: 3,
          confidence: 'AUTO',
        },
        {
          type: 'vercel-kv',
          package: '@vercel/kv',
          operations: ['set', 'get', 'lpush', 'lrange'],
          importStyle: 'named',
          file: '/project/lib/conversation-log.ts',
          line: 3,
          confidence: 'REVIEW',
        },
      ];

      const model = makeModel(patterns);
      const { results } = await applyTransforms(model, {
        dryRun: true,
        transforms: [kvRewriter],
        project,
      });

      // Adapter should exist (generated once)
      const adapterFile = project.getSourceFile('/project/lib/d1-adapter.ts');
      expect(adapterFile).toBeDefined();

      // Only the first result should have adapter in filesGenerated
      // (second result finds it already exists)
      const allGenerated = results.flatMap((r) => r.filesGenerated);
      const adapterGenerations = allGenerated.filter(
        (f) => f === 'lib/d1-adapter.ts'
      );
      expect(adapterGenerations).toHaveLength(1);
    });

    it('migration includes kv_list from union of all operations', async () => {
      const convContent = loadFixture('lib/conversation-log.ts');
      const rateContent = loadFixture('lib/rate-limit.ts');
      const project = createTestProject({
        '/project/lib/conversation-log.ts': convContent,
        '/project/lib/rate-limit.ts': rateContent,
      });

      // Rate-limit is processed first (only get/set), but conversation-log has lpush/lrange
      const patterns: DetectedPattern[] = [
        {
          type: 'vercel-kv',
          package: '@vercel/kv',
          operations: ['get', 'set'],
          importStyle: 'named',
          file: '/project/lib/rate-limit.ts',
          line: 3,
          confidence: 'AUTO',
        },
        {
          type: 'vercel-kv',
          package: '@vercel/kv',
          operations: ['set', 'get', 'lpush', 'lrange'],
          importStyle: 'named',
          file: '/project/lib/conversation-log.ts',
          line: 3,
          confidence: 'REVIEW',
        },
      ];

      const model = makeModel(patterns);
      await applyTransforms(model, {
        dryRun: true,
        transforms: [kvRewriter],
        project,
      });

      const migrationFile = project.getSourceFile(
        '/project/migrations/0001_kv_schema.sql'
      );
      expect(migrationFile).toBeDefined();
      const sql = migrationFile!.getFullText();

      // Migration should have kv_list because the kvRewriter collects
      // all operations from context.model.patterns (union approach)
      expect(sql).toContain('kv_store');
      expect(sql).toContain('kv_list');
    });
  });
});
