import { describe, it, expect } from 'vitest';
import {
  Project,
  ScriptTarget,
  ModuleKind,
  ModuleResolutionKind,
  ts,
} from 'ts-morph';
import { imageLoaderGen, generateImageLoader } from '../../src/transformer/transforms/image-loader-gen.js';
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

function makeContext(project: Project, opts: Partial<TransformContext> = {}): TransformContext {
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
    ...opts,
  };
}

describe('image-loader-gen', () => {
  describe('generateImageLoader', () => {
    it('generates image-loader.ts file content with cloudflareLoader function', () => {
      const project = createTestProject({
        '/test/next.config.ts': `const nextConfig = {};\nexport default nextConfig;\n`,
      });
      const context = makeContext(project);

      const result = generateImageLoader(context);

      expect(result.applied).toBe(true);
      expect(result.filesGenerated).toContain('image-loader.ts');

      // Check the generated file exists in the project
      const loaderFile = project.getSourceFile('/test/image-loader.ts');
      expect(loaderFile).toBeDefined();

      const content = loaderFile!.getFullText();
      expect(content).toContain('cloudflareLoader');
      expect(content).toContain('normalizeSrc');
      expect(content).toContain('/cdn-cgi/image/');
      expect(content).toContain('ImageLoaderProps');
    });

    it('generates development fallback in the loader', () => {
      const project = createTestProject({
        '/test/next.config.ts': `const nextConfig = {};\nexport default nextConfig;\n`,
      });
      const context = makeContext(project);

      const result = generateImageLoader(context);

      const loaderFile = project.getSourceFile('/test/image-loader.ts');
      expect(loaderFile).toBeDefined();

      const content = loaderFile!.getFullText();
      expect(content).toContain('development');
      expect(content).toContain('process.env.NODE_ENV');
    });

    it('updates next.config.ts to add images.loader and images.loaderFile', () => {
      const project = createTestProject({
        '/test/next.config.ts': `const nextConfig = {};\nexport default nextConfig;\n`,
      });
      const context = makeContext(project);

      generateImageLoader(context);

      const configFile = project.getSourceFileOrThrow('/test/next.config.ts');
      const text = configFile.getFullText();
      expect(text).toContain('loader');
      expect(text).toContain('loaderFile');
      expect(text).toContain('image-loader.ts');
    });

    it('is idempotent -- does not regenerate if image-loader.ts already exists', () => {
      const project = createTestProject({
        '/test/next.config.ts': `const nextConfig = { images: { loader: 'custom', loaderFile: './image-loader.ts' } };\nexport default nextConfig;\n`,
        '/test/image-loader.ts': `export default function cloudflareLoader() { return ''; }\n`,
      });
      const context = makeContext(project);

      const result = generateImageLoader(context);

      expect(result.applied).toBe(false);
      expect(result.changes).toHaveLength(0);
    });

    it('handles next.config.ts with default export object pattern', () => {
      const project = createTestProject({
        '/test/next.config.ts': `export default {\n  reactStrictMode: true,\n};\n`,
      });
      const context = makeContext(project);

      generateImageLoader(context);

      const configFile = project.getSourceFileOrThrow('/test/next.config.ts');
      const text = configFile.getFullText();
      expect(text).toContain('loader');
      expect(text).toContain('loaderFile');
      expect(text).toContain('image-loader.ts');
    });

    it('result includes image-loader.ts in filesGenerated', () => {
      const project = createTestProject({
        '/test/next.config.ts': `const nextConfig = {};\nexport default nextConfig;\n`,
      });
      const context = makeContext(project);

      const result = generateImageLoader(context);

      expect(result.ruleId).toBe('image-loader-gen');
      expect(result.filesGenerated).toContain('image-loader.ts');
    });

    it('works in dryRun mode -- describes changes without writing', () => {
      const project = createTestProject({
        '/test/next.config.ts': `const nextConfig = {};\nexport default nextConfig;\n`,
      });
      const context = makeContext(project, { dryRun: true });

      const result = generateImageLoader(context);

      expect(result.applied).toBe(true);
      expect(result.filesGenerated).toContain('image-loader.ts');
      // In dryRun, the file should NOT be created in the project
      const loaderFile = project.getSourceFile('/test/image-loader.ts');
      expect(loaderFile).toBeUndefined();
    });
  });
});
