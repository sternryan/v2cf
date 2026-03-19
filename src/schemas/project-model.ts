import { z } from 'zod';

export const ConfidenceTier = z.enum(['AUTO', 'REVIEW', 'MANUAL']);
export type ConfidenceTier = z.infer<typeof ConfidenceTier>;

const BasePattern = z.object({
  file: z.string(),
  line: z.number(),
  confidence: ConfidenceTier,
});

export const DetectedPatternSchema = z.discriminatedUnion('type', [
  BasePattern.extend({
    type: z.literal('vercel-kv'),
    package: z.literal('@vercel/kv'),
    operations: z.array(z.string()),
    importStyle: z.enum(['named', 'aliased', 'namespace', 'dynamic', 'reexport']),
  }),
  BasePattern.extend({
    type: z.literal('max-duration'),
    value: z.number(),
  }),
  BasePattern.extend({
    type: z.literal('edge-runtime'),
    runtime: z.string(),
  }),
  BasePattern.extend({
    type: z.literal('runtime-fs'),
    method: z.string(),
    pathExpression: z.string(),
    isStaticPath: z.boolean(),
  }),
  BasePattern.extend({
    type: z.literal('ip-header'),
    headerName: z.string(),
  }),
  BasePattern.extend({
    type: z.literal('streaming-callback'),
    callbackName: z.string(),
  }),
  BasePattern.extend({
    type: z.literal('vercel-analytics'),
    package: z.string(),
  }),
  BasePattern.extend({
    type: z.literal('vercel-og'),
    package: z.literal('@vercel/og'),
  }),
]);

export type DetectedPattern = z.infer<typeof DetectedPatternSchema>;

export const ProjectModelSchema = z.object({
  projectDir: z.string(),
  analyzedAt: z.string(),
  dependencies: z.record(z.string(), z.string()),
  patterns: z.array(DetectedPatternSchema),
  summary: z.object({
    total: z.number(),
    auto: z.number(),
    review: z.number(),
    manual: z.number(),
  }),
});

export type ProjectModel = z.infer<typeof ProjectModelSchema>;
