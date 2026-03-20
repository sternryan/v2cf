import { z } from 'zod';

export const NetworkEventSchema = z.object({
  timestamp: z.number(),
  method: z.string(),
  url: z.string(),
  requestBody: z.string().nullable(),
  requestHeaders: z.record(z.string(), z.string()).optional(),
  status: z.number(),
  responseHeaders: z.record(z.string(), z.string()),
  responseBody: z.string(),
  duration: z.number(),
  isLlmEndpoint: z.boolean(),
});
export type NetworkEvent = z.infer<typeof NetworkEventSchema>;

export const CaptureSessionSchema = z.object({
  sessionId: z.string(),
  captureVersion: z.literal(1),
  startTime: z.number(),
  endTime: z.number(),
  sourceUrl: z.string(),
  rrwebEvents: z.array(z.any()), // rrweb event structure is complex, validate loosely
  networkEvents: z.array(NetworkEventSchema),
  metadata: z.object({
    userAgent: z.string(),
    viewport: z.object({ width: z.number(), height: z.number() }),
    recordingDuration: z.number(),
  }),
});
export type CaptureSession = z.infer<typeof CaptureSessionSchema>;

export interface RecorderOptions {
  sessionId: string;
  sampleMouseMove?: number; // ms between mouse move samples (default: 50)
  maxDuration?: number; // max recording duration ms (default: 300000 = 5min)
  captureNetworkPatterns?: string[]; // URL patterns to capture (default: ['/api/'])
  collectionEndpoint?: string; // local server endpoint for session data egress
}
