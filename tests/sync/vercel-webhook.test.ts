import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  registerVercelWebhook,
  deleteVercelWebhook,
} from '../../src/sync/vercel-webhook.js';

describe('registerVercelWebhook', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('calls POST https://api.vercel.com/v1/webhooks with Bearer token', async () => {
    const mockResponse = {
      id: 'hook_abc123',
      secret: 'whsec_secret',
      url: 'https://worker.example.com',
      events: ['deployment.succeeded'],
      ownerId: 'owner1',
      createdAt: 1234567890,
      updatedAt: 1234567890,
    };

    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify(mockResponse), { status: 200 })
    );

    const result = await registerVercelWebhook(
      'vercel-token-123',
      'https://worker.example.com'
    );

    expect(globalThis.fetch).toHaveBeenCalledOnce();
    const [url, opts] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(url.toString()).toContain('https://api.vercel.com/v1/webhooks');
    expect(opts?.method).toBe('POST');
    expect(opts?.headers).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer vercel-token-123',
        'Content-Type': 'application/json',
      })
    );

    const body = JSON.parse(opts?.body as string);
    expect(body.events).toEqual(['deployment.succeeded']);
    expect(body.url).toBe('https://worker.example.com');

    expect(result.id).toBe('hook_abc123');
    expect(result.secret).toBe('whsec_secret');
  });

  it('includes teamId query param when provided', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'hook_1',
          secret: 's',
          url: 'u',
          events: [],
          ownerId: 'o',
          createdAt: 0,
          updatedAt: 0,
        }),
        { status: 200 }
      )
    );

    await registerVercelWebhook('token', 'https://worker.example.com', {
      teamId: 'team_xyz',
    });

    const [url] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(url.toString()).toContain('teamId=team_xyz');
  });

  it('includes projectIds array when projectId provided', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'hook_1',
          secret: 's',
          url: 'u',
          events: [],
          ownerId: 'o',
          createdAt: 0,
          updatedAt: 0,
        }),
        { status: 200 }
      )
    );

    await registerVercelWebhook('token', 'https://worker.example.com', {
      projectId: 'prj_abc',
    });

    const [, opts] = vi.mocked(globalThis.fetch).mock.calls[0];
    const body = JSON.parse(opts?.body as string);
    expect(body.projectIds).toEqual(['prj_abc']);
  });

  it('throws descriptive error on non-ok response', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ error: { message: 'Rate limited' } }),
        { status: 429 }
      )
    );

    await expect(
      registerVercelWebhook('token', 'https://worker.example.com')
    ).rejects.toThrow('Vercel webhook creation failed');
  });

  it('throws with Pro/Enterprise message on 403 status', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ error: { message: 'Forbidden' } }),
        { status: 403 }
      )
    );

    await expect(
      registerVercelWebhook('token', 'https://worker.example.com')
    ).rejects.toThrow('Pro or Enterprise plan required');
  });
});

describe('deleteVercelWebhook', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('calls DELETE https://api.vercel.com/v1/webhooks/{id} with Bearer token', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(null, { status: 204 })
    );

    await deleteVercelWebhook('token-123', 'hook_abc');

    const [url, opts] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(url.toString()).toContain(
      'https://api.vercel.com/v1/webhooks/hook_abc'
    );
    expect(opts?.method).toBe('DELETE');
    expect(opts?.headers).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer token-123',
      })
    );
  });

  it('includes teamId query param when provided', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(null, { status: 204 })
    );

    await deleteVercelWebhook('token', 'hook_1', 'team_xyz');

    const [url] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(url.toString()).toContain('teamId=team_xyz');
  });

  it('throws on non-ok response', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ error: { message: 'Not found' } }),
        { status: 404 }
      )
    );

    await expect(deleteVercelWebhook('token', 'hook_bad')).rejects.toThrow(
      'Vercel webhook deletion failed'
    );
  });
});
