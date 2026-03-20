import { describe, it, expect } from 'vitest';
import {
  CaptureSessionSchema,
  NetworkEventSchema,
} from '../../../src/mirror/capture/types.js';
import sampleSession from '../../fixtures/sessions/sample-session.json';

describe('NetworkEventSchema', () => {
  it('validates a well-formed network event with isLlmEndpoint', () => {
    const event = {
      timestamp: 1710864001000,
      method: 'GET',
      url: 'https://stripped-ten.vercel.app/api/health',
      requestBody: null,
      requestHeaders: { accept: 'application/json' },
      status: 200,
      responseHeaders: { 'content-type': 'application/json' },
      responseBody: '{"status":"ok"}',
      duration: 42,
      isLlmEndpoint: false,
    };
    const result = NetworkEventSchema.safeParse(event);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isLlmEndpoint).toBe(false);
    }
  });

  it('validates a network event with isLlmEndpoint true', () => {
    const event = {
      timestamp: 1710864002000,
      method: 'POST',
      url: 'https://stripped-ten.vercel.app/api/chat',
      requestBody: '{"messages":[]}',
      requestHeaders: { 'content-type': 'application/json' },
      status: 200,
      responseHeaders: { 'content-type': 'text/plain; charset=utf-8' },
      responseBody: '0:"Hello "\n0:"world"',
      duration: 500,
      isLlmEndpoint: true,
    };
    const result = NetworkEventSchema.safeParse(event);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isLlmEndpoint).toBe(true);
    }
  });

  it('rejects a network event missing required isLlmEndpoint', () => {
    const event = {
      timestamp: 1710864001000,
      method: 'GET',
      url: '/api/health',
      requestBody: null,
      status: 200,
      responseHeaders: {},
      responseBody: '{}',
      duration: 10,
    };
    const result = NetworkEventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });

  it('allows optional requestHeaders field to be omitted', () => {
    const event = {
      timestamp: 1710864001000,
      method: 'GET',
      url: '/api/health',
      requestBody: null,
      status: 200,
      responseHeaders: { 'content-type': 'application/json' },
      responseBody: '{}',
      duration: 10,
      isLlmEndpoint: false,
    };
    const result = NetworkEventSchema.safeParse(event);
    expect(result.success).toBe(true);
  });
});

describe('CaptureSessionSchema', () => {
  it('validates a well-formed capture session', () => {
    const session = {
      sessionId: 'sess_test_001',
      captureVersion: 1,
      startTime: 1710864000000,
      endTime: 1710864005000,
      sourceUrl: 'https://stripped-ten.vercel.app',
      rrwebEvents: [{ type: 2, data: {} }],
      networkEvents: [
        {
          timestamp: 1710864001000,
          method: 'GET',
          url: '/api/health',
          requestBody: null,
          status: 200,
          responseHeaders: { 'content-type': 'application/json' },
          responseBody: '{"status":"ok"}',
          duration: 42,
          isLlmEndpoint: false,
        },
      ],
      metadata: {
        userAgent: 'Mozilla/5.0 Test',
        viewport: { width: 1280, height: 720 },
        recordingDuration: 5000,
      },
    };
    const result = CaptureSessionSchema.safeParse(session);
    expect(result.success).toBe(true);
  });

  it('rejects a session with captureVersion !== 1', () => {
    const session = {
      sessionId: 'sess_test_bad',
      captureVersion: 2,
      startTime: 1710864000000,
      endTime: 1710864005000,
      sourceUrl: 'https://example.com',
      rrwebEvents: [],
      networkEvents: [],
      metadata: {
        userAgent: 'Test',
        viewport: { width: 1280, height: 720 },
        recordingDuration: 1000,
      },
    };
    const result = CaptureSessionSchema.safeParse(session);
    expect(result.success).toBe(false);
  });

  it('rejects a session with missing sessionId', () => {
    const session = {
      captureVersion: 1,
      startTime: 1710864000000,
      endTime: 1710864005000,
      sourceUrl: 'https://example.com',
      rrwebEvents: [],
      networkEvents: [],
      metadata: {
        userAgent: 'Test',
        viewport: { width: 1280, height: 720 },
        recordingDuration: 1000,
      },
    };
    const result = CaptureSessionSchema.safeParse(session);
    expect(result.success).toBe(false);
  });

  it('validates the sample-session.json fixture', () => {
    const result = CaptureSessionSchema.safeParse(sampleSession);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sessionId).toBe('sess_test_001');
      expect(result.data.networkEvents).toHaveLength(2);
      expect(result.data.rrwebEvents).toHaveLength(3);
      expect(result.data.networkEvents[0].isLlmEndpoint).toBe(false);
      expect(result.data.networkEvents[1].isLlmEndpoint).toBe(true);
    }
  });
});
