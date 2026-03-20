import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { ReplayOptions, ReplayResult } from '../../../src/mirror/types.js';
import type { CaptureSession } from '../../../src/mirror/capture/types.js';
import fs from 'node:fs';

// --- Mock setup ---

// Build a test session matching sample-session.json structure
const testSession: CaptureSession = {
  sessionId: 'sess_test_001',
  captureVersion: 1,
  startTime: 1710864000000,
  endTime: 1710864005000,
  sourceUrl: 'https://stripped-ten.vercel.app',
  rrwebEvents: [
    {
      type: 2, // FullSnapshot (not actionable)
      data: { node: { type: 0, childNodes: [] }, initialOffset: { top: 0, left: 0 } },
      timestamp: 1710864000100,
    },
    {
      type: 3, // IncrementalSnapshot - click
      data: { source: 2, type: 2, id: 42, x: 512, y: 384, pointerType: 0 },
      timestamp: 1710864001500,
    },
    {
      type: 3, // IncrementalSnapshot - input
      data: { source: 5, id: 55, text: 'Hello, can you help me?', isChecked: false },
      timestamp: 1710864002000,
    },
  ],
  networkEvents: [
    {
      timestamp: 1710864001000,
      method: 'GET',
      url: 'https://stripped-ten.vercel.app/api/health',
      requestBody: null,
      status: 200,
      responseHeaders: { 'content-type': 'application/json' },
      responseBody: '{"status":"ok"}',
      duration: 42,
      isLlmEndpoint: false,
    },
    {
      timestamp: 1710864003000,
      method: 'POST',
      url: 'https://stripped-ten.vercel.app/api/chat',
      requestBody: '{"messages":[{"role":"user","content":"Hello"}]}',
      status: 200,
      responseHeaders: { 'content-type': 'text/plain; charset=utf-8' },
      responseBody: '0:"Hello world"',
      duration: 1200,
      isLlmEndpoint: true,
    },
  ],
  metadata: {
    userAgent: 'Mozilla/5.0 TestBrowser',
    viewport: { width: 1280, height: 720 },
    recordingDuration: 5000,
  },
};

// Mock page with all methods we expect engine to call
function createMockPage() {
  const responseListeners: Array<(response: any) => void> = [];
  return {
    mouse: { click: vi.fn().mockResolvedValue(undefined) },
    keyboard: { type: vi.fn().mockResolvedValue(undefined) },
    route: vi.fn().mockResolvedValue(undefined),
    goto: vi.fn().mockResolvedValue(undefined),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(Buffer.from('fake-png')),
    on: vi.fn().mockImplementation((event: string, handler: any) => {
      if (event === 'response') {
        responseListeners.push(handler);
      }
    }),
    _responseListeners: responseListeners,
  };
}

function createMockContext(page: ReturnType<typeof createMockPage>) {
  return {
    newPage: vi.fn().mockResolvedValue(page),
  };
}

