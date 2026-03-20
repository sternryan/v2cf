import { describe, it, expect } from 'vitest';
import { generateFetchInterceptorCode } from '../../../src/mirror/capture/fetch-interceptor.js';

describe('generateFetchInterceptorCode', () => {
  it('returns a string containing "originalFetch" save', () => {
    const code = generateFetchInterceptorCode(['/api/']);
    expect(code).toContain('originalFetch');
  });

  it('returns a string containing "response.clone()" for non-destructive reading', () => {
    const code = generateFetchInterceptorCode(['/api/']);
    expect(code).toContain('response.clone()');
  });

  it('embeds the provided network patterns array', () => {
    const code = generateFetchInterceptorCode(['/api/', '/v1/chat']);
    expect(code).toContain('/api/');
    expect(code).toContain('/v1/chat');
  });

  it('sets window.__v2cf_network_events array', () => {
    const code = generateFetchInterceptorCode(['/api/']);
    expect(code).toContain('__v2cf_network_events');
  });

  it('contains isLlmEndpoint tagging logic', () => {
    const code = generateFetchInterceptorCode(['/api/']);
    expect(code).toContain('isLlmEndpoint');
  });

  it('uses performance.now() for duration measurement', () => {
    const code = generateFetchInterceptorCode(['/api/']);
    expect(code).toContain('performance.now()');
  });

  it('returns the original response to the application (not the clone)', () => {
    const code = generateFetchInterceptorCode(['/api/']);
    // Should return the original response, not consume it
    expect(code).toContain('return response');
  });
});
