import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WranglerRunner } from '../../src/orchestrator/wrangler-runner.js';
import {
  createD1Database,
  runMigration,
} from '../../src/orchestrator/infra/d1-provisioner.js';

describe('d1-provisioner', () => {
  describe('createD1Database', () => {
    it('calls runner.d1Create with name and returns uuid and name', async () => {
      const mockRunner = {
        d1Create: vi.fn().mockResolvedValue({
          uuid: 'db-uuid-123',
          name: 'my-worker-db',
        }),
      } as unknown as WranglerRunner;

      const result = await createD1Database(mockRunner, 'my-worker-db');

      expect(mockRunner.d1Create).toHaveBeenCalledWith('my-worker-db');
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