function createMockBrowser(context: ReturnType<typeof createMockContext>) {
  return {
    newContext: vi.fn().mockResolvedValue(context),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

// Mock modules
vi.mock('playwright', () => {
  return {
    chromium: {
      launch: vi.fn(),
    },
  };
});

vi.mock('../../../src/mirror/capture/session-store.js', () => ({
  readSession: vi.fn(),
}));

vi.mock('../../../src/mirror/replay/response-injector.js', () => ({
  injectCachedResponses: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../src/mirror/replay/event-mapper.js', () => ({
  mapRrwebEventToAction: vi.fn(),
}));

describe('runReplay', () => {
  let mockPage: ReturnType<typeof createMockPage>;
  let mockContext: ReturnType<typeof createMockContext>;
  let mockBrowser: ReturnType<typeof createMockBrowser>;

  beforeEach(async () => {
    vi.clearAllMocks();

    mockPage = createMockPage();
    mockContext = createMockContext(mockPage);
    mockBrowser = createMockBrowser(mockContext);

    // Set up playwright mock
    const { chromium } = await import('playwright');
    (chromium.launch as Mock).mockResolvedValue(mockBrowser);

    // Set up readSession mock
    const { readSession } = await import('../../../src/mirror/capture/session-store.js');
    (readSession as Mock).mockReturnValue(testSession);

    // Set up event-mapper mock: return mock actions for type-3 events
    const { mapRrwebEventToAction } = await import('../../../src/mirror/replay/event-mapper.js');
    (mapRrwebEventToAction as Mock).mockImplementation((event: any) => {
      if (event.type !== 3) return null;
      if (event.data.source === 2 && event.data.type === 2) {
        return {
          type: 'click',
          description: `click at (${event.data.x}, ${event.data.y})`,
          execute: vi.fn().mockResolvedValue(undefined),
        };
      }
      if (event.data.source === 5) {
        return {
          type: 'fill',
          description: `fill "${event.data.text}"`,
          execute: vi.fn().mockResolvedValue(undefined),
        };
      }
      return null;
    });
  });

  const defaultOptions: ReplayOptions = {
    targetUrl: 'https://stripped-ten.example.workers.dev',
    sessionId: 'sess_test_001',
    projectDir: '/tmp/test-project',
    interceptPatterns: ['/api/chat'],
    actionDelay: 100,
    screenshotDir: '/tmp/test-screenshots',
  };

  it('loads session via readSession(projectDir, sessionId)', async () => {
    const { runReplay } = await import('../../../src/mirror/replay/engine.js');
    const { readSession } = await import('../../../src/mirror/capture/session-store.js');

    await runReplay(defaultOptions);

    expect(readSession).toHaveBeenCalledWith('/tmp/test-project', 'sess_test_001');
  });

  it('launches headless chromium', async () => {
    const { runReplay } = await import('../../../src/mirror/replay/engine.js');
    const { chromium } = await import('playwright');

    await runReplay(defaultOptions);

    expect(chromium.launch).toHaveBeenCalledWith({ headless: true });
  });

  it('creates context with session viewport and userAgent', async () => {
    const { runReplay } = await import('../../../src/mirror/replay/engine.js');

    await runReplay(defaultOptions);

    expect(mockBrowser.newContext).toHaveBeenCalledWith(
      expect.objectContaining({
        viewport: { width: 1280, height: 720 },
        userAgent: 'Mozilla/5.0 TestBrowser',
      })
    );
  });

  it('uses options.viewport when provided (overrides session)', async () => {
    const { runReplay } = await import('../../../src/mirror/replay/engine.js');

    await runReplay({ ...defaultOptions, viewport: { width: 800, height: 600 } });

    expect(mockBrowser.newContext).toHaveBeenCalledWith(
      expect.objectContaining({
        viewport: { width: 800, height: 600 },
      })
    );
  });

  it('calls injectCachedResponses before page.goto', async () => {
    const { runReplay } = await import('../../../src/mirror/replay/engine.js');
    const { injectCachedResponses } = await import('../../../src/mirror/replay/response-injector.js');

    const callOrder: string[] = [];
    (injectCachedResponses as Mock).mockImplementation(async () => {
      callOrder.push('inject');
    });
    mockPage.goto.mockImplementation(async () => {
      callOrder.push('goto');
    });

    await runReplay(defaultOptions);

    expect(callOrder.indexOf('inject')).toBeLessThan(callOrder.indexOf('goto'));
    expect(injectCachedResponses).toHaveBeenCalledWith(
      mockPage,
      testSession,
      { interceptPatterns: ['/api/chat'] }
    );
  });

  it('navigates to targetUrl + pathname from session sourceUrl', async () => {
    const { runReplay } = await import('../../../src/mirror/replay/engine.js');

    await runReplay(defaultOptions);

    // sourceUrl is https://stripped-ten.vercel.app (pathname = /)
    expect(mockPage.goto).toHaveBeenCalledWith(
      'https://stripped-ten.example.workers.dev/',
      { waitUntil: 'networkidle' }
    );
  });

  it('calls mapRrwebEventToAction for each rrweb event', async () => {
    const { runReplay } = await import('../../../src/mirror/replay/engine.js');
    const { mapRrwebEventToAction } = await import('../../../src/mirror/replay/event-mapper.js');

    await runReplay(defaultOptions);

    // Should be called for all 3 events (type 2 + two type 3s)
    expect(mapRrwebEventToAction).toHaveBeenCalledTimes(3);
  });

  it('executes actions with actionDelay between them', async () => {
    const { runReplay } = await import('../../../src/mirror/replay/engine.js');

    await runReplay(defaultOptions);

    // Two actionable events (click + input), each should have a waitForTimeout after execute
    expect(mockPage.waitForTimeout).toHaveBeenCalledWith(100);
  });

  it('takes a final full-page screenshot', async () => {
    const { runReplay } = await import('../../../src/mirror/replay/engine.js');

    await runReplay(defaultOptions);

    expect(mockPage.screenshot).toHaveBeenCalledWith(
      expect.objectContaining({
        fullPage: true,
      })
    );
  });

  it('closes browser after completion', async () => {
    const { runReplay } = await import('../../../src/mirror/replay/engine.js');

    await runReplay(defaultOptions);

    expect(mockBrowser.close).toHaveBeenCalled();
  });

  it('returns well-shaped ReplayResult', async () => {
    const { runReplay } = await import('../../../src/mirror/replay/engine.js');

    const result = await runReplay(defaultOptions);

    expect(result).toHaveProperty('screenshots');
    expect(result).toHaveProperty('apiResponses');
    expect(result).toHaveProperty('errors');
    expect(result).toHaveProperty('duration');
    expect(Array.isArray(result.screenshots)).toBe(true);
    expect(Array.isArray(result.apiResponses)).toBe(true);
    expect(Array.isArray(result.errors)).toBe(true);
    expect(typeof result.duration).toBe('number');
    expect(result.screenshots.length).toBeGreaterThan(0);
  });

  it('captures action failures in errors array instead of throwing', async () => {
    const { runReplay } = await import('../../../src/mirror/replay/engine.js');
    const { mapRrwebEventToAction } = await import('../../../src/mirror/replay/event-mapper.js');

    // Make the click action throw
    (mapRrwebEventToAction as Mock).mockImplementation((event: any) => {
      if (event.type !== 3) return null;
      if (event.data.source === 2) {
        return {
          type: 'click',
          description: 'click at (512, 384)',
          execute: vi.fn().mockRejectedValue(new Error('Element not found')),
        };
      }
      if (event.data.source === 5) {
        return {
          type: 'fill',
          description: 'fill text',
          execute: vi.fn().mockResolvedValue(undefined),
        };
      }
      return null;
    });

    const result = await runReplay(defaultOptions);

    // Should not throw, should capture error
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('Element not found');
  });

  it('registers a page response listener for API capture', async () => {
    const { runReplay } = await import('../../../src/mirror/replay/engine.js');

    await runReplay(defaultOptions);

    expect(mockPage.on).toHaveBeenCalledWith('response', expect.any(Function));
  });

  it('ensures screenshot directory exists', async () => {
    const mkdirSpy = vi.spyOn(fs, 'mkdirSync').mockReturnValue(undefined);

    const { runReplay } = await import('../../../src/mirror/replay/engine.js');

    await runReplay(defaultOptions);

    expect(mkdirSpy).toHaveBeenCalledWith('/tmp/test-screenshots', { recursive: true });

    mkdirSpy.mockRestore();
  });
});
