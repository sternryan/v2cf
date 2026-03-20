import type { Divergence } from '../types.js';

/**
 * Headers that are expected to differ between Vercel and Cloudflare platforms.
 * These are platform-specific metadata headers, not meaningful behavioral differences.
 */
export const IGNORED_HEADERS = new Set([
  'x-vercel-cache',
  'x-vercel-id',
  'x-vercel-proxy-signature',
  'x-vercel-proxy-signature-ts',
  'cf-ray',
  'cf-cache-status',
  'cf-connecting-ip',
  'server',
  'x-powered-by',
  'age',
  'x-cache',
  'set-cookie',
  'x-matched-path',
  'x-nextjs-cache',
  'x-nextjs-matched-path',
  'alt-svc',
  'report-to',
  'nel',
]);

/**
 * Response body patterns that are expected to differ between platforms
 * (timestamps, UUIDs, asset hashes, nonce attributes).
 */
export const IGNORED_BODY_PATTERNS: RegExp[] = [
  /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/, // ISO timestamps
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, // UUIDs
  /_next\/static\/chunks\/[a-zA-Z0-9]+\.js/, // Next.js asset hashes
  /nonce="[^"]+"/, // CSP nonce attributes
];

/**
 * Check if a response header should be ignored during comparison.
 * Case-insensitive matching against the IGNORED_HEADERS set.
 */
export function shouldIgnoreHeader(name: string): boolean {
  return IGNORED_HEADERS.has(name.toLowerCase());
}

/**
 * Check if a divergence should be ignored based on ignore rules.
 *
 * A divergence is ignored if:
 * 1. Its type is 'api' and its path matches an ignored header name
 * 2. Its description matches any of the IGNORED_BODY_PATTERNS
 */
export function shouldIgnoreDivergence(divergence: Divergence): boolean {
  // Check if the divergence path is an ignored header
  if (
    divergence.type === 'api' &&
    divergence.path &&
    IGNORED_HEADERS.has(divergence.path.toLowerCase())
  ) {
    return true;
  }

  // Check if the description matches any ignored body pattern
  for (const pattern of IGNORED_BODY_PATTERNS) {
    if (pattern.test(divergence.description)) {
      return true;
    }
  }

  return false;
}

/**
 * Exported for test access to the underlying rule sets.
 */
export const defaultIgnoreRules = {
  IGNORED_HEADERS,
  IGNORED_BODY_PATTERNS,
};
