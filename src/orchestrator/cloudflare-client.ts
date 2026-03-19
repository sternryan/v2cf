import Cloudflare from 'cloudflare';

let client: Cloudflare | null = null;

export function getCloudflareClient(): Cloudflare {
  if (client) return client;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) {
    throw new Error(
      'CLOUDFLARE_API_TOKEN is not set.\n' +
        'Create an API token at https://dash.cloudflare.com/profile/api-tokens\n' +
        'Required permissions: Workers Scripts (Edit), D1 (Edit), DNS (Edit), Zone (Read)'
    );
  }
  client = new Cloudflare({ apiToken: token });
  return client;
}

export async function getAccountId(cfClient: Cloudflare): Promise<string> {
  const accounts = await cfClient.accounts.list();
  for await (const account of accounts) {
    return account.id;
  }
  throw new Error(
    'No Cloudflare accounts found for this API token.'
  );
}

export function resetClient(): void {
  client = null;
}
