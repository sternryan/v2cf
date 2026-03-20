import { describe, it, expect, vi, beforeEach } from 'vitest';
import { injectCachedResponses } from '../../../src/mirror/replay/response-injector.js';
import type { CaptureSession } from '../../../src/mirror/capture/types.js';

// Build a minimal session with both LLM and non-LLM network events
function createTestSession(overrides?: Partial<CaptureSession>): CaptureSession {
  return {
    sessionId: 'sess_test_001',
    captureVersion: 1,
    startTime: 1710864000000,
    endTime: 1710864005000,
    sourceUrl: 'https://stripped-ten.vercel.app',
    rrwebEvents: [],
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
        responseHeaders: {
          'content-type': 'text/plain; charset=utf-8',
          'x-vercel-cache': 'MISS',
        },
        responseBody: '0:"Hello world"',
        duration: 1200,
        isLlmEndpoint: true,
      },
      {
        timestamp: 1710864004000,
        method: 'POST',
        url: 'https://stripped-ten.vercel.app/api/chat',
        requestBody: '{"messages":[{"role":"user","content":"Follow up"}]}',
        status: 200,
        responseHeaders: {
          'content-type': 'text/plain; charset=utf-8',
        },
        responseBody: '0:"Second response"',
        duration: 800,
        isLlmEndpoint: true,
      },
    ],
    metadata: {
      userAgent: 'TestBrowser/1.0',
      viewport: { width: 1280, height: 720 },
      recordingDuration: 5000,
    },
    ...overrides,
  };
}

describe('injectCachedResponses', () => {
  let mockPage: {
    route: ReturnType<typeof vi.fn>;
  };
  let capturedRouteHandler: ((route: any) => Promise<void>) | null;
  let capturedUrlPredicate: ((url: URL) => boolean) | null;

  beforeEach(() => {
    capturedRouteHandler = null;
    capturedUrlPredicate = null;
    mockPage = {
      route: vi.fn().mockImplementation((predicate: any, handler: any) => {
        capturedUrlPredicate = predicate;
        capturedRouteHandler = handler;
        return Promise.resolve();
      }),
    };
  });

  it('calls page.route() with a URL predicate', async () => {
    const session = createTestSession();
    await injectCachedResponses(mockPage as any, session, {
      interceptPatterns: ['/api/chat'],
    });
    expect(mockPage.route).toHaveBeenCalledTimes(1);
    expect(capturedUrlPredicate).toBeTypeOf('function');
  });

  it('URL predicate matches intercept patterns', async () => {
    const session = createTestSession();
    await injectCachedResponses(mockPage as any, session, {
      interceptPatterns: ['/api/chat'],
    });
    // Should match URLs containing the pattern
    expect(capturedUrlPredicate!(new URL('https://example.com/api/chat'))).toBe(true);
    // Should not match unrelated URLs
    expect(capturedUrlPredicate!(new URL('https://example.com/api/health'))).toBe(false);
  });

  it('fulfills first intercepted request with first cached LLM response', async () => {
    const session = createTestSession();
    await injectCachedResponses(mockPage as any, session, {
      interceptPatterns: ['/api/chat'],
    });

    const mockRoute = {
      fulfill: vi.fn().mockResolvedValue(undefined),
      continue: vi.fn().mockResolvedValue(undefined),
    };

    await capturedRouteHandler!(mockRoute);

    expect(mockRoute.fulfill).toHaveBeenCalledWith({
      status: 200,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'x-v2cf-replay': 'true',
      },
      body: '0:"Hello world"',
    });
  });

  it('fulfills second request with second cached LLM response (sequential matching)', async () => {
    const session = createTestSession();
    await injectCachedResponses(mockPage as any, session, {
      interceptPatterns: ['/api/chat'],
    });

    const mockRoute1 = {
      fulfill: vi.fn().mockResolvedValue(undefined),
      continue: vi.fn().mockResolvedValue(undefined),
    };
    const mockRoute2 = {
      fulfill: vi.fn().mockResolvedValue(undefined),
      continue: vi.fn().mockResolvedValue(undefined),
    };

    // First call
    await capturedRouteHandler!(mockRoute1);
    // Second call
    await capturedRouteHandler!(mockRoute2);

    expect(mockRoute2.fulfill).toHaveBeenCalledWith({
      status: 200,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'x-v2cf-replay': 'true',
      },
      body: '0:"Second response"',
    });
  });

  it('calls route.continue() with warning when cached responses run out', async () => {
    const session = createTestSession();
    await injectCachedResponses(mockPage as any, session, {
      interceptPatterns: ['/api/chat'],
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const routes = Array.from({ length: 3 }, () => ({
      fulfill: vi.fn().mockResolvedValue(undefined),
      continue: vi.fn().mockResolvedValue(undefined),
    }));

    // Exhaust the 2 cached responses
    await capturedRouteHandler!(routes[0]);
    await capturedRouteHandler!(routes[1]);
    // Third call -- no cached response left
    await capturedRouteHandler!(routes[2]);

    expect(routes[2].continue).toHaveBeenCalled();
    expect(routes[2].fulfill).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('No cached response')
    );

    warnSpy.mockRestore();
  });

  it('only considers network events where isLlmEndpoint is true', async () => {
    // Session with only non-LLM events
    const session = createTestSession({
      networkEvents: [
        {
          timestamp: 1710864001000,
          method: 'GET',
          url: 'https://example.com/api/chat',
          requestBody: null,
          status: 200,
          responseHeaders: { 'content-type': 'application/json' },
          responseBody: '{"data":"not-llm"}',
          duration: 42,
          isLlmEndpoint: false, // NOT an LLM endpoint
        },
      ],
    });

    await injectCachedResponses(mockPage as any, session, {
      interceptPatterns: ['/api/chat'],
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mockRoute = {
      fulfill: vi.fn().mockResolvedValue(undefined),
      continue: vi.fn().mockResolvedValue(undefined),
    };

    await capturedRouteHandler!(mockRoute);

    // Should call continue since no LLM events are available
    expect(mockRoute.continue).toHaveBeenCalled();
    expect(mockRoute.fulfill).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('filters LLM events by intercept patterns (URL matching)', async () => {
    const session = createTestSession({
      networkEvents: [
        {
          timestamp: 1710864003000,
          method: 'POST',
          url: 'https://example.com/api/other-endpoint',
          requestBody: null,
          status: 200,
          responseHeaders: { 'content-type': 'text/plain' },
          responseBody: '0:"other"',
          duration: 100,
          isLlmEndpoint: true, // LLM endpoint but URL doesn't match pattern
        },
        {
          timestamp: 1710864004000,
          method: 'POST',
          url: 'https://example.com/api/chat',
          requestBody: null,
          status: 200,
          responseHeaders: { 'content-type': 'text/plain' },
          responseBody: '0:"matched"',
          duration: 100,
          isLlmEndpoint: true,
        },
      ],
    });

    await injectCachedResponses(mockPage as any, session, {
      interceptPatterns: ['/api/chat'],
    });

    const mockRoute = {
      fulfill: vi.fn().mockResolvedValue(undefined),
      continue: vi.fn().mockResolvedValue(undefined),
    };

    await capturedRouteHandler!(mockRoute);

    // Should only match the /api/chat event, not /api/other-endpoint
    expect(mockRoute.fulfill).toHaveBeenCalledWith(
      expect.objectContaining({
        body: '0:"matched"',
      })
    );
  });
});
