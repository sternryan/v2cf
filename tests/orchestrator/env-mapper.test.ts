import { describe, it, expect } from 'vitest';
import {
  mapEnvToSecrets,
  VERCEL_ONLY_VARS,
} from '../../src/orchestrator/config-gen/env-mapper.js';

describe('mapEnvToSecrets', () => {
  it('classifies OPENAI_API_KEY as a secret', () => {
    const input = 'OPENAI_API_KEY=sk-test-123';
    const { secrets } = mapEnvToSecrets(input);
    expect(secrets.OPENAI_API_KEY).toBe('sk-test-123');
  });

  it('skips KV_URL (Vercel-only var)', () => {
    const input = 'KV_URL=redis://localhost:6379';
    const { secrets, skipped } = mapEnvToSecrets(input);
    expect(secrets.KV_URL).toBeUndefined();
    expect(skipped).toContain('KV_URL');
  });

  it('skips VERCEL_ENV (Vercel-only var)', () => {
    const input = 'VERCEL_ENV=production';
    const { secrets, skipped } = mapEnvToSecrets(input);
    expect(secrets.VERCEL_ENV).toBeUndefined();
    expect(skipped).toContain('VERCEL_ENV');
  });

  it('correctly maps mix of KV_URL, VERCEL_ENV, and OPENAI_API_KEY', () => {
    const input = [
      'KV_URL=redis://localhost:6379',
      'VERCEL_ENV=production',
      'OPENAI_API_KEY=sk-test',
    ].join('\n');
    const { secrets } = mapEnvToSecrets(input);
    expect(Object.keys(secrets)).toEqual(['OPENAI_API_KEY']);
    expect(secrets.OPENAI_API_KEY).toBe('sk-test');
  });

  it('skips empty values', () => {
    const input = 'EMPTY_VAR=';
    const { secrets, skipped } = mapEnvToSecrets(input);
    expect(secrets.EMPTY_VAR).toBeUndefined();
    expect(skipped).toContain('EMPTY_VAR');
  });

  it('skips placeholder values like sk-ant-...', () => {
    const input = 'ANTHROPIC_KEY=sk-ant-...';
    const { secrets, skipped } = mapEnvToSecrets(input);
    expect(secrets.ANTHROPIC_KEY).toBeUndefined();
    expect(skipped).toContain('ANTHROPIC_KEY');
  });

  it('handles double-quoted values', () => {
    const input = 'MY_SECRET="secret-value"';
    const { secrets } = mapEnvToSecrets(input);
    expect(secrets.MY_SECRET).toBe('secret-value');
  });

  it('handles single-quoted values', () => {
    const input = "MY_SECRET='secret-value'";
    const { secrets } = mapEnvToSecrets(input);
    expect(secrets.MY_SECRET).toBe('secret-value');
  });

  it('skips comment lines starting with #', () => {
    const input = [
      '# This is a comment',
      'REAL_KEY=real-value',
      '   # Another comment',
    ].join('\n');
    const { secrets } = mapEnvToSecrets(input);
    expect(Object.keys(secrets)).toEqual(['REAL_KEY']);
  });

  it('classifies NEXT_PUBLIC_* vars as plain vars, not secrets', () => {
    const input = [
      'NEXT_PUBLIC_APP_URL=https://example.com',
      'NEXT_PUBLIC_ANALYTICS_ID=GA-123',
      'SECRET_KEY=supersecret',
    ].join('\n');
    const { secrets, plainVars } = mapEnvToSecrets(input);
    expect(plainVars.NEXT_PUBLIC_APP_URL).toBe('https://example.com');
    expect(plainVars.NEXT_PUBLIC_ANALYTICS_ID).toBe('GA-123');
    expect(secrets.NEXT_PUBLIC_APP_URL).toBeUndefined();
    expect(secrets.SECRET_KEY).toBe('supersecret');
  });

  it('VERCEL_ONLY_VARS includes KV_URL and VERCEL_ENV', () => {
    expect(VERCEL_ONLY_VARS).toContain('KV_URL');
    expect(VERCEL_ONLY_VARS).toContain('VERCEL_ENV');
  });

  it('skips lines without = sign', () => {
    const input = 'NOT_A_VALID_LINE\nVALID_KEY=valid-value';
    const { secrets } = mapEnvToSecrets(input);
    expect(Object.keys(secrets)).toEqual(['VALID_KEY']);
  });
});
