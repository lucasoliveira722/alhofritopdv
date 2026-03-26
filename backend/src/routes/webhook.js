import { Router } from 'express';
import { pool } from '../db/index.js';
import { ordersService } from '../services/orders.js';

export const webhookRouter = Router();

webhookRouter.post('/webhook', (req, res) => {
  // Respond immediately — Keeta requires a response within 5 seconds
  res.status(200).json({ received: true });

  // Process asynchronously after the response has been sent
  processEvent(req.body).catch((err) => {
    console.error('Webhook processing error:', err);
  });
});

async function processEvent(body) {
  const { eventType, orderId } = body;

  // Audit log — every webhook event is recorded regardless of type
  await pool.query(
    'INSERT INTO events_log (order_id, event_type, payload) VALUES ($1, $2, $3)',
    [orderId ?? null, eventType, body]
  );

  switch (eventType) {
    case 'ORDER_CREATED':
      await ordersService.createFromWebhook(body);
      break;
    case 'ORDER_CANCELLED':
      if (orderId) await ordersService.handleKeetaCancellation(orderId);
      break;
    case 'ORDER_DELIVERED':
      // Keeta notifies us when their rider has delivered the order.
      // NOTE: verify the exact event type name in your Keeta Developer Portal
      // — common names include ORDER_DELIVERED, ORDER_DISPATCHED, or ORDER_COMPLETED.
      if (orderId) await ordersService.transition(orderId, 'DONE');
      break;
    case 'REFUND_REQUESTED':
      if (orderId) await ordersService.updateRefundStatus(orderId, 'PENDING');
      break;
    default:
      console.log(`Unhandled webhook event type: ${eventType}`);
  }
}
