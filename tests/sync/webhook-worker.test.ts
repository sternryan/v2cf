import { describe, it, expect } from 'vitest';
import { generateWebhookWorkerSource } from '../../src/sync/webhook-worker-template.js';

describe('generateWebhookWorkerSource', () => {
  const source = generateWebhookWorkerSource({
    accountId: 'acc_test123',
    workerName: 'my-test-worker',
  });

  it('returns a string of valid TypeScript Worker code', () => {
    expect(typeof source).toBe('string');
    expect(source.length).toBeGreaterThan(100);
  });

  it('contains HMAC-SHA1 signature verification using crypto.subtle', () => {
    expect(source).toContain('crypto.subtle');
    expect(source).toContain('HMAC');
    expect(source).toContain('SHA-1');
  });

  it('reads x-vercel-signature header', () => {
    expect(source).toContain('x-vercel-signature');
  });

  it('checks event.type === deployment.succeeded and skips other events', () => {
    expect(source).toContain('deployment.succeeded');
    expect(source).toContain('skipped');
  });

  it('returns 405 for non-POST requests', () => {
    expect(source).toContain('405');
    expect(source).toContain('POST');
  });

  it('returns 403 for invalid signatures', () => {
    expect(source).toContain('403');
  });

  it('triggers rebuild via GitHub repository_dispatch', () => {
    expect(source).toContain('repos/');
    expect(source).toContain('dispatches');
    expect(source).toContain('v2cf-sync');
  });

  it('exports a default fetch handler', () => {
    expect(source).toContain('export default');
    expect(source).toContain('fetch(request');
  });

  it('defines Env interface with required secrets', () => {
    expect(source).toContain('VERCEL_WEBHOOK_SECRET');
    expect(source).toContain('CLOUDFLARE_API_TOKEN');
    expect(source).toContain('GITHUB_TOKEN');
    expect(source).toContain('GITHUB_REPO');
  });

  it('includes basic deduplication with in-memory Map', () => {
    expect(source).toContain('Map');
    expect(source).toContain('60');
  });
});
