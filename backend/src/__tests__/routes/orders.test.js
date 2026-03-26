import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../../services/orders.js', () => ({
  ordersService: {
    getActive: vi.fn().mockResolvedValue([{ id: 'ord-1', status: 'PLACED' }]),
    transition: vi.fn(),
    updateRefundStatus: vi.fn(),
  },
}));
vi.mock('../../services/keeta.js', () => ({
  keetaService: {
    confirmOrder: vi.fn().mockResolvedValue({}),
    readyForPickup: vi.fn().mockResolvedValue({}),
    requestCancellation: vi.fn().mockResolvedValue({}),
    acceptRefund: vi.fn().mockResolvedValue({}),
    rejectRefund: vi.fn().mockResolvedValue({}),
  },
}));

describe('orders routes', () => {
  let app;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.DATABASE_URL = 'postgres://x:x@localhost/x';
    process.env.KEETA_CLIENT_ID = 'x';
    process.env.KEETA_CLIENT_SECRET = 'x';

    const express = (await import('express')).default;
    const { ordersRouter } = await import('../../routes/orders.js');
    app = express();
    app.use(express.json());
    app.use(ordersRouter);
    app.use((err, _req, res, _next) => res.status(err.status || 500).json({ error: err.message }));
  });

  it('GET /orders returns active orders', async () => {
    const res = await request(app).get('/orders');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 'ord-1', status: 'PLACED' }]);
  });

  it('POST /orders/:id/confirm calls keeta then transitions order', async () => {
    const { ordersService } = await import('../../services/orders.js');
    const { keetaService } = await import('../../services/keeta.js');
    ordersService.transition.mockResolvedValue({ id: 'ord-1', status: 'CONFIRMED' });

    const res = await request(app).post('/orders/ord-1/confirm');

    expect(keetaService.confirmOrder).toHaveBeenCalledWith('ord-1');
    expect(ordersService.transition).toHaveBeenCalledWith('ord-1', 'CONFIRMED');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CONFIRMED');
  });

  it('POST /orders/:id/cancel sets cancel_source to PDV', async () => {
    const { ordersService } = await import('../../services/orders.js');
    ordersService.transition.mockResolvedValue({ id: 'ord-1', status: 'CANCELLED', cancel_source: 'PDV' });

    const res = await request(app).post('/orders/ord-1/cancel');

    expect(ordersService.transition).toHaveBeenCalledWith('ord-1', 'CANCELLED', 'PDV');
    expect(res.status).toBe(200);
  });

  it('returns 400 when transition is invalid', async () => {
    const { ordersService } = await import('../../services/orders.js');
    ordersService.transition.mockRejectedValue(
      Object.assign(new Error('Invalid transition'), { status: 400 })
    );

    const res = await request(app).post('/orders/ord-1/confirm');
    expect(res.status).toBe(400);
  });
});
