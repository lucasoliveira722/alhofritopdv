import { pool } from '../db/index.js';
import { sseManager } from './sseManager.js';

const VALID_TRANSITIONS = {
  PLACED: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['READY', 'CANCELLED'],
  READY: ['DONE'],
};

const STATUS_TIMESTAMP = {
  CONFIRMED: 'confirmed_at',
  READY: 'ready_at',
  DONE: 'done_at',
  CANCELLED: 'cancelled_at',
};

export const ordersService = {
  async getActive() {
    const { rows } = await pool.query(`
      SELECT o.*, COALESCE(json_agg(oi.*) FILTER (WHERE oi.id IS NOT NULL), '[]') AS items
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE o.status IN ('PLACED', 'CONFIRMED', 'READY')
         OR (o.status = 'DONE' AND o.refund_status = 'PENDING')
      GROUP BY o.id
      ORDER BY o.placed_at ASC
    `);
    return rows;
  },

  async createFromWebhook(payload) {
    const { orderId, createdAt, orderAmount, payments, customer, items } = payload;

    // Idempotency: skip if this order already exists
    const existing = await pool.query('SELECT id FROM orders WHERE id = $1', [orderId]);
    if (existing.rows.length > 0) return null;

    const { rows } = await pool.query(
      `INSERT INTO orders
         (id, status, total_price, payment_method, customer_name, raw_payload, placed_at)
       VALUES ($1, 'PLACED', $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        orderId,
        orderAmount?.value ?? null,
        payments?.[0]?.method ?? null,
        customer?.name ?? null,
        payload,
        createdAt ?? new Date(),
      ]
    );

    if (items?.length) {
      for (const item of items) {
        await pool.query(
          `INSERT INTO order_items (order_id, name, quantity, unit_price, notes)
           VALUES ($1, $2, $3, $4, $5)`,
          [orderId, item.name, item.quantity ?? 1, item.unitPrice?.value ?? null, item.observations ?? null]
        );
      }
    }

    sseManager.push('order:new', rows[0]);
    return rows[0];
  },

  async transition(orderId, toStatus, cancelSource = null) {
    const { rows: found } = await pool.query(
      'SELECT status FROM orders WHERE id = $1',
      [orderId]
    );

    if (!found.length) {
      throw Object.assign(new Error('Order not found'), { status: 404 });
    }

    const currentStatus = found[0].status;
    const allowed = VALID_TRANSITIONS[currentStatus] ?? [];

    if (!allowed.includes(toStatus)) {
      throw Object.assign(
        new Error(`Cannot transition order from ${currentStatus} to ${toStatus}`),
        { status: 400 }
      );
    }

    const tsColumn = STATUS_TIMESTAMP[toStatus];
    const cancelClause = cancelSource ? ', cancel_source = $3' : '';
    const params = cancelSource ? [toStatus, orderId, cancelSource] : [toStatus, orderId];

    const { rows: updated } = await pool.query(
      `UPDATE orders
       SET status = $1, ${tsColumn} = NOW() ${cancelClause}
       WHERE id = $2
       RETURNING *`,
      params
    );

    sseManager.push('order:updated', updated[0]);
    return updated[0];
  },

  async handleKeetaCancellation(orderId) {
    return this.transition(orderId, 'CANCELLED', 'KEETA');
  },

  async updateRefundStatus(orderId, refundStatus) {
    const { rows } = await pool.query(
      `UPDATE orders SET refund_status = $1 WHERE id = $2 RETURNING *`,
      [refundStatus, orderId]
    );
    if (!rows.length) throw Object.assign(new Error('Order not found'), { status: 404 });
    sseManager.push('order:updated', rows[0]);
    return rows[0];
  },
};
