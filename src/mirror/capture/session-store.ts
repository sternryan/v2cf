import fs from 'node:fs';
import path from 'node:path';
import { CaptureSessionSchema } from './types.js';
import type { CaptureSession } from './types.js';

const V2CF_DIR = '.v2cf';
const SESSIONS_DIR = 'sessions';

/**
 * Write a capture session to .v2cf/sessions/{sessionId}.json.
 * Creates the directory structure if it doesn't exist.
 */
export function writeSession(
  projectDir: string,
  session: CaptureSession
): void {
  const sessDir = path.join(projectDir, V2CF_DIR, SESSIONS_DIR);
  fs.mkdirSync(sessDir, { recursive: true });
  const filePath = path.join(sessDir, `${session.sessionId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(session, null, 2), 'utf-8');
}

/**
 * Read and validate a capture session from .v2cf/sessions/{sessionId}.json.
 * Throws if the file doesn't exist or fails Zod validation.
 */
export function readSession(
  projectDir: string,
  sessionId: string
): CaptureSession {
  const filePath = path.join(
    projectDir,
    V2CF_DIR,
    SESSIONS_DIR,
    `${sessionId}.json`
  );
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  return CaptureSessionSchema.parse(raw);
}

/**
 * List all session IDs in .v2cf/sessions/.
 * Returns an empty array if the directory doesn't exist.
 */
export function listSessions(projectDir: string): string[] {
  const sessDir = path.join(projectDir, V2CF_DIR, SESSIONS_DIR);
  if (!fs.existsSync(sessDir)) return [];
  return fs
    .readdirSync(sessDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace('.json', ''));
}
