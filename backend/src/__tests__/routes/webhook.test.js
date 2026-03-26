import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../../db/index.js', () => ({
  pool: { query: vi.fn().mockResolvedValue({ rows: [] }) },
}));
vi.mock('../../services/orders.js', () => ({
  ordersService: {
    createFromWebhook: vi.fn().mockResolvedValue({}),
    handleKeetaCancellation: vi.fn().mockResolvedValue({}),
    updateRefundStatus: vi.fn().mockResolvedValue({}),
    transition: vi.fn().mockResolvedValue({}),
  },
}));

describe('POST /webhook', () => {
  let app;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.DATABASE_URL = 'postgres://x:x@localhost/x';
    process.env.KEETA_CLIENT_ID = 'x';
    process.env.KEETA_CLIENT_SECRET = 'x';

    const express = (await import('express')).default;
    const { webhookRouter } = await import('../../routes/webhook.js');
    app = express();
    app.use(express.json());
    app.use(webhookRouter);
  });

  it('always responds 200 immediately', async () => {
    const res = await request(app)
      .post('/webhook')
      .send({ eventType: 'ORDER_CREATED', orderId: 'ord-1' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('logs every event to events_log', async () => {
    const { pool } = await import('../../db/index.js');
    await request(app)
      .post('/webhook')
      .send({ eventType: 'UNKNOWN_EVENT', orderId: 'ord-99' });

    // Give async processing a moment
    await new Promise((r) => setTimeout(r, 10));

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO events_log'),
      expect.arrayContaining(['ord-99', 'UNKNOWN_EVENT'])
    );
  });
});
