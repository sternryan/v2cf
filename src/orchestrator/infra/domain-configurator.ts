/**
 * Custom domain configuration via Cloudflare REST API.
 *
 * Requires CLOUDFLARE_API_TOKEN env var (wrangler OAuth does not cover
 * the Workers Domains API). If not set, domain config is skipped gracefully
 * and the user gets a workers.dev URL instead.
 */

function getApiToken(): string | null {
  return process.env.CLOUDFLARE_API_TOKEN || null;
}

async function cfApiFetch(
  path: string,
  token: string,
  options?: RequestInit
): Promise<unknown> {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  const json = (await res.json()) as { success: boolean; errors: Array<{ message: string }>; result: unknown };
  if (!json.success) {
    const msg = json.errors?.map((e) => e.message).join(', ') || 'Unknown error';
    throw new Error(`Cloudflare API error: ${msg}`);
  }
  return json.result;
}

export async function resolveZone(
  accountId: string,
  hostname: string
): Promise<{ zoneId: string; zoneName: string }> {
  const token = getApiToken();
  if (!token) {
    throw new Error(
      'CLOUDFLARE_API_TOKEN is required for custom domain configuration.\n' +
        'Set it in your environment, or omit --subdomain to deploy to workers.dev only.'
    );
  }

  const parts = hostname.split('.');
  const rootDomain = parts.slice(-2).join('.');

  const result = (await cfApiFetch(
    `/zones?name=${encodeURIComponent(rootDomain)}`,
    token
  )) as Array<{ id: string; name: string }>;

  if (!result || result.length === 0) {
    throw new Error(
      `Domain "${rootDomain}" is not on this Cloudflare account. Add it to Cloudflare DNS first.`
    );
  }

  return { zoneId: result[0].id, zoneName: result[0].name };
}

export async function configureDomain(
  accountId: string,
  hostname: string,
  workerName: string,
  zoneId: string,
  zoneName: string
): Promise<void> {
  const token = getApiToken();
  if (!token) {
    throw new Error(
      'CLOUDFLARE_API_TOKEN is required for custom domain configuration.'
    );
  }

  await cfApiFetch(
    `/accounts/${accountId}/workers/domains`,
    token,
    {
      method: 'PUT',
      body: JSON.stringify({
        hostname,
        service: workerName,
        environment: 'production',
        zone_id: zoneId,
        zone_name: zoneName,
      }),
    }
  );
}

/** Check if custom domain configuration is available (API token set). */
export function isDomainConfigAvailable(): boolean {
  return getApiToken() !== null;
}
