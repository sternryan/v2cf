import { describe, it, expect } from 'vitest';
import {
  DetectedPatternSchema,
  ProjectModelSchema,
} from '../../src/schemas/project-model.js';
import { assignConfidence } from '../../src/schemas/confidence.js';

describe('DetectedPatternSchema', () => {
  it('validates a vercel-kv pattern with confidence REVIEW', () => {
    const pattern = {
      type: 'vercel-kv',
      file: 'lib/conversation-log.ts',
      line: 3,
      confidence: 'REVIEW',
      package: '@vercel/kv',
      operations: ['set', 'get', 'lpush', 'lrange'],
      importStyle: 'named',
    };
    const result = DetectedPatternSchema.safeParse(pattern);
    expect(result.success).toBe(true);
  });

  it('validates a max-duration pattern with confidence AUTO', () => {
    const pattern = {
      type: 'max-duration',
      file: 'app/api/chat/route.ts',
      line: 15,
      confidence: 'AUTO',
      value: 30,
    };
    const result = DetectedPatternSchema.safeParse(pattern);
    expect(result.success).toBe(true);
  });

  it('validates a runtime-fs pattern with isStaticPath: true', () => {
    const pattern = {
      type: 'runtime-fs',
      file: 'lib/profile-loader.ts',
      line: 16,
      confidence: 'REVIEW',
      method: 'readFileSync',
      pathExpression: 'filePath',
      isStaticPath: true,
    };
    const result = DetectedPatternSchema.safeParse(pattern);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isStaticPath).toBe(true);
    }
  });

  it('validates an ip-header pattern', () => {
    const pattern = {
      type: 'ip-header',
      file: 'app/api/chat/route.ts',
      line: 21,
      confidence: 'AUTO',
      headerName: 'x-forwarded-for',
    };
    const result = DetectedPatternSchema.safeParse(pattern);
    expect(result.success).toBe(true);
  });

  it('validates a streaming-callback pattern', () => {
    const pattern = {
      type: 'streaming-callback',
      file: 'app/api/chat/route.ts',
      line: 56,
      confidence: 'REVIEW',
      callbackName: 'onFinish',
    };
    const result = DetectedPatternSchema.safeParse(pattern);
    expect(result.success).toBe(true);
  });

  it('validates a vercel-analytics pattern', () => {
    const pattern = {
      type: 'vercel-analytics',
      file: 'app/layout.tsx',
      line: 5,
      confidence: 'AUTO',
      package: '@vercel/analytics',
    };
    const result = DetectedPatternSchema.safeParse(pattern);
    expect(result.success).toBe(true);
  });

  it('rejects a pattern with missing type field', () => {
    const pattern = {
      file: 'lib/test.ts',
      line: 1,
      confidence: 'AUTO',
    };
    const result = DetectedPatternSchema.safeParse(pattern);
    expect(result.success).toBe(false);
  });

  it('rejects a pattern with invalid confidence value "MAYBE"', () => {
    const pattern = {
      type: 'max-duration',
      file: 'app/api/chat/route.ts',
      line: 15,
      confidence: 'MAYBE',
      value: 30,
    };
    const result = DetectedPatternSchema.safeParse(pattern);
    expect(result.success).toBe(false);
  });

  it('validates a complete ProjectModel with patterns array and metadata', () => {
    const model = {
      projectDir: '/home/user/my-next-app',
      analyzedAt: '2026-03-19T07:00:00Z',
      dependencies: { '@vercel/kv': '^3.0.0', next: '14.2.35' },
      patterns: [
        {
          type: 'max-duration',
          file: 'app/api/chat/route.ts',
          line: 15,
          confidence: 'AUTO',
          value: 30,
        },
      ],
      summary: { total: 1, auto: 1, review: 0, manual: 0 },
    };
    const result = ProjectModelSchema.safeParse(model);
    expect(result.success).toBe(true);
  });
});

describe('assignConfidence', () => {
  it('returns AUTO for max-duration type', () => {
    expect(assignConfidence('max-duration', {})).toBe('AUTO');
  });

  it('returns REVIEW for vercel-kv with lpush operations', () => {
    expect(
      assignConfidence('vercel-kv', { operations: ['get', 'set', 'lpush'] })
    ).toBe('REVIEW');
  });

  it('returns AUTO for vercel-kv with only get/set operations', () => {
    expect(
      assignConfidence('vercel-kv', { operations: ['get', 'set'] })
    ).toBe('AUTO');
  });

  it('returns MANUAL for runtime-fs with dynamic path', () => {
    expect(
      assignConfidence('runtime-fs', { isStaticPath: false })
    ).toBe('MANUAL');
  });

  it('returns REVIEW for runtime-fs with static path', () => {
    expect(
      assignConfidence('runtime-fs', { isStaticPath: true })
    ).toBe('REVIEW');
  });
});
