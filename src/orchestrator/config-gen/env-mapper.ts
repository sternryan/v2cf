export const VERCEL_ONLY_VARS = [
  'KV_URL',
  'KV_REST_API_URL',
  'KV_REST_API_TOKEN',
  'KV_REST_API_READ_ONLY_TOKEN',
  'VERCEL',
  'VERCEL_ENV',
  'VERCEL_URL',
  'VERCEL_REGION',
  'VERCEL_GIT_COMMIT_SHA',
  'VERCEL_GIT_COMMIT_REF',
];

export const VERCEL_ONLY_PREFIXES = ['KV_', 'VERCEL_'];

const PLACEHOLDER_PATTERNS = [/^sk-ant-\.\.\.$/];

export function mapEnvToSecrets(envContent: string): {
  secrets: Record<string, string>;
  plainVars: Record<string, string>;
  skipped: string[];
} {
  const secrets: Record<string, string> = {};
  const plainVars: Record<string, string> = {};
  const skipped: string[] = [];

  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Split on first =
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;

    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();

    // Strip surrounding quotes (single or double)
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // Skip Vercel-only vars (exact match or prefix match)
    if (
      VERCEL_ONLY_VARS.includes(key) ||
      VERCEL_ONLY_PREFIXES.some((p) => key.startsWith(p))
    ) {
      skipped.push(key);
      continue;
    }

    // Skip empty values and placeholder values
    if (!value || PLACEHOLDER_PATTERNS.some((p) => p.test(value))) {
      skipped.push(key);
      continue;
    }

    // NEXT_PUBLIC_* vars are plain vars (go in wrangler.jsonc vars, not secrets)
    if (key.startsWith('NEXT_PUBLIC_')) {
      plainVars[key] = value;
      continue;
    }

    // Everything else is a secret
    secrets[key] = value;
  }

  return { secrets, plainVars, skipped };
}
