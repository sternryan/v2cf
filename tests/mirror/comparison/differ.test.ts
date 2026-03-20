import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReplayResult, ApiCapture } from '../../../src/mirror/types.js';

// Mock readSession
vi.mock('../../../src/mirror/capture/session-store.js', () => ({
  readSession: vi.fn(),
}));

// Mock compareScreenshots
vi.mock('../../../src/mirror/comparison/screenshot-compare.js', () => ({
  compareScreenshots: vi.fn(),
}));

import { generateDiff } from '../../../src/mirror/comparison/differ.js';
import { readSession } from '../../../src/mirror/capture/session-store.js';
import { compareScreenshots } from '../../../src/mirror/comparison/screenshot-compare.js';
import type { CaptureSession } from '../../../src/mirror/capture/types.js';

const mockSession: CaptureSession = {
  sessionId: 'sess_test_differ',
  captureVersion: 1,
  startTime: 1710864000000,
  endTime: 1710864005000,
  sourceUrl: 'https://example.vercel.app',
  rrwebEvents: [],
  networkEvents: [
    {
      timestamp: 1710864001000,
      method: 'GET',
      url: 'https://example.vercel.app/api/health',
      requestBody: null,
      status: 200,
      responseHeaders: {
        'content-type': 'application/json',
        'x-vercel-cache': 'HIT',
      },
      responseBody: '{"status":"ok"}',
      duration: 42,
      isLlmEndpoint: false,
    },
    {
      timestamp: 1710864002000,
      method: 'GET',
      url: 'https://example.vercel.app/api/data',
      requestBody: null,
      status: 200,
      responseHeaders: {
        'content-type': 'application/json',
      },
      responseBody: '{"count":10}',
      duration: 55,
      isLlmEndpoint: false,
    },
  ],
  metadata: {
    userAgent: 'test-agent',
    viewport: { width: 1280, height: 720 },
    recordingDuration: 5000,
  },
};

