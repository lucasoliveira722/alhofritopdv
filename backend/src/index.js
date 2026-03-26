import express from 'express';
import { config } from './config.js';
import { migrate } from './db/migrate.js';
import { sseRouter } from './routes/sse.js';
import { webhookRouter } from './routes/webhook.js';

const app = express();
app.use(express.json());

app.use(sseRouter);
app.use(webhookRouter);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Global error handler
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message });
});

async function start() {
  await migrate();
  app.listen(config.port, () => {
    console.log(`PDV backend running on port ${config.port}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

export { app };
