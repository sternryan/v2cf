import { describe, it, expect, vi } from 'vitest';
import type Cloudflare from 'cloudflare';
import {
  resolveZone,
  configureDomain,
} from '../../src/orchestrator/infra/domain-configurator.js';

describe('domain-configurator', () => {
  describe('resolveZone', () => {
    it('calls client.zones.list for root domain and returns zone_id and zone_name', async () => {
      const mockClient = {
        zones: {
          list: vi.fn().mockResolvedValue({
            [Symbol.asyncIterator]: async function* () {
              yield { id: 'zone-abc', name: 'quartermint.com' };
            },
          }),
        },
      } as unknown as Cloudflare;

      const result = await resolveZone(mockClient, 'acc-123', 'cf.quartermint.com');

      expect(mockClient.zones.list).toHaveBeenCalledWith({
        name: 'quartermint.com',
      });
      expect(result).toEqual({ zoneId: 'zone-abc', zoneName: 'quartermint.com' });
    });

    it('throws if no zone found for the domain', async () => {
      const mockClient = {
        zones: {
          list: vi.fn().mockResolvedValue({
            [Symbol.asyncIterator]: async function* () {
              // no zones
            },
          }),
        },
      } as unknown as Cloudflare;

      await expect(
        resolveZone(mockClient, 'acc-123', 'cf.unknown-domain.com')
      ).rejects.toThrow('unknown-domain.com');
    });
  });

  describe('configureDomain', () => {
    it('calls client.workers.domains.update with correct params', async () => {
      const mockClient = {
        workers: {
          domains: {
            update: vi.fn().mockResolvedValue({}),
          },
        },
      } as unknown as Cloudflare;

      await configureDomain(
        mockClient,
        'acc-123',
        'cf.quartermint.com',
        'my-worker',
        'zone-abc',
        'quartermint.com'
      );

      expect(mockClient.workers.domains.update).toHaveBeenCalledWith({
        account_id: 'acc-123',
        hostname: 'cf.quartermint.com',
        service: 'my-worker',
        environment: 'production',
        zone_id: 'zone-abc',
        zone_name: 'quartermint.com',
      });
    });
  });
});
