import { Router } from 'express';
import { ordersService } from '../services/orders.js';
import { keetaService } from '../services/keeta.js';

export const ordersRouter = Router();

ordersRouter.get('/orders', async (req, res, next) => {
  try {
    const orders = await ordersService.getActive();
    res.json(orders);
  } catch (err) {
    next(err);
  }
});

ordersRouter.post('/orders/:id/confirm', async (req, res, next) => {
  try {
    await keetaService.confirmOrder(req.params.id);
    const order = await ordersService.transition(req.params.id, 'CONFIRMED');
    res.json(order);
  } catch (err) {
    next(err);
  }
});

ordersRouter.post('/orders/:id/ready', async (req, res, next) => {
  try {
    await keetaService.readyForPickup(req.params.id);
    const order = await ordersService.transition(req.params.id, 'READY');
    res.json(order);
  } catch (err) {
    next(err);
  }
});

ordersRouter.post('/orders/:id/cancel', async (req, res, next) => {
  try {
    await keetaService.requestCancellation(req.params.id);
    const order = await ordersService.transition(req.params.id, 'CANCELLED', 'PDV');
    res.json(order);
  } catch (err) {
    next(err);
  }
});

ordersRouter.post('/orders/:id/acceptRefund', async (req, res, next) => {
  try {
    await keetaService.acceptRefund(req.params.id);
    const order = await ordersService.updateRefundStatus(req.params.id, 'ACCEPTED');
    res.json(order);
  } catch (err) {
    next(err);
  }
});

ordersRouter.post('/orders/:id/rejectRefund', async (req, res, next) => {
  try {
    await keetaService.rejectRefund(req.params.id);
    const order = await ordersService.updateRefundStatus(req.params.id, 'REJECTED');
    res.json(order);
  } catch (err) {
    next(err);
  }
});
