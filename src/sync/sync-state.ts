import * as fs from 'node:fs';
import * as path from 'node:path';
import { SyncStateSchema, type SyncState } from './types.js';

const V2CF_DIR = '.v2cf';
const SYNC_FILE = 'sync.json';

/**
 * Write sync state to .v2cf/sync.json.
 * Creates the .v2cf/ directory if it does not exist.
 */
export async function writeSyncState(
  projectDir: string,
  state: SyncState
): Promise<void> {
  const v2cfDir = path.join(projectDir, V2CF_DIR);
  fs.mkdirSync(v2cfDir, { recursive: true });

  const syncPath = path.join(v2cfDir, SYNC_FILE);
  fs.writeFileSync(syncPath, JSON.stringify(state, null, 2), 'utf-8');
}

/**
 * Read sync state from .v2cf/sync.json.
 * Returns null if the file does not exist.
 * Throws on invalid JSON or invalid schema.
 */
export async function readSyncState(
  projectDir: string
): Promise<SyncState | null> {
  const syncPath = path.join(projectDir, V2CF_DIR, SYNC_FILE);

  if (!fs.existsSync(syncPath)) {
    return null;
  }

  const raw = fs.readFileSync(syncPath, 'utf-8');
  const data = JSON.parse(raw);
  return SyncStateSchema.parse(data);
}
