import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the DB pool and sseManager before importing orders
vi.mock('../../db/index.js', () => ({
  pool: { query: vi.fn() },
}));
vi.mock('../../services/sseManager.js', () => ({
  sseManager: { push: vi.fn() },
}));

describe('ordersService.transition', () => {
  let pool, sseManager, ordersService;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.DATABASE_URL = 'postgres://x:x@localhost/x';
    process.env.KEETA_CLIENT_ID = 'x';
    process.env.KEETA_CLIENT_SECRET = 'x';

    ({ pool } = await import('../../db/index.js'));
    ({ sseManager } = await import('../../services/sseManager.js'));
    ({ ordersService } = await import('../../services/orders.js'));
  });

  it('transitions PLACED → CONFIRMED', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ status: 'PLACED' }] })  // SELECT status
      .mockResolvedValueOnce({ rows: [{ id: 'ord-1', status: 'CONFIRMED' }] }); // UPDATE

    const result = await ordersService.transition('ord-1', 'CONFIRMED');
    expect(result.status).toBe('CONFIRMED');
    expect(sseManager.push).toHaveBeenCalledWith('order:updated', expect.objectContaining({ status: 'CONFIRMED' }));
  });

  it('throws 400 for an invalid transition (READY → CONFIRMED)', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ status: 'READY' }] });

    await expect(ordersService.transition('ord-1', 'CONFIRMED')).rejects.toMatchObject({
      status: 400,
    });
  });

  it('throws 404 when order is not found', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    await expect(ordersService.transition('missing', 'CONFIRMED')).rejects.toMatchObject({
      status: 404,
    });
  });

  it('sets cancel_source to PDV when cancelling from PDV', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ status: 'PLACED' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'ord-1', status: 'CANCELLED', cancel_source: 'PDV' }] });

    const result = await ordersService.transition('ord-1', 'CANCELLED', 'PDV');
    expect(result.cancel_source).toBe('PDV');
  });
});
