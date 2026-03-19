import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Cloudflare from 'cloudflare';
import { WranglerRunner } from '../../src/orchestrator/wrangler-runner.js';
import {
  createD1Database,
  runMigration,
} from '../../src/orchestrator/infra/d1-provisioner.js';

describe('d1-provisioner', () => {
  describe('createD1Database', () => {
    it('calls client.d1.database.create with account_id and name, returns uuid and name', async () => {
      const mockClient = {
        d1: {
          database: {
            create: vi.fn().mockResolvedValue({
              uuid: 'db-uuid-123',
              name: 'my-worker-db',
            }),
          },
        },
      } as unknown as Cloudflare;

      const result = await createD1Database(mockClient, 'acc-123', 'my-worker-db');

      expect(mockClient.d1.database.create).toHaveBeenCalledWith({
        account_id: 'acc-123',
        name: 'my-worker-db',
      });
      expect(result).toEqual({ uuid: 'db-uuid-123', name: 'my-worker-db' });
    });
  });

  describe('runMigration', () => {
    it('calls runner.d1Execute with database name and SQL file path', async () => {
      const mockRunner = {
        d1Execute: vi.fn().mockResolvedValue(undefined),
      } as unknown as WranglerRunner;

      await runMigration(mockRunner, 'my-db', '/path/to/migration.sql');

      expect(mockRunner.d1Execute).toHaveBeenCalledWith(
        'my-db',
        '/path/to/migration.sql'
      );
    });
  });
});
