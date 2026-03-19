import { describe, it, expect } from 'vitest';
import {
  Project,
  ScriptTarget,
  ModuleKind,
  ModuleResolutionKind,
  ts,
} from 'ts-morph';
import { streamingWrapper } from '../../src/transformer/transforms/streaming-wrapper.js';
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

describe('streaming-wrapper', () => {
  it('wraps onFinish callback body with ctx.waitUntil(IIFE) pattern', () => {
    const project = createTestProject({
      '/test/route.ts': `import { streamText } from 'ai';

const convId = 'test-123';
const result = await streamText({
  model: anthropic('claude-sonnet-4-6'),
  messages,
  onFinish: async ({ text }) => {
    await appendMessage(convId, { role: 'assistant', content: text });
  },
});
`,
    });
    const sourceFile = project.getSourceFileOrThrow('/test/route.ts');
    const context = makeContext(project);

    const pattern: DetectedPattern = {
      type: 'streaming-callback',
      callbackName: 'onFinish',
      file: '/test/route.ts',
      line: 8,
      confidence: 'REVIEW',
    };

    const result = streamingWrapper.transform(sourceFile, pattern, context);

    const text = sourceFile.getFullText();
    expect(text).toContain('getCloudflareContext');
    expect(text).toContain('ctx.waitUntil');
    expect(text).toContain('appendMessage');
    expect(result.applied).toBe(true);
    expect(result.ruleId).toBe('streaming-wrapper');
  });

  it('adds import for getCloudflareContext from @opennextjs/cloudflare', () => {
    const project = createTestProject({
      '/test/route.ts': `import { streamText } from 'ai';

const result = await streamText({
  model: anthropic('claude-sonnet-4-6'),
  messages,
  onFinish: async ({ text }) => {
    await saveMessage(text);
  },
});
`,
    });
    const sourceFile = project.getSourceFileOrThrow('/test/route.ts');
    const context = makeContext(project);

    const pattern: DetectedPattern = {
      type: 'streaming-callback',
      callbackName: 'onFinish',
      file: '/test/route.ts',
      line: 7,
      confidence: 'REVIEW',
    };

    streamingWrapper.transform(sourceFile, pattern, context);

    const text = sourceFile.getFullText();
    expect(text).toContain("import { getCloudflareContext }");
    expect(text).toContain("@opennextjs/cloudflare");
  });

  it('does NOT destructure waitUntil from ctx (avoids Illegal invocation)', () => {
    const project = createTestProject({
      '/test/route.ts': `import { streamText } from 'ai';

const result = await streamText({
  model: anthropic('claude-sonnet-4-6'),
  messages,
  onFinish: async ({ text }) => {
    await saveMessage(text);
  },
});
`,
    });
    const sourceFile = project.getSourceFileOrThrow('/test/route.ts');
    const context = makeContext(project);

    const pattern: DetectedPattern = {
      type: 'streaming-callback',
      callbackName: 'onFinish',
      file: '/test/route.ts',
      line: 7,
      confidence: 'REVIEW',
    };

    streamingWrapper.transform(sourceFile, pattern, context);

    const text = sourceFile.getFullText();
    // Must use ctx.waitUntil() as method call, NOT destructured
    expect(text).toContain('ctx.waitUntil');
    expect(text).not.toMatch(/const\s*\{\s*waitUntil\s*\}/);
  });

  it('preserves closure variable access (convId accessible inside wrapped body)', () => {
    const project = createTestProject({
      '/test/route.ts': `import { streamText } from 'ai';

const convId = 'test-123';
const result = await streamText({
  model: anthropic('claude-sonnet-4-6'),
  messages,
  onFinish: async ({ text }) => {
    await appendMessage(convId, { role: 'assistant', content: text });
  },
});
`,
    });
    const sourceFile = project.getSourceFileOrThrow('/test/route.ts');
    const context = makeContext(project);

    const pattern: DetectedPattern = {
      type: 'streaming-callback',
      callbackName: 'onFinish',
      file: '/test/route.ts',
      line: 8,
      confidence: 'REVIEW',
    };

    streamingWrapper.transform(sourceFile, pattern, context);

    const text = sourceFile.getFullText();
    // convId must still be referenced inside the wrapped body
    expect(text).toContain('convId');
    // The original call must be preserved inside the IIFE
    expect(text).toContain('appendMessage(convId');
  });

  it('is idempotent -- if getCloudflareContext already imported and body wrapped, no-op', () => {
    const project = createTestProject({
      '/test/route.ts': `import { streamText } from 'ai';
import { getCloudflareContext } from '@opennextjs/cloudflare';

const result = await streamText({
  model: anthropic('claude-sonnet-4-6'),
  messages,
  onFinish: async ({ text }) => {
    const { ctx } = getCloudflareContext();
    ctx.waitUntil((async () => {
      await saveMessage(text);
    })());
  },
});
`,
    });
    const sourceFile = project.getSourceFileOrThrow('/test/route.ts');
    const context = makeContext(project);

    const pattern: DetectedPattern = {
      type: 'streaming-callback',
      callbackName: 'onFinish',
      file: '/test/route.ts',
      line: 8,
      confidence: 'REVIEW',
    };

    const result = streamingWrapper.transform(sourceFile, pattern, context);

    expect(result.applied).toBe(false);
    expect(result.changes).toHaveLength(0);
  });

  it('handles regular function expression callbacks', () => {
    const project = createTestProject({
      '/test/route.ts': `import { streamText } from 'ai';

const result = await streamText({
  model: anthropic('claude-sonnet-4-6'),
  messages,
  onFinish: async function({ text }) {
    await saveMessage(text);
  },
});
`,
    });
    const sourceFile = project.getSourceFileOrThrow('/test/route.ts');
    const context = makeContext(project);

    const pattern: DetectedPattern = {
      type: 'streaming-callback',
      callbackName: 'onFinish',
      file: '/test/route.ts',
      line: 7,
      confidence: 'REVIEW',
    };

    const result = streamingWrapper.transform(sourceFile, pattern, context);

    const text = sourceFile.getFullText();
    expect(text).toContain('getCloudflareContext');
    expect(text).toContain('ctx.waitUntil');
    expect(result.applied).toBe(true);
  });
});
