import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock global fetch before importing the module
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('keetaService', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.KEETA_CLIENT_ID = 'test-id';
    process.env.KEETA_CLIENT_SECRET = 'test-secret';
    process.env.DATABASE_URL = 'postgres://x:x@localhost/x';
  });

  it('fetches a token on the first API call', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'tok1', expires_in: 3600 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

    const { keetaService } = await import('../../services/keeta.js');
    await keetaService.confirmOrder('order-1');

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[0][0]).toContain('/oauth/token');
    expect(mockFetch.mock.calls[1][0]).toContain('/orders/order-1/confirm');
  });

  it('reuses a cached token for subsequent calls', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'tok1', expires_in: 3600 }),
      })
      .mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

    const { keetaService } = await import('../../services/keeta.js');
    await keetaService.confirmOrder('order-1');
    await keetaService.confirmOrder('order-2');

    // Token fetched once, two order API calls = 3 total
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});
