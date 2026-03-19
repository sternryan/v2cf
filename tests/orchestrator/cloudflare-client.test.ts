import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Must be hoisted before the module import
vi.mock('cloudflare', () => {
  class MockCloudflare {
    accounts = { list: vi.fn() };
    constructor(public opts: Record<string, unknown>) {}
  }
  return { default: MockCloudflare };
});

import Cloudflare from 'cloudflare';
import {
  getCloudflareClient,
  getAccountId,
  resetClient,
} from '../../src/orchestrator/cloudflare-client.js';

describe('cloudflare-client', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    resetClient();
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getCloudflareClient', () => {
    it('throws with message containing CLOUDFLARE_API_TOKEN when env var missing', () => {
      delete process.env.CLOUDFLARE_API_TOKEN;
      expect(() => getCloudflareClient()).toThrow('CLOUDFLARE_API_TOKEN');
    });

    it('throws with message containing token creation URL when env var missing', () => {
      delete process.env.CLOUDFLARE_API_TOKEN;
      expect(() => getCloudflareClient()).toThrow(
        'https://dash.cloudflare.com/profile/api-tokens'
      );
    });

    it('returns Cloudflare instance when CLOUDFLARE_API_TOKEN set', () => {
      process.env.CLOUDFLARE_API_TOKEN = 'test-token-123';
      const client = getCloudflareClient();
      expect(client).toBeDefined();
      expect((client as unknown as { opts: Record<string, unknown> }).opts).toEqual({
        apiToken: 'test-token-123',
      });
    });

    it('returns cached instance on second call', () => {
      process.env.CLOUDFLARE_API_TOKEN = 'test-token-123';
      const first = getCloudflareClient();
      const second = getCloudflareClient();
      expect(first).toBe(second);
    });
  });

  describe('getAccountId', () => {
    it('calls client.accounts.list() and returns first account ID', async () => {
      const mockClient = {
        accounts: {
          list: vi.fn().mockResolvedValue({
            result: [{ id: 'acc-id-123', name: 'Test Account' }],
            [Symbol.asyncIterator]: async function* () {
              yield { id: 'acc-id-123', name: 'Test Account' };
            },
          }),
        },
      } as unknown as Cloudflare;

      const id = await getAccountId(mockClient);
      expect(id).toBe('acc-id-123');
    });

    it('throws when token has no accounts', async () => {
      const mockClient = {
        accounts: {
          list: vi.fn().mockResolvedValue({
            result: [],
            [Symbol.asyncIterator]: async function* () {
              // no items
            },
          }),
        },
      } as unknown as Cloudflare;

      await expect(getAccountId(mockClient)).rejects.toThrow(
        'No Cloudflare accounts found'
      );
    });
  });
});
