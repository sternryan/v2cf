import { describe, it, expect } from 'vitest';
import path from 'path';
import fs from 'fs';
import { analyze } from '../../src/analyzer/index.js';
import { ProjectModelSchema } from '../../src/schemas/project-model.js';

describe('pipeline integration', () => {
  it('produces valid report for stripped fixtures', async () => {
    const targetDir = path.resolve('tests/fixtures/stripped');
    const result = await analyze(targetDir);

    // Should pass Zod schema validation
    expect(() => ProjectModelSchema.parse(result)).not.toThrow();

    // Should find at least 6 patterns (kv x2, maxDuration, x-forwarded-for, onFinish, fs.readFileSync)
    expect(result.patterns.length).toBeGreaterThanOrEqual(6);

    // Should include all expected pattern types
    const types = result.patterns.map((p) => p.type);
    expect(types).toContain('vercel-kv');
    expect(types).toContain('max-duration');
    expect(types).toContain('ip-header');
    expect(types).toContain('streaming-callback');
    expect(types).toContain('runtime-fs');

    // Summary counts should be consistent
    expect(result.summary.total).toBe(result.patterns.length);
    expect(result.summary.auto + result.summary.review + result.summary.manual).toBe(
      result.summary.total
    );
  });

  it('assigns correct confidence tiers to stripped patterns', async () => {
    const targetDir = path.resolve('tests/fixtures/stripped');
    const result = await analyze(targetDir);

    // maxDuration -> AUTO
    const maxDuration = result.patterns.find((p) => p.type === 'max-duration');
    expect(maxDuration).toBeDefined();
    expect(maxDuration!.confidence).toBe('AUTO');

    // ip-header -> AUTO
    const ipHeader = result.patterns.find((p) => p.type === 'ip-header');
    expect(ipHeader).toBeDefined();
    expect(ipHeader!.confidence).toBe('AUTO');

    // streaming-callback -> REVIEW
    const streamingCallback = result.patterns.find(
      (p) => p.type === 'streaming-callback'
    );
    expect(streamingCallback).toBeDefined();
    expect(streamingCallback!.confidence).toBe('REVIEW');

    // runtime-fs -> MANUAL (variable path in profile-loader.ts)
    const runtimeFs = result.patterns.find((p) => p.type === 'runtime-fs');
    expect(runtimeFs).toBeDefined();
    expect(runtimeFs!.confidence).toBe('MANUAL');

    // vercel-kv from conversation-log.ts -> REVIEW (has lpush/lrange)
    const kvConvLog = result.patterns.find(
      (p) =>
        p.type === 'vercel-kv' && p.file.includes('conversation-log')
    );
    expect(kvConvLog).toBeDefined();
    expect(kvConvLog!.confidence).toBe('REVIEW');

    // vercel-kv from rate-limit.ts -> AUTO (get/set only)
    const kvRateLimit = result.patterns.find(
      (p) => p.type === 'vercel-kv' && p.file.includes('rate-limit')
    );
    expect(kvRateLimit).toBeDefined();
    expect(kvRateLimit!.confidence).toBe('AUTO');
  });

  it('makes no modifications to source files', async () => {
    const targetDir = path.resolve('tests/fixtures/stripped');
    const fixtureFiles = [
      'lib/conversation-log.ts',
      'lib/rate-limit.ts',
      'app/api/chat/route.ts',
      'lib/profile-loader.ts',
      'package.json',
    ];

    // Record file contents before analysis
    const beforeContents = new Map<string, string>();
    for (const file of fixtureFiles) {
      const fullPath = path.join(targetDir, file);
      beforeContents.set(file, fs.readFileSync(fullPath, 'utf-8'));
    }

    // Run analysis
    await analyze(targetDir);

    // Verify no file was modified
    for (const file of fixtureFiles) {
      const fullPath = path.join(targetDir, file);
      const afterContent = fs.readFileSync(fullPath, 'utf-8');
      expect(afterContent).toBe(beforeContents.get(file));
    }
  });

  it('detects edge case import styles', async () => {
    const targetDir = path.resolve('tests/fixtures/edge-cases');
    const result = await analyze(targetDir);

    // Should detect at least 4 patterns (aliased, dynamic, namespace, reexport)
    const kvPatterns = result.patterns.filter((p) => p.type === 'vercel-kv');
    expect(kvPatterns.length).toBeGreaterThanOrEqual(4);

    // All should be vercel-kv type
    for (const p of kvPatterns) {
      expect(p.type).toBe('vercel-kv');
    }
  });

  it('JSON output matches schema after round-trip', async () => {
    const targetDir = path.resolve('tests/fixtures/stripped');
    const result = await analyze(targetDir);

    // JSON round-trip
    const json = JSON.stringify(result);
    const parsed = JSON.parse(json);

    // Should still pass validation after round-trip
    expect(() => ProjectModelSchema.parse(parsed)).not.toThrow();
  });

  it('pipeline output has correct summary counts', async () => {
    const targetDir = path.resolve('tests/fixtures/stripped');
    const result = await analyze(targetDir);

    // Summary should reflect actual pattern confidences
    const auto = result.patterns.filter((p) => p.confidence === 'AUTO').length;
    const review = result.patterns.filter((p) => p.confidence === 'REVIEW').length;
    const manual = result.patterns.filter((p) => p.confidence === 'MANUAL').length;

    expect(result.summary.auto).toBe(auto);
    expect(result.summary.review).toBe(review);
    expect(result.summary.manual).toBe(manual);
    expect(result.summary.total).toBe(auto + review + manual);
  });

  it('every pattern has a valid confidence tier', async () => {
    const targetDir = path.resolve('tests/fixtures/stripped');
    const result = await analyze(targetDir);

    const validTiers = ['AUTO', 'REVIEW', 'MANUAL'];
    for (const pattern of result.patterns) {
      expect(validTiers).toContain(pattern.confidence);
    }
  });
});
