import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  resolveZone,
  configureDomain,
  isDomainConfigAvailable,
} from '../../src/orchestrator/infra/domain-configurator.js';

describe('domain-configurator', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('isDomainConfigAvailable', () => {
    it('returns true when CLOUDFLARE_API_TOKEN is set', () => {
      process.env.CLOUDFLARE_API_TOKEN = 'test-token';
      expect(isDomainConfigAvailable()).toBe(true);
    });

    it('returns false when CLOUDFLARE_API_TOKEN is not set', () => {
      delete process.env.CLOUDFLARE_API_TOKEN;
      expect(isDomainConfigAvailable()).toBe(false);
    });
  });

  describe('resolveZone', () => {
    it('throws when CLOUDFLARE_API_TOKEN is not set', async () => {
      delete process.env.CLOUDFLARE_API_TOKEN;
      await expect(
        resolveZone('acc-123', 'cf.quartermint.com')
      ).rejects.toThrow('CLOUDFLARE_API_TOKEN');
    });

    it('calls CF API for root domain and returns zone_id and zone_name', async () => {
      process.env.CLOUDFLARE_API_TOKEN = 'test-token';

      const mockFetch = vi.fn().mockResolvedValue({
        json: async () => ({
          success: true,
          result: [{ id: 'zone-abc', name: 'quartermint.com' }],
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await resolveZone('acc-123', 'cf.quartermint.com');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/zones?name=quartermint.com'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        })
      );
      expect(result).toEqual({ zoneId: 'zone-abc', zoneName: 'quartermint.com' });
    });

    it('throws if no zone found for the domain', async () => {
      process.env.CLOUDFLARE_API_TOKEN = 'test-token';

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        json: async () => ({
          success: true,
          result: [],
        }),
      }));

      await expect(
        resolveZone('acc-123', 'cf.unknown-domain.com')
      ).rejects.toThrow('unknown-domain.com');
    });
  });

  describe('configureDomain', () => {
    it('calls CF Workers Domains API with correct params', async () => {
      process.env.CLOUDFLARE_API_TOKEN = 'test-token';

      const mockFetch = vi.fn().mockResolvedValue({
        json: async () => ({ success: true, result: {} }),
      });
      vi.stubGlobal('fetch', mockFetch);

      await configureDomain(
        'acc-123',
        'cf.quartermint.com',
        'my-worker',
        'zone-abc',
        'quartermint.com'
      );

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/accounts/acc-123/workers/domains'),
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({
            hostname: 'cf.quartermint.com',
            service: 'my-worker',
            environment: 'production',
            zone_id: 'zone-abc',
            zone_name: 'quartermint.com',
          }),
        })
      );
    });
  });
});
