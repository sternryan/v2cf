import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  writeSyncState,
  readSyncState,
} from '../../src/sync/sync-state.js';
import type { SyncState } from '../../src/sync/types.js';

describe('sync-state', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v2cf-sync-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const validState: SyncState = {
    enabled: true,
    vercelWebhookId: 'hook_abc123',
    vercelWebhookSecret: 'whsec_secret',
    webhookWorkerUrl: 'https://v2cf-sync-test.workers.dev',
    webhookWorkerName: 'v2cf-sync-test',
    rebuildMethod: 'worker',
    createdAt: '2026-03-19T00:00:00Z',
  };

  describe('writeSyncState', () => {
    it('creates .v2cf/ directory if missing and writes sync.json', async () => {
      await writeSyncState(tmpDir, validState);

      const v2cfDir = path.join(tmpDir, '.v2cf');
      expect(fs.existsSync(v2cfDir)).toBe(true);

      const syncFile = path.join(v2cfDir, 'sync.json');
      expect(fs.existsSync(syncFile)).toBe(true);

      const content = JSON.parse(fs.readFileSync(syncFile, 'utf-8'));
      expect(content.enabled).toBe(true);
      expect(content.vercelWebhookId).toBe('hook_abc123');
      expect(content.webhookWorkerName).toBe('v2cf-sync-test');
    });

    it('overwrites existing sync.json', async () => {
      await writeSyncState(tmpDir, validState);

      const updatedState: SyncState = {
        ...validState,
        enabled: false,
      };
      await writeSyncState(tmpDir, updatedState);

      const syncFile = path.join(tmpDir, '.v2cf', 'sync.json');
      const content = JSON.parse(fs.readFileSync(syncFile, 'utf-8'));
      expect(content.enabled).toBe(false);
    });
  });

  describe('readSyncState', () => {
    it('returns parsed SyncState from .v2cf/sync.json when it exists', async () => {
      await writeSyncState(tmpDir, validState);

      const result = await readSyncState(tmpDir);
      expect(result).not.toBeNull();
      expect(result!.enabled).toBe(true);
      expect(result!.vercelWebhookId).toBe('hook_abc123');
      expect(result!.rebuildMethod).toBe('worker');
    });

    it('returns null when .v2cf/sync.json does not exist', async () => {
      const result = await readSyncState(tmpDir);
      expect(result).toBeNull();
    });

    it('throws on invalid JSON in sync.json', async () => {
      const v2cfDir = path.join(tmpDir, '.v2cf');
      fs.mkdirSync(v2cfDir, { recursive: true });
      fs.writeFileSync(path.join(v2cfDir, 'sync.json'), 'not json{{{');

      await expect(readSyncState(tmpDir)).rejects.toThrow();
    });

    it('throws on valid JSON but invalid SyncState schema', async () => {
      const v2cfDir = path.join(tmpDir, '.v2cf');
      fs.mkdirSync(v2cfDir, { recursive: true });
      fs.writeFileSync(
        path.join(v2cfDir, 'sync.json'),
        JSON.stringify({ enabled: 'not-a-boolean' })
      );

      await expect(readSyncState(tmpDir)).rejects.toThrow();
    });
  });
});
