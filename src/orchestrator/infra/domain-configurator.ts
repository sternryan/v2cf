import type Cloudflare from 'cloudflare';

export async function resolveZone(
  client: Cloudflare,
  accountId: string,
  hostname: string
): Promise<{ zoneId: string; zoneName: string }> {
  // Extract root domain from hostname (e.g. 'cf.quartermint.com' -> 'quartermint.com')
  const parts = hostname.split('.');
  const rootDomain = parts.slice(-2).join('.');

  const zones = await client.zones.list({ name: rootDomain });
  for await (const zone of zones) {
    return { zoneId: zone.id!, zoneName: zone.name! };
  }

  throw new Error(
    `Domain "${rootDomain}" is not on this Cloudflare account. Add it to Cloudflare DNS first.`
  );
}

export async function configureDomain(
  client: Cloudflare,
  accountId: string,
  hostname: string,
  workerName: string,
  zoneId: string,
  zoneName: string
): Promise<void> {
  await client.workers.domains.update({
    account_id: accountId,
    hostname,
    service: workerName,
    environment: 'production',
    zone_id: zoneId,
    zone_name: zoneName,
  });
}
