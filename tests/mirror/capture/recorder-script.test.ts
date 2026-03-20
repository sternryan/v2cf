import { describe, it, expect } from 'vitest';
import { generateRecorderScript } from '../../../src/mirror/capture/recorder-script.js';

describe('generateRecorderScript', () => {
  it('returns a string containing "rrweb" reference', () => {
    const script = generateRecorderScript({ sessionId: 'test_001' });
    expect(script).toContain('rrweb');
  });

  it('returns a string containing "v2cf" config namespace', () => {
    const script = generateRecorderScript({ sessionId: 'test_001' });
    expect(script).toContain('v2cf');
  });

  it('returns a string containing "fetch" interceptor', () => {
    const script = generateRecorderScript({ sessionId: 'test_001' });
    expect(script).toContain('fetch');
  });

  it('embeds the sessionId in the output', () => {
    const script = generateRecorderScript({ sessionId: 'sess_abc_123' });
    expect(script).toContain('sess_abc_123');
  });

  it('includes a script tag with rrweb CDN URL', () => {
    const script = generateRecorderScript({ sessionId: 'test_001' });
    expect(script).toContain('<script');
    expect(script).toContain('https://unpkg.com/rrweb@2.0.0-alpha.20');
  });

  it('uses default maxDuration of 300000 when not provided', () => {
    const script = generateRecorderScript({ sessionId: 'test_001' });
    expect(script).toContain('300000');
  });

  it('uses custom maxDuration when provided', () => {
    const script = generateRecorderScript({
      sessionId: 'test_001',
      maxDuration: 60000,
    });
    expect(script).toContain('60000');
  });

  it('uses default network patterns ["/api/"] when not provided', () => {
    const script = generateRecorderScript({ sessionId: 'test_001' });
    expect(script).toContain('/api/');
  });

  it('uses custom captureNetworkPatterns when provided', () => {
    const script = generateRecorderScript({
      sessionId: 'test_001',
      captureNetworkPatterns: ['/v1/chat', '/v2/completion'],
    });
    expect(script).toContain('/v1/chat');
    expect(script).toContain('/v2/completion');
  });

  it('includes fetch interceptor code (response.clone pattern)', () => {
    const script = generateRecorderScript({ sessionId: 'test_001' });
    expect(script).toContain('response.clone()');
    expect(script).toContain('originalFetch');
  });

  it('sets up __v2cf_events array for rrweb events', () => {
    const script = generateRecorderScript({ sessionId: 'test_001' });
    expect(script).toContain('__v2cf_events');
  });

  it('sets up __v2cf_network_events array for network events', () => {
    const script = generateRecorderScript({ sessionId: 'test_001' });
    expect(script).toContain('__v2cf_network_events');
  });

  it('sets up __v2cf_config with session configuration', () => {
    const script = generateRecorderScript({ sessionId: 'test_001' });
    expect(script).toContain('__v2cf_config');
  });

  it('includes collectionEndpoint beacon when provided', () => {
    const script = generateRecorderScript({
      sessionId: 'test_001',
      collectionEndpoint: 'http://localhost:3456/collect',
    });
    expect(script).toContain('sendBeacon');
    expect(script).toContain('http://localhost:3456/collect');
  });

  it('stores session in localStorage', () => {
    const script = generateRecorderScript({ sessionId: 'test_001' });
    expect(script).toContain('localStorage');
    expect(script).toContain('v2cf_session_');
  });

  it('includes rrweb sampling configuration', () => {
    const script = generateRecorderScript({ sessionId: 'test_001' });
    expect(script).toContain('mousemove');
    expect(script).toContain('mouseInteraction');
    expect(script).toContain('scroll');
  });

  it('uses custom sampleMouseMove when provided', () => {
    const script = generateRecorderScript({
      sessionId: 'test_001',
      sampleMouseMove: 100,
    });
    // The custom sample rate should be in the config
    expect(script).toContain('100');
  });

  it('includes __v2cf_stop function for session finalization', () => {
    const script = generateRecorderScript({ sessionId: 'test_001' });
    expect(script).toContain('__v2cf_stop');
  });
});
