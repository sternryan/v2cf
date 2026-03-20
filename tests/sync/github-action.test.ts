import { describe, it, expect } from 'vitest';
import { generateSyncWorkflow } from '../../src/sync/github-action-gen.js';

describe('generateSyncWorkflow', () => {
  const yaml = generateSyncWorkflow({ workerName: 'my-test-worker' });

  it('returns a string of valid YAML', () => {
    expect(typeof yaml).toBe('string');
    expect(yaml.length).toBeGreaterThan(50);
  });

  it('triggers on repository_dispatch with v2cf-sync type', () => {
    expect(yaml).toContain('repository_dispatch');
    expect(yaml).toContain('v2cf-sync');
  });

  it('triggers on push to main branch as fallback', () => {
    expect(yaml).toContain('push');
    expect(yaml).toContain('main');
  });

  it('uses Node.js 22', () => {
    expect(yaml).toContain('22');
    expect(yaml).toContain('node-version');
  });

  it('installs v2cf and runs v2cf deploy', () => {
    expect(yaml).toContain('v2cf');
    expect(yaml).toContain('deploy');
  });

  it('requires CLOUDFLARE_API_TOKEN secret', () => {
    expect(yaml).toContain('CLOUDFLARE_API_TOKEN');
    expect(yaml).toContain('secrets.');
  });

  it('names the workflow v2cf-sync', () => {
    expect(yaml).toContain('name: v2cf-sync');
  });

  it('includes the worker name in deploy command', () => {
    expect(yaml).toContain('my-test-worker');
  });

  it('has a sync job with checkout and setup-node steps', () => {
    expect(yaml).toContain('sync:');
    expect(yaml).toContain('actions/checkout');
    expect(yaml).toContain('actions/setup-node');
  });
});
