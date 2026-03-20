import type { WebhookCreateResponse } from './types.js';

export interface RegisterWebhookOptions {
  projectId?: string;
  teamId?: string;
}

/**
 * Register a Vercel deployment webhook via REST API.
 * Requires a Vercel Pro or Enterprise plan.
 */
export async function registerVercelWebhook(
  vercelToken: string,
  endpointUrl: string,
  opts?: RegisterWebhookOptions
): Promise<WebhookCreateResponse> {
  const params = new URLSearchParams();
  if (opts?.teamId) params.set('teamId', opts.teamId);

  const body: Record<string, unknown> = {
    url: endpointUrl,
    events: ['deployment.succeeded'],
  };
  if (opts?.projectId) {
    body.projectIds = [opts.projectId];
  }

  const queryString = params.toString();
  const url = `https://api.vercel.com/v1/webhooks${queryString ? `?${queryString}` : ''}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${vercelToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    if (res.status === 403) {
      throw new Error(
        'Vercel webhook creation failed: Pro or Enterprise plan required. ' +
          'Your Cloudflare deployment is live -- trigger rebuilds manually with `v2cf deploy`.'
      );
    }
    throw new Error(`Vercel webhook creation failed: ${errBody}`);
  }

  return res.json() as Promise<WebhookCreateResponse>;
}

/**
 * Delete a Vercel webhook by ID.
 */
export async function deleteVercelWebhook(
  vercelToken: string,
  webhookId: string,
  teamId?: string
): Promise<void> {
  const params = new URLSearchParams();
  if (teamId) params.set('teamId', teamId);

  const queryString = params.toString();
  const url = `https://api.vercel.com/v1/webhooks/${webhookId}${queryString ? `?${queryString}` : ''}`;

  const res = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${vercelToken}`,
    },
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(
      `Vercel webhook deletion failed: ${res.status} ${errBody}`
    );
  }
}
