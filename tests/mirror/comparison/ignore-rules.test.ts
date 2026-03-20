import { describe, it, expect } from 'vitest';
import {
  shouldIgnoreHeader,
  shouldIgnoreDivergence,
  defaultIgnoreRules,
} from '../../../src/mirror/comparison/ignore-rules.js';
import type { Divergence } from '../../../src/mirror/types.js';

describe('ignore-rules', () => {
  describe('shouldIgnoreHeader', () => {
    it('ignores x-vercel-cache header', () => {
      expect(shouldIgnoreHeader('x-vercel-cache')).toBe(true);
    });

    it('ignores x-vercel-id header', () => {
      expect(shouldIgnoreHeader('x-vercel-id')).toBe(true);
    });

    it('ignores x-vercel-proxy-signature header', () => {
      expect(shouldIgnoreHeader('x-vercel-proxy-signature')).toBe(true);
    });

    it('ignores cf-ray header', () => {
      expect(shouldIgnoreHeader('cf-ray')).toBe(true);
    });

    it('ignores cf-cache-status header', () => {
      expect(shouldIgnoreHeader('cf-cache-status')).toBe(true);
    });

    it('ignores set-cookie header', () => {
      expect(shouldIgnoreHeader('set-cookie')).toBe(true);
    });

    it('ignores server header', () => {
      expect(shouldIgnoreHeader('server')).toBe(true);
    });

    it('does NOT ignore content-type', () => {
      expect(shouldIgnoreHeader('content-type')).toBe(false);
    });

    it('does NOT ignore authorization', () => {
      expect(shouldIgnoreHeader('authorization')).toBe(false);
    });

    it('is case-insensitive', () => {
      expect(shouldIgnoreHeader('X-Vercel-Cache')).toBe(true);
      expect(shouldIgnoreHeader('CF-Ray')).toBe(true);
      expect(shouldIgnoreHeader('Set-Cookie')).toBe(true);
    });
  });

  describe('shouldIgnoreDivergence', () => {
    it('ignores divergence with timestamp ISO pattern in description', () => {
      const div: Divergence = {
        type: 'api',
        severity: 'info',
        description: 'Value differs: 2026-03-20T02:08:51',
        expected: '2026-03-20T02:08:51',
        actual: '2026-03-20T02:08:52',
      };
      expect(shouldIgnoreDivergence(div)).toBe(true);
    });

    it('ignores divergence about static asset hash', () => {
      const div: Divergence = {
        type: 'api',
        severity: 'info',
        description: 'URL differs: _next/static/chunks/abc123def.js',
        expected: '_next/static/chunks/abc123def.js',
        actual: '_next/static/chunks/xyz789.js',
      };
      expect(shouldIgnoreDivergence(div)).toBe(true);
    });

    it('ignores divergence with UUID in description', () => {
      const div: Divergence = {
        type: 'api',
        severity: 'info',
        description: 'Session ID differs: 550e8400-e29b-41d4-a716-446655440000',
        expected: '550e8400-e29b-41d4-a716-446655440000',
        actual: '660f9500-f39c-52e5-b827-557766551111',
      };
      expect(shouldIgnoreDivergence(div)).toBe(true);
    });

    it('ignores divergence with nonce attribute in description', () => {
      const div: Divergence = {
        type: 'api',
        severity: 'info',
        description: 'DOM attribute differs: nonce="abc123xyz"',
        expected: 'nonce="abc123xyz"',
        actual: 'nonce="def456uvw"',
      };
      expect(shouldIgnoreDivergence(div)).toBe(true);
    });

    it('ignores divergence whose path matches an ignored header', () => {
      const div: Divergence = {
        type: 'api',
        severity: 'info',
        description: 'Header x-vercel-cache differs',
        expected: 'HIT',
        actual: 'MISS',
        path: 'x-vercel-cache',
      };
      expect(shouldIgnoreDivergence(div)).toBe(true);
    });

    it('does NOT ignore API status code divergence', () => {
      const div: Divergence = {
        type: 'api',
        severity: 'critical',
        description: 'Status code mismatch for /api/health',
        expected: '200',
        actual: '500',
      };
      expect(shouldIgnoreDivergence(div)).toBe(false);
    });

    it('does NOT ignore meaningful body divergence', () => {
      const div: Divergence = {
        type: 'api',
        severity: 'warning',
        description: 'Response body differs for /api/data',
        expected: '{"count":10}',
        actual: '{"count":5}',
      };
      expect(shouldIgnoreDivergence(div)).toBe(false);
    });
  });

  describe('defaultIgnoreRules', () => {
    it('exports IGNORED_HEADERS set', () => {
      expect(defaultIgnoreRules.IGNORED_HEADERS).toBeInstanceOf(Set);
      expect(defaultIgnoreRules.IGNORED_HEADERS.has('x-vercel-cache')).toBe(true);
    });

    it('exports IGNORED_BODY_PATTERNS array', () => {
      expect(Array.isArray(defaultIgnoreRules.IGNORED_BODY_PATTERNS)).toBe(true);
      expect(defaultIgnoreRules.IGNORED_BODY_PATTERNS.length).toBeGreaterThan(0);
    });
  });
});
