import { describe, it, expect } from 'vitest';
import { generatePackageScriptUpdates } from '../../src/orchestrator/config-gen/package-scripts.js';

describe('generatePackageScriptUpdates', () => {
  it('returns scripts object with preview key', () => {
    const { scripts } = generatePackageScriptUpdates();
    expect(scripts.preview).toContain('opennextjs-cloudflare');
  });

  it('returns scripts object with deploy key', () => {
    const { scripts } = generatePackageScriptUpdates();
    expect(scripts.deploy).toContain('opennextjs-cloudflare');
  });

  it('returns scripts object with cf-typegen key using wrangler', () => {
    const { scripts } = generatePackageScriptUpdates();
    expect(scripts['cf-typegen']).toContain('wrangler');
  });

  it('returns devDependencies with @opennextjs/cloudflare', () => {
    const { devDependencies } = generatePackageScriptUpdates();
    expect(devDependencies['@opennextjs/cloudflare']).toBeDefined();
  });

  it('returns devDependencies with wrangler', () => {
    const { devDependencies } = generatePackageScriptUpdates();
    expect(devDependencies.wrangler).toBeDefined();
  });

  it('preview script includes both build and preview steps', () => {
    const { scripts } = generatePackageScriptUpdates();
    expect(scripts.preview).toBe(
      'opennextjs-cloudflare build && opennextjs-cloudflare preview'
    );
  });

  it('deploy script includes both build and deploy steps', () => {
    const { scripts } = generatePackageScriptUpdates();
    expect(scripts.deploy).toBe(
      'opennextjs-cloudflare build && opennextjs-cloudflare deploy'
    );
  });
});
