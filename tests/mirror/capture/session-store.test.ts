import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  writeSession,
  readSession,
  listSessions,
} from '../../../src/mirror/capture/session-store.js';
import type { CaptureSession } from '../../../src/mirror/capture/types.js';
import sampleSession from '../../fixtures/sessions/sample-session.json';

describe('session-store', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v2cf-mirror-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('writeSession', () => {
    it('creates .v2cf/sessions/ directory and writes {sessionId}.json', () => {
      writeSession(tmpDir, sampleSession as CaptureSession);

      const sessDir = path.join(tmpDir, '.v2cf', 'sessions');
      expect(fs.existsSync(sessDir)).toBe(true);

      const filePath = path.join(sessDir, 'sess_test_001.json');
      expect(fs.existsSync(filePath)).toBe(true);

      const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(content.sessionId).toBe('sess_test_001');
    });

    it('writes pretty-printed JSON (indented)', () => {
      writeSession(tmpDir, sampleSession as CaptureSession);

      const filePath = path.join(
        tmpDir,
        '.v2cf',
        'sessions',
        'sess_test_001.json'
      );
      const raw = fs.readFileSync(filePath, 'utf-8');
      // Pretty-printed JSON contains newlines and indentation
      expect(raw).toContain('\n');
      expect(raw).toContain('  ');
    });
  });

  describe('readSession', () => {
    it('returns validated CaptureSession from disk', () => {
      writeSession(tmpDir, sampleSession as CaptureSession);

      const session = readSession(tmpDir, 'sess_test_001');
      expect(session.sessionId).toBe('sess_test_001');
      expect(session.captureVersion).toBe(1);
      expect(session.networkEvents).toHaveLength(2);
      expect(session.rrwebEvents).toHaveLength(3);
      expect(session.metadata.viewport.width).toBe(1280);
    });

    it('throws when session file does not exist', () => {
      expect(() => readSession(tmpDir, 'nonexistent')).toThrow();
    });

    it('throws when session file contains invalid data', () => {
      const sessDir = path.join(tmpDir, '.v2cf', 'sessions');
      fs.mkdirSync(sessDir, { recursive: true });
      fs.writeFileSync(
        path.join(sessDir, 'bad_session.json'),
        JSON.stringify({ sessionId: 'bad', captureVersion: 99 })
      );

      expect(() => readSession(tmpDir, 'bad_session')).toThrow();
    });
  });

  describe('listSessions', () => {
    it('returns array of session IDs from .v2cf/sessions/', () => {
      // Write two sessions with different IDs
      const session1 = { ...sampleSession, sessionId: 'sess_alpha' };
      const session2 = { ...sampleSession, sessionId: 'sess_beta' };
      writeSession(tmpDir, session1 as CaptureSession);
      writeSession(tmpDir, session2 as CaptureSession);

      const ids = listSessions(tmpDir);
      expect(ids).toHaveLength(2);
      expect(ids).toContain('sess_alpha');
      expect(ids).toContain('sess_beta');
    });

    it('returns empty array when .v2cf/sessions/ does not exist', () => {
      const ids = listSessions(tmpDir);
      expect(ids).toEqual([]);
    });

    it('returns empty array when sessions directory is empty', () => {
      const sessDir = path.join(tmpDir, '.v2cf', 'sessions');
      fs.mkdirSync(sessDir, { recursive: true });

      const ids = listSessions(tmpDir);
      expect(ids).toEqual([]);
    });

    it('only returns .json files (ignores other files)', () => {
      writeSession(tmpDir, sampleSession as CaptureSession);
      // Add a non-JSON file
      const sessDir = path.join(tmpDir, '.v2cf', 'sessions');
      fs.writeFileSync(path.join(sessDir, '.gitkeep'), '');

      const ids = listSessions(tmpDir);
      expect(ids).toHaveLength(1);
      expect(ids[0]).toBe('sess_test_001');
    });
  });
});
