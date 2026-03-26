import { Router } from 'express';
import { sseManager } from '../services/sseManager.js';

export const sseRouter = Router();

sseRouter.get('/events', (req, res) => {
  // Set headers that tell the browser this is a persistent SSE stream
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders(); // Send headers immediately without waiting for a body

  sseManager.add(res);

  // Remove client when they disconnect (tab close, network drop, etc.)
  req.on('close', () => {
    sseManager.remove(res);
  });
});