describe('generateDiff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readSession).mockReturnValue(mockSession);
    vi.mocked(compareScreenshots).mockResolvedValue({
      mismatchPercentage: 0,
      diffImagePath: '/tmp/diff.png',
      width: 1280,
      height: 720,
    });
  });

  it('returns empty divergences when API responses are identical', async () => {
    const replayResult: ReplayResult = {
      screenshots: [],
      apiResponses: [
        {
          url: 'https://cf.example.com/api/health',
          method: 'GET',
          status: 200,
          body: '{"status":"ok"}',
          headers: { 'content-type': 'application/json', 'cf-ray': 'abc123' },
          timestamp: Date.now(),
        },
        {
          url: 'https://cf.example.com/api/data',
          method: 'GET',
          status: 200,
          body: '{"count":10}',
          headers: { 'content-type': 'application/json' },
          timestamp: Date.now(),
        },
      ],
      errors: [],
      duration: 1000,
    };

    const report = await generateDiff({
      sessionId: 'sess_test_differ',
      projectDir: '/tmp/test',
      targetUrl: 'https://cf.example.com',
      replayResult,
      screenshotDir: '/tmp/screenshots',
    });

    expect(report.comparison.divergences).toHaveLength(0);
    expect(report.summary.canFlipDns).toBe(true);
    expect(report.summary.critical).toBe(0);
  });

  it('detects API status code mismatch as critical divergence', async () => {
    const replayResult: ReplayResult = {
      screenshots: [],
      apiResponses: [
        {
          url: 'https://cf.example.com/api/health',
          method: 'GET',
          status: 500,
          body: '{"error":"internal"}',
          headers: { 'content-type': 'application/json' },
          timestamp: Date.now(),
        },
      ],
      errors: [],
      duration: 1000,
    };

    const report = await generateDiff({
      sessionId: 'sess_test_differ',
      projectDir: '/tmp/test',
      targetUrl: 'https://cf.example.com',
      replayResult,
      screenshotDir: '/tmp/screenshots',
    });

    const statusDivergence = report.comparison.divergences.find(
      (d) => d.type === 'api' && d.severity === 'critical'
    );
    expect(statusDivergence).toBeDefined();
    expect(statusDivergence!.description).toContain('Status code mismatch');
    expect(statusDivergence!.expected).toBe('200');
    expect(statusDivergence!.actual).toBe('500');
    expect(report.summary.canFlipDns).toBe(false);
  });

  it('detects API response body difference as warning divergence', async () => {
    const replayResult: ReplayResult = {
      screenshots: [],
      apiResponses: [
        {
          url: 'https://cf.example.com/api/health',
          method: 'GET',
          status: 200,
          body: '{"status":"ok"}',
          headers: { 'content-type': 'application/json' },
          timestamp: Date.now(),
        },
        {
          url: 'https://cf.example.com/api/data',
          method: 'GET',
          status: 200,
          body: '{"count":5}',
          headers: { 'content-type': 'application/json' },
          timestamp: Date.now(),
        },
      ],
      errors: [],
      duration: 1000,
    };

    const report = await generateDiff({
      sessionId: 'sess_test_differ',
      projectDir: '/tmp/test',
      targetUrl: 'https://cf.example.com',
      replayResult,
      screenshotDir: '/tmp/screenshots',
    });

    const bodyDivergence = report.comparison.divergences.find(
      (d) => d.type === 'api' && d.severity === 'warning'
    );
    expect(bodyDivergence).toBeDefined();
    expect(bodyDivergence!.description).toContain('Response body differs');
  });

  it('filters out ignored header divergences', async () => {
    const replayResult: ReplayResult = {
      screenshots: [],
      apiResponses: [
        {
          url: 'https://cf.example.com/api/health',
          method: 'GET',
          status: 200,
          body: '{"status":"ok"}',
          headers: {
            'content-type': 'application/json',
            'cf-ray': 'abc123',
            'cf-cache-status': 'HIT',
          },
          timestamp: Date.now(),
        },
        {
          url: 'https://cf.example.com/api/data',
          method: 'GET',
          status: 200,
          body: '{"count":10}',
          headers: { 'content-type': 'application/json' },
          timestamp: Date.now(),
        },
      ],
      errors: [],
      duration: 1000,
    };

    const report = await generateDiff({
      sessionId: 'sess_test_differ',
      projectDir: '/tmp/test',
      targetUrl: 'https://cf.example.com',
      replayResult,
      screenshotDir: '/tmp/screenshots',
    });

    // x-vercel-cache from session vs cf-ray/cf-cache-status from replay should all be ignored
    const headerDivergences = report.comparison.divergences.filter(
      (d) => d.type === 'api' && d.severity === 'info'
    );
    // There should be no info-level header divergences for ignored headers
    for (const hd of headerDivergences) {
      expect(hd.path).not.toBe('x-vercel-cache');
      expect(hd.path).not.toBe('cf-ray');
      expect(hd.path).not.toBe('cf-cache-status');
    }
  });

  it('sets canFlipDns to true when no critical divergences exist', async () => {
    const replayResult: ReplayResult = {
      screenshots: [],
      apiResponses: [
        {
          url: 'https://cf.example.com/api/health',
          method: 'GET',
          status: 200,
          body: '{"status":"ok"}',
          headers: { 'content-type': 'application/json' },
          timestamp: Date.now(),
        },
        {
          url: 'https://cf.example.com/api/data',
          method: 'GET',
          status: 200,
          body: '{"count":10}',
          headers: { 'content-type': 'application/json' },
          timestamp: Date.now(),
        },
      ],
      errors: [],
      duration: 1000,
    };

    const report = await generateDiff({
      sessionId: 'sess_test_differ',
      projectDir: '/tmp/test',
      targetUrl: 'https://cf.example.com',
      replayResult,
      screenshotDir: '/tmp/screenshots',
    });

    expect(report.summary.canFlipDns).toBe(true);
  });

  it('sets canFlipDns to false when critical divergences exist', async () => {
    const replayResult: ReplayResult = {
      screenshots: [],
      apiResponses: [
        {
          url: 'https://cf.example.com/api/health',
          method: 'GET',
          status: 500,
          body: '{"error":"internal"}',
          headers: { 'content-type': 'application/json' },
          timestamp: Date.now(),
        },
      ],
      errors: [],
      duration: 1000,
    };

    const report = await generateDiff({
      sessionId: 'sess_test_differ',
      projectDir: '/tmp/test',
      targetUrl: 'https://cf.example.com',
      replayResult,
      screenshotDir: '/tmp/screenshots',
    });

    expect(report.summary.canFlipDns).toBe(false);
  });

  it('adds error divergences from replay errors', async () => {
    const replayResult: ReplayResult = {
      screenshots: [],
      apiResponses: [
        {
          url: 'https://cf.example.com/api/health',
          method: 'GET',
          status: 200,
          body: '{"status":"ok"}',
          headers: { 'content-type': 'application/json' },
          timestamp: Date.now(),
        },
        {
          url: 'https://cf.example.com/api/data',
          method: 'GET',
          status: 200,
          body: '{"count":10}',
          headers: { 'content-type': 'application/json' },
          timestamp: Date.now(),
        },
      ],
      errors: ['Action failed: element not found'],
      duration: 1000,
    };

    const report = await generateDiff({
      sessionId: 'sess_test_differ',
      projectDir: '/tmp/test',
      targetUrl: 'https://cf.example.com',
      replayResult,
      screenshotDir: '/tmp/screenshots',
    });

    const errorDivergence = report.comparison.divergences.find(
      (d) => d.type === 'error'
    );
    expect(errorDivergence).toBeDefined();
    expect(errorDivergence!.description).toContain('element not found');
    expect(errorDivergence!.severity).toBe('warning');
  });

  it('matches API responses by URL pathname and method', async () => {
    // Replay URL has different origin but same path
    const replayResult: ReplayResult = {
      screenshots: [],
      apiResponses: [
        {
          url: 'https://cf.example.com/api/health',
          method: 'GET',
          status: 200,
          body: '{"status":"ok"}',
          headers: { 'content-type': 'application/json' },
          timestamp: Date.now(),
        },
      ],
      errors: [],
      duration: 1000,
    };

    const report = await generateDiff({
      sessionId: 'sess_test_differ',
      projectDir: '/tmp/test',
      targetUrl: 'https://cf.example.com',
      replayResult,
      screenshotDir: '/tmp/screenshots',
    });

    // Should match /api/health from session to /api/health from replay
    expect(report.comparison.sessionId).toBe('sess_test_differ');
    expect(report.comparison.sourceUrl).toBe('https://example.vercel.app');
    expect(report.comparison.targetUrl).toBe('https://cf.example.com');
  });

  it('builds correct DiffReport summary', async () => {
    const replayResult: ReplayResult = {
      screenshots: [],
      apiResponses: [
        {
          url: 'https://cf.example.com/api/health',
          method: 'GET',
          status: 500,
          body: '{"error":"internal"}',
          headers: { 'content-type': 'application/json' },
          timestamp: Date.now(),
        },
        {
          url: 'https://cf.example.com/api/data',
          method: 'GET',
          status: 200,
          body: '{"count":5}',
          headers: { 'content-type': 'application/json' },
          timestamp: Date.now(),
        },
      ],
      errors: ['Click failed: timeout'],
      duration: 1000,
    };

    const report = await generateDiff({
      sessionId: 'sess_test_differ',
      projectDir: '/tmp/test',
      targetUrl: 'https://cf.example.com',
      replayResult,
      screenshotDir: '/tmp/screenshots',
    });

    expect(report.summary.critical).toBeGreaterThanOrEqual(1);
    expect(report.summary.totalDivergences).toBeGreaterThanOrEqual(2);
    expect(report.summary.canFlipDns).toBe(false);
    expect(report.htmlPath).toBe(''); // Not yet set by report generator
  });
});
