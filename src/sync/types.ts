import { z } from 'zod';

// Vercel webhook creation response
export interface WebhookCreateResponse {
  id: string;
  secret: string;
  url: string;
  events: string[];
  ownerId: string;
  projectIds?: string[];
  createdAt: number;
  updatedAt: number;
}

// Sync state persisted to .v2cf/sync.json
export const SyncStateSchema = z.object({
  enabled: z.boolean(),
  vercelWebhookId: z.string(),
  vercelWebhookSecret: z.string(),
  webhookWorkerUrl: z.string(),
  webhookWorkerName: z.string(),
  vercelProjectId: z.string().optional(),
  vercelTeamId: z.string().optional(),
  rebuildMethod: z.enum(['worker', 'github-action']),
  lastSync: z
    .object({
      timestamp: z.string(),
      success: z.boolean(),
      deploymentId: z.string().optional(),
      error: z.string().optional(),
    })
    .optional(),
  createdAt: z.string(),
});

export type SyncState = z.infer<typeof SyncStateSchema>;

// Options for sync enable
export interface SyncEnableOptions {
  projectDir: string;
  workerName: string;
  accountId: string;
  vercelProjectId?: string;
  vercelTeamId?: string;
}

// Result from sync enable
export interface SyncEnableResult {
  webhookWorkerUrl: string;
  vercelWebhookId: string;
  rebuildMethod: 'worker' | 'github-action';
}

// Sync config for webhook registration
export interface SyncConfig {
  vercelToken: string;
  endpointUrl: string;
  projectId?: string;
  teamId?: string;
}
