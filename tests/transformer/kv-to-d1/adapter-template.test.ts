import { describe, it, expect } from 'vitest';
import { getAdapterTemplate } from '../../../src/transformer/transforms/kv-to-d1/adapter-template.js';

describe('adapter-template', () => {
  const template = getAdapterTemplate();

  it('returns a non-empty string', () => {
    expect(typeof template).toBe('string');
    expect(template.length).toBeGreaterThan(0);
  });

  it('contains import { getCloudflareContext } from @opennextjs/cloudflare', () => {
    expect(template).toContain('import { getCloudflareContext }');
    expect(template).toContain('@opennextjs/cloudflare');
  });

  it('exports d1kv object', () => {
    expect(template).toContain('export const d1kv');
  });

  it('contains getDb() function calling getCloudflareContext() not at module scope', () => {
    expect(template).toContain('function getDb()');
    expect(template).toContain('getCloudflareContext()');
    // Should NOT have module-scope `const db = `
    expect(template).not.toMatch(/^const db\s*=/m);
  });

  it('get method includes expires_at check with delete for expired keys (lazy TTL)', () => {
    expect(template).toContain('expires_at');
    expect(template).toContain('DELETE FROM kv_store WHERE key = ?');
    // Lazy TTL: compare against current time
    expect(template).toContain('Date.now() / 1000');
  });

  it('set method accepts options parameter with ex property', () => {
    expect(template).toMatch(/options\??\.\s*ex/);
  });

  it('set method computes expires_at from Date.now() / 1000 + options.ex', () => {
    expect(template).toContain('Date.now() / 1000 + options.ex');
  });

  it('set method uses INSERT OR REPLACE for upsert semantics', () => {
    expect(template).toContain('INSERT OR REPLACE INTO kv_store');
  });

  it('del method generates DELETE FROM kv_store WHERE key = ?', () => {
    expect(template).toContain('DELETE FROM kv_store WHERE key = ?');
  });

  it('incr method uses ON CONFLICT DO UPDATE with CAST(CAST(value AS INTEGER) + 1 AS TEXT)', () => {
    expect(template).toContain('ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT)');
  });

  it('lpush method uses COALESCE((SELECT MAX(position)...), -1) + 1', () => {
    expect(template).toContain('COALESCE((SELECT MAX(position)');
    expect(template).toContain('-1) + 1');
  });

  it('lpush method uses db.batch for multi-value inserts', () => {
    expect(template).toContain('db.batch');
  });

  it('lrange method uses ORDER BY position DESC', () => {
    expect(template).toContain('ORDER BY position DESC');
  });

  it('lrange handles stop === -1', () => {
    expect(template).toContain('stop === -1');
  });

  it('expire method updates expires_at on kv_store', () => {
    expect(template).toContain('UPDATE kv_store SET expires_at');
  });

  it('uses only positional ? binding (no named params)', () => {
    // D1 does not support named parameters like $key
    expect(template).not.toMatch(/\$\w+/);
    // All SQL bindings use ?
    expect(template).toContain('.bind(');
  });

  it('includes TTL cleanup guidance comment', () => {
    expect(template).toContain('TTL Cleanup');
    expect(template).toContain('Cron Trigger');
  });

  it('template contains all 7 d1kv methods', () => {
    // Verify each method is present as an async method on d1kv
    expect(template).toContain('async get');
    expect(template).toContain('async set');
    expect(template).toContain('async del');
    expect(template).toContain('async incr');
    expect(template).toContain('async lpush');
    expect(template).toContain('async lrange');
    expect(template).toContain('async expire');
  });

  it('is importable via barrel index', async () => {
    const { getAdapterTemplate: fromIndex } = await import(
      '../../../src/transformer/transforms/kv-to-d1/index.js'
    );
    expect(typeof fromIndex).toBe('function');
    expect(fromIndex()).toBe(template);
  });
});
