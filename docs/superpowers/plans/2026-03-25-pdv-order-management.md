# PDV Order Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser-based PDV system in Node.js that receives and manages delivery orders from the Keeta OpenDelivery API in real time.

**Architecture:** Keeta pushes order events to an Express server via webhooks (exposed locally through ngrok). Express persists orders to PostgreSQL and broadcasts updates to a React frontend via Server-Sent Events. The operator confirms, marks ready, and cancels orders from a Kanban board in the browser.

**Tech Stack:** Node.js 20 LTS, Express 4, `pg` (node-postgres), PostgreSQL 16, React 18, Vite 5, Vitest, Docker Compose 3.9

**Spec:** `docs/superpowers/specs/2026-03-25-pdv-order-management-design.md`

---

## File Map

```
alhofritopdv/
├── docker-compose.yml
├── .env.example
├── .gitignore
│
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   ├── vitest.config.js
│   └── src/
│       ├── index.js                        # Express bootstrap + startup
│       ├── config.js                       # Reads + validates env vars
│       ├── db/
│       │   ├── index.js                    # pg Pool singleton
│       │   ├── migrate.js                  # Runs SQL migrations on startup
│       │   └── migrations/
│       │       ├── 001_create_orders.sql
│       │       ├── 002_create_order_items.sql
│       │       └── 003_create_events_log.sql
│       ├── routes/
│       │   ├── webhook.js                  # POST /webhook
│       │   ├── orders.js                   # GET /orders + POST action endpoints
│       │   └── sse.js                      # GET /events (SSE stream)
│       └── services/
│           ├── keeta.js                    # OAuth token cache + Keeta API calls
│           ├── orders.js                   # State transitions, DB writes, SSE push
│           └── sseManager.js              # Tracks connected SSE clients
│
└── frontend/
    ├── Dockerfile                          # Builds React, serves via nginx
    ├── nginx.conf
    ├── package.json
    ├── vite.config.js
    └── src/
        ├── main.jsx
        ├── App.jsx                         # State management + SSE setup
        ├── hooks/
        │   └── useSSE.js                   # EventSource lifecycle hook
        └── components/
            ├── KanbanBoard.jsx             # Three-column layout
            ├── OrderColumn.jsx             # Column with header + card list
            ├── OrderCard.jsx               # Order card with action buttons
            └── RefundBanner.jsx            # Banner for pending refund requests
```

---

## Task 1: Project Scaffolding

**Files:**
- Create: `.gitignore`
- Create: `.env.example`
- Create: `docker-compose.yml`

- [ ] **Step 1: Initialise git and create the root files**

```bash
cd c:/Users/Lucas/Documents/Projetos/alhofritopdv
git init
```

Create `.gitignore`:

```
node_modules/
.env
.superpowers/
*.log
dist/
```

Create `.env.example`:

```
# Keeta API credentials (obtain from Keeta Developer Portal)
KEETA_CLIENT_ID=your_client_id_here
KEETA_CLIENT_SECRET=your_client_secret_here
KEETA_BASE_URL=https://open.mykeeta.com/api/open/opendelivery

# PostgreSQL connection string — matches the db service in docker-compose.yml
DATABASE_URL=postgres://pdv:pdv@localhost:5432/pdv

# Express port
PORT=3000

# Optional: verify incoming webhook requests using Keeta's X-App-Signature header
WEBHOOK_SECRET=
```

- [ ] **Step 2: Create `docker-compose.yml`**

```yaml
version: '3.9'

services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: pdv
      POSTGRES_PASSWORD: pdv
      POSTGRES_DB: pdv
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U pdv"]
      interval: 5s
      timeout: 5s
      retries: 5

  app:
    build: ./backend
    ports:
      - "3000:3000"
    env_file: .env
    environment:
      DATABASE_URL: postgres://pdv:pdv@db:5432/pdv
      PORT: 3000
    depends_on:
      db:
        condition: service_healthy

  frontend:
    build: ./frontend
    ports:
      - "80:80"
    depends_on:
      - app

volumes:
  pgdata:
```

> **Learning note:** `healthcheck` makes Docker wait until PostgreSQL is actually accepting connections before starting the `app` container. Without this, the backend would crash on startup because it tries to connect to a database that isn't ready yet — even though the container has started.

- [ ] **Step 3: Create backend and frontend directories**

```bash
mkdir -p backend/src/db/migrations backend/src/routes backend/src/services
mkdir -p frontend/src/hooks frontend/src/components
```

- [ ] **Step 4: Commit**

```bash
git add .gitignore .env.example docker-compose.yml
git commit -m "chore: project scaffolding and docker-compose"
```

---

## Task 2: Backend Foundation

**Files:**
- Create: `backend/package.json`
- Create: `backend/vitest.config.js`
- Create: `backend/src/config.js`
- Create: `backend/src/index.js`

- [ ] **Step 1: Create `backend/package.json`**

```json
{
  "name": "alhofritopdv-backend",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "node src/index.js",
    "dev": "node --watch src/index.js",
    "test": "vitest run"
  },
  "dependencies": {
    "express": "^4.18.2",
    "pg": "^8.11.3"
  },
  "devDependencies": {
    "vitest": "^1.6.0",
    "supertest": "^7.0.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

```bash
cd backend && npm install
```

- [ ] **Step 3: Create `backend/vitest.config.js`**

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
  },
});
```

- [ ] **Step 4: Write test for `config.js`**

Create `backend/src/__tests__/config.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';

describe('config', () => {
  beforeEach(() => {
    // Reset module cache so we get a fresh config each time
    process.env.DATABASE_URL = 'postgres://test:test@localhost/test';
    process.env.KEETA_CLIENT_ID = 'test-client-id';
    process.env.KEETA_CLIENT_SECRET = 'test-client-secret';
  });

  it('exports required fields when env vars are set', async () => {
    const { config } = await import('../config.js');
    expect(config.databaseUrl).toBe('postgres://test:test@localhost/test');
    expect(config.keetaClientId).toBe('test-client-id');
    expect(config.keetaClientSecret).toBe('test-client-secret');
    expect(config.port).toBeDefined();
  });
});
```

- [ ] **Step 5: Run test — expect failure**

```bash
cd backend && npm test
```

Expected: FAIL — `../config.js` does not exist yet.

- [ ] **Step 6: Create `backend/src/config.js`**

```js
import 'dotenv/config';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const config = {
  port: process.env.PORT || 3000,
  databaseUrl: required('DATABASE_URL'),
  keetaClientId: required('KEETA_CLIENT_ID'),
  keetaClientSecret: required('KEETA_CLIENT_SECRET'),
  keetaBaseUrl: process.env.KEETA_BASE_URL || 'https://open.mykeeta.com/api/open/opendelivery',
  webhookSecret: process.env.WEBHOOK_SECRET || null,
};
```

> **Learning note:** Failing fast on missing env vars is better than letting the app start and crash later with a confusing error. This pattern is common in production Node.js services.

- [ ] **Step 7: Install dotenv**

```bash
cd backend && npm install dotenv
```

- [ ] **Step 8: Run test — expect pass**

```bash
cd backend && npm test
```

Expected: PASS

- [ ] **Step 9: Create `backend/src/index.js`**

```js
import express from 'express';
import { config } from './config.js';
import { migrate } from './db/migrate.js';

const app = express();
app.use(express.json());

// Routes will be added in later tasks
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
```

- [ ] **Step 10: Commit**

```bash
cd ..
git add backend/
git commit -m "feat: backend foundation — Express, config, and health endpoint"
```

---

## Task 3: Database Layer

**Files:**
- Create: `backend/src/db/index.js`
- Create: `backend/src/db/migrate.js`
- Create: `backend/src/db/migrations/001_create_orders.sql`
- Create: `backend/src/db/migrations/002_create_order_items.sql`
- Create: `backend/src/db/migrations/003_create_events_log.sql`

- [ ] **Step 1: Create `backend/src/db/index.js`**

```js
import pg from 'pg';
import { config } from '../config.js';

const { Pool } = pg;

export const pool = new Pool({ connectionString: config.databaseUrl });
```

> **Learning note:** `Pool` manages multiple reusable database connections. Instead of opening and closing a connection for every query (expensive), the pool keeps connections alive and lends them out as needed. `pg` is the most widely used PostgreSQL client for Node.js.

- [ ] **Step 2: Create the migration SQL files**

`backend/src/db/migrations/001_create_orders.sql`:

```sql
CREATE TABLE IF NOT EXISTS orders (
  id            TEXT PRIMARY KEY,
  status        TEXT NOT NULL DEFAULT 'PLACED',
  total_price   NUMERIC(10,2),
  payment_method TEXT,
  customer_name TEXT,
  raw_payload   JSONB NOT NULL,
  placed_at     TIMESTAMPTZ,
  confirmed_at  TIMESTAMPTZ,
  ready_at      TIMESTAMPTZ,
  done_at       TIMESTAMPTZ,
  cancelled_at  TIMESTAMPTZ,
  cancel_source TEXT,
  refund_status TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
```

`backend/src/db/migrations/002_create_order_items.sql`:

```sql
CREATE TABLE IF NOT EXISTS order_items (
  id         SERIAL PRIMARY KEY,
  order_id   TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  quantity   INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC(10,2),
  notes      TEXT
);
```

`backend/src/db/migrations/003_create_events_log.sql`:

```sql
CREATE TABLE IF NOT EXISTS events_log (
  id          SERIAL PRIMARY KEY,
  order_id    TEXT,
  event_type  TEXT NOT NULL,
  payload     JSONB NOT NULL,
  received_at TIMESTAMPTZ DEFAULT NOW()
);
```

> **Learning note:** `JSONB` stores JSON as a parsed binary format in PostgreSQL. It supports indexing and fast key lookups, unlike `TEXT`. We store the full Keeta payload in `raw_payload` and `events_log.payload` so we always have the original data — even if we later change how we parse it.

- [ ] **Step 3: Create `backend/src/db/migrate.js`**

```js
import { readdir, readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { pool } from './index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function migrate() {
  // Create a tracking table if it doesn't exist
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename   TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  const dir = join(__dirname, 'migrations');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    const { rows } = await pool.query(
      'SELECT 1 FROM _migrations WHERE filename = $1',
      [file]
    );
    if (rows.length > 0) continue; // already applied

    const sql = await readFile(join(dir, file), 'utf8');
    await pool.query(sql);
    await pool.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
    console.log(`Applied migration: ${file}`);
  }

  console.log('Migrations up to date.');
}
```

> **Learning note:** This is a hand-rolled migration runner — roughly 25 lines of plain Node.js. It reads SQL files in alphabetical order, runs any that haven't been applied yet, and records them in `_migrations`. No migration framework needed for a project this size.

- [ ] **Step 4: Verify the DB layer starts correctly**

Start the DB container and run the backend:

```bash
# In one terminal
docker-compose up db

# In another terminal (wait for DB to be ready first)
cd backend
DATABASE_URL=postgres://pdv:pdv@localhost:5432/pdv \
KEETA_CLIENT_ID=test \
KEETA_CLIENT_SECRET=test \
node src/index.js
```

Expected output:
```
Applied migration: 001_create_orders.sql
Applied migration: 002_create_order_items.sql
Applied migration: 003_create_events_log.sql
Migrations up to date.
PDV backend running on port 3000
```

Running again should show only `Migrations up to date.` (idempotent).

- [ ] **Step 5: Stop the test server (Ctrl+C) and commit**

```bash
git add backend/src/db/ backend/src/index.js
git commit -m "feat: database layer — pool, migrations, schema"
```

---

## Task 4: SSE Manager

**Files:**
- Create: `backend/src/services/sseManager.js`
- Create: `backend/src/routes/sse.js`
- Test: `backend/src/__tests__/services/sseManager.test.js`

- [ ] **Step 1: Write test for `sseManager`**

Create `backend/src/__tests__/services/sseManager.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';
import { sseManager } from '../../services/sseManager.js';

function mockRes() {
  return { write: vi.fn(), end: vi.fn() };
}

describe('sseManager', () => {
  it('pushes a message to all connected clients', () => {
    const res1 = mockRes();
    const res2 = mockRes();

    sseManager.add(res1);
    sseManager.add(res2);
    sseManager.push('order:new', { id: 'abc' });

    expect(res1.write).toHaveBeenCalledWith(
      'event: order:new\ndata: {"id":"abc"}\n\n'
    );
    expect(res2.write).toHaveBeenCalledWith(
      'event: order:new\ndata: {"id":"abc"}\n\n'
    );

    // Clean up
    sseManager.remove(res1);
    sseManager.remove(res2);
  });

  it('does not push to removed clients', () => {
    const res = mockRes();
    sseManager.add(res);
    sseManager.remove(res);
    sseManager.push('order:new', { id: 'abc' });

    expect(res.write).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test — expect failure**

```bash
cd backend && npm test
```

Expected: FAIL — `sseManager.js` does not exist.

- [ ] **Step 3: Create `backend/src/services/sseManager.js`**

```js
const clients = new Set();

export const sseManager = {
  add(res) {
    clients.add(res);
  },
  remove(res) {
    clients.delete(res);
  },
  push(event, data) {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of clients) {
      res.write(message);
    }
  },
};
```

> **Learning note:** SSE messages have a specific text format: `event: <name>\ndata: <json>\n\n`. The double newline signals the end of an event. The browser's `EventSource` API parses this format automatically and fires event listeners by name (e.g., `es.addEventListener('order:new', handler)`).

- [ ] **Step 4: Run test — expect pass**

```bash
cd backend && npm test
```

Expected: PASS

- [ ] **Step 5: Create `backend/src/routes/sse.js`**

```js
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
```

- [ ] **Step 6: Register the route in `backend/src/index.js`**

```js
import express from 'express';
import { config } from './config.js';
import { migrate } from './db/migrate.js';
import { sseRouter } from './routes/sse.js';

const app = express();
app.use(express.json());

app.use(sseRouter);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

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
```

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/sseManager.js backend/src/routes/sse.js backend/src/index.js backend/src/__tests__/
git commit -m "feat: SSE manager and /events endpoint"
```

---

## Task 5: Keeta OAuth Service

**Files:**
- Create: `backend/src/services/keeta.js`
- Test: `backend/src/__tests__/services/keeta.test.js`

- [ ] **Step 1: Write tests for `keeta.js`**

Create `backend/src/__tests__/services/keeta.test.js`:

```js
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
```

- [ ] **Step 2: Run test — expect failure**

```bash
cd backend && npm test
```

Expected: FAIL — `keeta.js` does not exist.

- [ ] **Step 3: Create `backend/src/services/keeta.js`**

```js
import { config } from '../config.js';

// In-memory token cache — survives the lifetime of the process
let tokenCache = null;

async function getToken() {
  // Return cached token if it has more than 60 seconds left
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.token;
  }

  const res = await fetch(`${config.keetaBaseUrl}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'app_level_token',
      client_id: config.keetaClientId,
      client_secret: config.keetaClientSecret,
    }),
  });

  if (!res.ok) {
    throw new Error(`Keeta auth failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return tokenCache.token;
}

async function keetaRequest(method, path) {
  const token = await getToken();
  const res = await fetch(`${config.keetaBaseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`Keeta API error ${res.status}: ${text}`);
    err.status = res.status;
    throw err;
  }

  return res.json();
}

export const keetaService = {
  confirmOrder: (orderId) => keetaRequest('POST', `/v1/orders/${orderId}/confirm`),
  readyForPickup: (orderId) => keetaRequest('POST', `/v1/orders/${orderId}/readyForPickup`),
  requestCancellation: (orderId) => keetaRequest('POST', `/v1/orders/${orderId}/requestCancellation`),
  acceptRefund: (orderId) => keetaRequest('POST', `/v1/orders/${orderId}/acceptRefund`),
  rejectRefund: (orderId) => keetaRequest('POST', `/v1/orders/${orderId}/rejectRefund`),
};
```

> **Learning note:** `app_level_token` is valid for a fixed duration (usually 1 hour). We cache it in a module-level variable and only refresh when it's close to expiring. This avoids hitting the auth endpoint on every single API call.

- [ ] **Step 4: Run tests — expect pass**

```bash
cd backend && npm test
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/keeta.js backend/src/__tests__/services/keeta.test.js
git commit -m "feat: Keeta OAuth service with token caching"
```

---

## Task 6: Orders Service

**Files:**
- Create: `backend/src/services/orders.js`
- Test: `backend/src/__tests__/services/orders.test.js`

- [ ] **Step 1: Write tests for `orders.js`**

Create `backend/src/__tests__/services/orders.test.js`:

```js
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
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd backend && npm test
```

Expected: FAIL — `orders.js` does not exist.

- [ ] **Step 3: Create `backend/src/services/orders.js`**

```js
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
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd backend && npm test
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/orders.js backend/src/__tests__/services/orders.test.js
git commit -m "feat: orders service — state transitions, DB writes, SSE push"
```

---

## Task 7: Webhook Route

**Files:**
- Create: `backend/src/routes/webhook.js`
- Test: `backend/src/__tests__/routes/webhook.test.js`

- [ ] **Step 1: Write tests for the webhook route**

Create `backend/src/__tests__/routes/webhook.test.js`:

```js
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
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd backend && npm test
```

Expected: FAIL — `webhook.js` does not exist.

- [ ] **Step 3: Create `backend/src/routes/webhook.js`**

```js
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
      // Keeta notifies us when their rider has picked up the order and it's delivered.
      // NOTE: verify the exact event type name against your Keeta Developer Portal
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
```

> **Learning note:** We call `res.json(...)` before any async work. Express sends the response as soon as you call it — the function continues running after that. This pattern (respond fast, process async) is standard for webhooks where the sender has a strict timeout.

- [ ] **Step 4: Register the webhook route in `backend/src/index.js`**

```js
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
```

- [ ] **Step 5: Run tests — expect pass**

```bash
cd backend && npm test
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/webhook.js backend/src/index.js backend/src/__tests__/routes/webhook.test.js
git commit -m "feat: webhook route — receives Keeta events, async processing"
```

---

## Task 8: Orders Routes

**Files:**
- Create: `backend/src/routes/orders.js`
- Test: `backend/src/__tests__/routes/orders.test.js`

- [ ] **Step 1: Write tests for the orders routes**

Create `backend/src/__tests__/routes/orders.test.js`:

```js
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
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd backend && npm test
```

Expected: FAIL — `routes/orders.js` does not exist.

- [ ] **Step 3: Create `backend/src/routes/orders.js`**

```js
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
```

- [ ] **Step 4: Register orders route in `backend/src/index.js`**

```js
import express from 'express';
import { config } from './config.js';
import { migrate } from './db/migrate.js';
import { sseRouter } from './routes/sse.js';
import { webhookRouter } from './routes/webhook.js';
import { ordersRouter } from './routes/orders.js';

const app = express();
app.use(express.json());

app.use(sseRouter);
app.use(webhookRouter);
app.use(ordersRouter);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

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
```

- [ ] **Step 5: Run all backend tests — expect pass**

```bash
cd backend && npm test
```

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/orders.js backend/src/index.js backend/src/__tests__/routes/orders.test.js
git commit -m "feat: order action routes — confirm, ready, cancel, refund"
```

---

## Task 9: Backend Dockerfile

**Files:**
- Create: `backend/Dockerfile`

- [ ] **Step 1: Create `backend/Dockerfile`**

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src/ ./src/

EXPOSE 3000

CMD ["node", "src/index.js"]
```

- [ ] **Step 2: Verify the image builds**

```bash
cd backend && docker build -t pdv-backend .
```

Expected: Build completes without errors.

- [ ] **Step 3: Commit**

```bash
git add backend/Dockerfile
git commit -m "feat: backend Dockerfile"
```

---

## Task 10: Frontend Setup

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/vite.config.js`
- Create: `frontend/src/main.jsx`
- Create: `frontend/src/App.jsx`

- [ ] **Step 1: Create `frontend/package.json`**

```json
{
  "name": "alhofritopdv-frontend",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.1",
    "@testing-library/react": "^16.0.0",
    "@testing-library/jest-dom": "^6.4.0",
    "@testing-library/user-event": "^14.5.0",
    "jsdom": "^24.0.0",
    "vite": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

```bash
cd frontend && npm install
```

- [ ] **Step 3: Create `frontend/vite.config.js`**

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/setupTests.js',
  },
  server: {
    proxy: {
      // In development, Vite forwards /api/* requests to the Express backend
      '/api': {
        target: 'http://localhost:3000',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
```

> **Learning note:** The Vite proxy rewrites `/api/orders` → `/orders` when forwarding to Express. In production, nginx does the same rewrite. This means the frontend always uses `/api/*` URLs, and both environments handle the routing transparently.

- [ ] **Step 4: Create `frontend/src/setupTests.js`**

```js
import '@testing-library/jest-dom';
```

- [ ] **Step 5: Create a minimal `frontend/index.html`**

```html
<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>PDV</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Create `frontend/src/main.jsx`**

```jsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 7: Create `frontend/src/App.jsx` (skeleton)**

```jsx
export default function App() {
  return <div><h1>PDV</h1></div>;
}
```

- [ ] **Step 8: Verify it runs**

```bash
cd frontend && npm run dev
```

Open `http://localhost:5173` — should show "PDV".

- [ ] **Step 9: Commit**

```bash
git add frontend/
git commit -m "feat: React + Vite frontend scaffold"
```

---

## Task 11: useSSE Hook

**Files:**
- Create: `frontend/src/hooks/useSSE.js`
- Test: `frontend/src/__tests__/hooks/useSSE.test.js`

- [ ] **Step 1: Write test for `useSSE`**

Create `frontend/src/__tests__/hooks/useSSE.test.js`:

```js
import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useSSE } from '../../hooks/useSSE.js';

describe('useSSE', () => {
  let mockES;

  beforeEach(() => {
    mockES = {
      addEventListener: vi.fn(),
      close: vi.fn(),
      onerror: null,
    };
    vi.stubGlobal('EventSource', vi.fn(() => mockES));
  });

  it('opens an EventSource connection to the given URL', () => {
    renderHook(() => useSSE('/api/events', vi.fn(), vi.fn()));
    expect(EventSource).toHaveBeenCalledWith('/api/events');
  });

  it('registers listeners for order:new and order:updated', () => {
    renderHook(() => useSSE('/api/events', vi.fn(), vi.fn()));
    const events = mockES.addEventListener.mock.calls.map((c) => c[0]);
    expect(events).toContain('order:new');
    expect(events).toContain('order:updated');
  });

  it('closes the connection on unmount', () => {
    const { unmount } = renderHook(() => useSSE('/api/events', vi.fn(), vi.fn()));
    unmount();
    expect(mockES.close).toHaveBeenCalled();
  });

  it('calls onReconnect when an error occurs', () => {
    const onReconnect = vi.fn();
    renderHook(() => useSSE('/api/events', vi.fn(), onReconnect));
    mockES.onerror();
    expect(onReconnect).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test — expect failure**

```bash
cd frontend && npm test
```

Expected: FAIL — `useSSE.js` does not exist.

- [ ] **Step 3: Create `frontend/src/hooks/useSSE.js`**

```js
import { useEffect } from 'react';

export function useSSE(url, onMessage, onReconnect) {
  useEffect(() => {
    const es = new EventSource(url);

    es.addEventListener('order:new', (e) => {
      onMessage('order:new', JSON.parse(e.data));
    });

    es.addEventListener('order:updated', (e) => {
      onMessage('order:updated', JSON.parse(e.data));
    });

    es.onerror = () => {
      // EventSource reconnects automatically — we call onReconnect to resync state
      if (onReconnect) onReconnect();
    };

    return () => es.close();
  }, [url]); // eslint-disable-line react-hooks/exhaustive-deps
}
```

> **Learning note:** The `useEffect` cleanup function (the `return () => es.close()`) runs when the component unmounts. This prevents a memory leak — without it, the `EventSource` connection would stay open even after the component is removed from the page.

- [ ] **Step 4: Run tests — expect pass**

```bash
cd frontend && npm test
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/ frontend/src/__tests__/
git commit -m "feat: useSSE hook for real-time order updates"
```

---

## Task 12: KanbanBoard and OrderColumn

**Files:**
- Create: `frontend/src/components/KanbanBoard.jsx`
- Create: `frontend/src/components/OrderColumn.jsx`
- Test: `frontend/src/__tests__/components/KanbanBoard.test.jsx`

- [ ] **Step 1: Write test**

Create `frontend/src/__tests__/components/KanbanBoard.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { KanbanBoard } from '../../components/KanbanBoard.jsx';

const orders = [
  { id: 'a1', status: 'PLACED', items: [], total_price: '10.00' },
  { id: 'a2', status: 'CONFIRMED', items: [], total_price: '20.00' },
  { id: 'a3', status: 'READY', items: [], total_price: '30.00' },
];

describe('KanbanBoard', () => {
  it('renders three columns', () => {
    render(<KanbanBoard orders={orders} onUpdate={() => {}} />);
    expect(screen.getByText(/Placed/i)).toBeInTheDocument();
    expect(screen.getByText(/Confirmed/i)).toBeInTheDocument();
    expect(screen.getByText(/Ready/i)).toBeInTheDocument();
  });

  it('puts each order in the correct column', () => {
    render(<KanbanBoard orders={orders} onUpdate={() => {}} />);
    // Each column shows its count
    expect(screen.getByText('Placed (1)')).toBeInTheDocument();
    expect(screen.getByText('Confirmed (1)')).toBeInTheDocument();
    expect(screen.getByText('Ready (1)')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test — expect failure**

```bash
cd frontend && npm test
```

Expected: FAIL — components do not exist.

- [ ] **Step 3: Create `frontend/src/components/OrderColumn.jsx`**

```jsx
import { OrderCard } from './OrderCard.jsx';

export function OrderColumn({ title, orders, onUpdate }) {
  return (
    <div style={{ flex: 1, minWidth: 0, padding: '0 0.5rem' }}>
      <h2 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>
        {title} ({orders.length})
      </h2>
      <div>
        {orders.map((order) => (
          <OrderCard key={order.id} order={order} onUpdate={onUpdate} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create `frontend/src/components/KanbanBoard.jsx`**

```jsx
import { OrderColumn } from './OrderColumn.jsx';

export function KanbanBoard({ orders, onUpdate }) {
  const byStatus = (status) => orders.filter((o) => o.status === status);

  return (
    <div style={{ display: 'flex', gap: '1rem', padding: '1rem', alignItems: 'flex-start' }}>
      <OrderColumn title="Placed"     orders={byStatus('PLACED')}    onUpdate={onUpdate} />
      <OrderColumn title="Confirmed"  orders={byStatus('CONFIRMED')} onUpdate={onUpdate} />
      <OrderColumn title="Ready"      orders={byStatus('READY')}     onUpdate={onUpdate} />
    </div>
  );
}
```

- [ ] **Step 5: Create a stub `frontend/src/components/OrderCard.jsx`** (needed by OrderColumn; full version in next task)

```jsx
export function OrderCard({ order }) {
  return <div data-testid="order-card">{order.id}</div>;
}
```

- [ ] **Step 6: Run tests — expect pass**

```bash
cd frontend && npm test
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/KanbanBoard.jsx frontend/src/components/OrderColumn.jsx frontend/src/components/OrderCard.jsx frontend/src/__tests__/components/
git commit -m "feat: KanbanBoard and OrderColumn components"
```

---

## Task 13: OrderCard Component

**Files:**
- Modify: `frontend/src/components/OrderCard.jsx`
- Test: `frontend/src/__tests__/components/OrderCard.test.jsx`

- [ ] **Step 1: Write test**

Create `frontend/src/__tests__/components/OrderCard.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrderCard } from '../../components/OrderCard.jsx';

const baseOrder = {
  id: 'abc123def456',
  total_price: '42.50',
  items: [{ name: 'X-Burger', quantity: 1, notes: 'sem cebola' }],
};

describe('OrderCard', () => {
  it('renders order items and total', () => {
    render(<OrderCard order={{ ...baseOrder, status: 'PLACED' }} onUpdate={() => {}} />);
    expect(screen.getByText(/X-Burger/)).toBeInTheDocument();
    expect(screen.getByText(/sem cebola/)).toBeInTheDocument();
    expect(screen.getByText(/42\.50/)).toBeInTheDocument();
  });

  it('shows Confirm and Cancel for PLACED orders', () => {
    render(<OrderCard order={{ ...baseOrder, status: 'PLACED' }} onUpdate={() => {}} />);
    expect(screen.getByRole('button', { name: /confirm/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  it('shows Mark Ready and Cancel for CONFIRMED orders', () => {
    render(<OrderCard order={{ ...baseOrder, status: 'CONFIRMED' }} onUpdate={() => {}} />);
    expect(screen.getByRole('button', { name: /mark ready/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  it('shows no action buttons for READY orders', () => {
    render(<OrderCard order={{ ...baseOrder, status: 'READY' }} onUpdate={() => {}} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('calls the confirm API and then onUpdate on success', async () => {
    const onUpdate = vi.fn();
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });

    render(<OrderCard order={{ ...baseOrder, status: 'PLACED' }} onUpdate={onUpdate} />);
    await userEvent.click(screen.getByRole('button', { name: /confirm/i }));

    expect(fetch).toHaveBeenCalledWith('/api/orders/abc123def456/confirm', { method: 'POST' });
    expect(onUpdate).toHaveBeenCalled();
  });

  it('shows an error message when the action fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Invalid transition' }),
    });

    render(<OrderCard order={{ ...baseOrder, status: 'PLACED' }} onUpdate={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /confirm/i }));

    expect(screen.getByText(/Invalid transition/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test — expect failure**

```bash
cd frontend && npm test
```

Expected: FAIL — stub `OrderCard` doesn't have the real implementation.

- [ ] **Step 3: Replace `frontend/src/components/OrderCard.jsx` with full implementation**

```jsx
import { useState } from 'react';

export function OrderCard({ order, onUpdate }) {
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(null);

  async function doAction(type) {
    setLoading(type);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${order.id}/${type}`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? 'Action failed');
      } else {
        onUpdate();
      }
    } catch {
      setError('Network error — check your connection');
    } finally {
      setLoading(null);
    }
  }

  const items = Array.isArray(order.items) ? order.items.filter(Boolean) : [];

  return (
    <div style={{ border: '1px solid #ccc', borderRadius: 8, padding: '0.75rem', marginBottom: '0.5rem' }}>
      <p style={{ margin: '0 0 0.25rem', fontWeight: 'bold', fontSize: '0.8rem', opacity: 0.6 }}>
        #{order.id.slice(-6)}
      </p>
      <ul style={{ margin: '0 0 0.5rem', padding: '0 0 0 1.1rem' }}>
        {items.map((item, i) => (
          <li key={i}>
            {item.quantity}× {item.name}
            {item.notes ? <span style={{ opacity: 0.6 }}> ({item.notes})</span> : null}
          </li>
        ))}
      </ul>
      <p style={{ margin: '0 0 0.5rem', fontWeight: 'bold' }}>
        R$ {Number(order.total_price).toFixed(2)}
      </p>
      {error && (
        <p style={{ color: 'red', margin: '0 0 0.5rem', fontSize: '0.85rem' }}>{error}</p>
      )}
      {order.status === 'PLACED' && (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={() => doAction('confirm')} disabled={!!loading}>Confirm</button>
          <button onClick={() => doAction('cancel')}  disabled={!!loading}>Cancel</button>
        </div>
      )}
      {order.status === 'CONFIRMED' && (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={() => doAction('ready')}  disabled={!!loading}>Mark Ready</button>
          <button onClick={() => doAction('cancel')} disabled={!!loading}>Cancel</button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd frontend && npm test
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/OrderCard.jsx frontend/src/__tests__/components/OrderCard.test.jsx
git commit -m "feat: OrderCard component with action buttons and error state"
```

---

## Task 14: RefundBanner

**Files:**
- Create: `frontend/src/components/RefundBanner.jsx`
- Test: `frontend/src/__tests__/components/RefundBanner.test.jsx`

- [ ] **Step 1: Write test**

Create `frontend/src/__tests__/components/RefundBanner.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { RefundBanner } from '../../components/RefundBanner.jsx';

const pendingOrders = [
  { id: 'abc123def456', total_price: '55.00', refund_status: 'PENDING' },
];

describe('RefundBanner', () => {
  it('renders nothing when there are no pending refunds', () => {
    const { container } = render(<RefundBanner orders={[]} onUpdate={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows order info and Accept/Reject buttons for each pending refund', () => {
    render(<RefundBanner orders={pendingOrders} onUpdate={() => {}} />);
    expect(screen.getByText(/def456/i)).toBeInTheDocument();
    expect(screen.getByText(/55\.00/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /accept/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reject/i })).toBeInTheDocument();
  });

  it('calls acceptRefund endpoint and onUpdate when Accept is clicked', async () => {
    const onUpdate = vi.fn();
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });

    render(<RefundBanner orders={pendingOrders} onUpdate={onUpdate} />);
    await userEvent.click(screen.getByRole('button', { name: /accept/i }));

    expect(fetch).toHaveBeenCalledWith('/api/orders/abc123def456/acceptRefund', { method: 'POST' });
    expect(onUpdate).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test — expect failure**

```bash
cd frontend && npm test
```

Expected: FAIL — `RefundBanner.jsx` does not exist.

- [ ] **Step 3: Create `frontend/src/components/RefundBanner.jsx`**

```jsx
import { useState } from 'react';

export function RefundBanner({ orders, onUpdate }) {
  const [loading, setLoading] = useState(null);
  const [errors, setErrors] = useState({});

  if (!orders.length) return null;

  async function doAction(orderId, type) {
    setLoading(`${orderId}:${type}`);
    try {
      const res = await fetch(`/api/orders/${orderId}/${type}`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        setErrors((prev) => ({ ...prev, [orderId]: data.error ?? 'Action failed' }));
      } else {
        setErrors((prev) => { const next = { ...prev }; delete next[orderId]; return next; });
        onUpdate();
      }
    } catch {
      setErrors((prev) => ({ ...prev, [orderId]: 'Network error' }));
    } finally {
      setLoading(null);
    }
  }

  return (
    <div style={{ background: '#fff3cd', borderBottom: '2px solid #ffc107', padding: '0.75rem 1rem' }}>
      <strong>Pending Refund Requests</strong>
      {orders.map((order) => (
        <div key={order.id} style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginTop: '0.5rem' }}>
          <span>Order #{order.id.slice(-6)} — R$ {Number(order.total_price).toFixed(2)}</span>
          {errors[order.id] && <span style={{ color: 'red' }}>{errors[order.id]}</span>}
          <button
            onClick={() => doAction(order.id, 'acceptRefund')}
            disabled={!!loading}
          >
            Accept
          </button>
          <button
            onClick={() => doAction(order.id, 'rejectRefund')}
            disabled={!!loading}
          >
            Reject
          </button>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd frontend && npm test
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/RefundBanner.jsx frontend/src/__tests__/components/RefundBanner.test.jsx
git commit -m "feat: RefundBanner component for pending refund requests"
```

---

## Task 15: App.jsx (Complete)

**Files:**
- Modify: `frontend/src/App.jsx`
- Test: `frontend/src/__tests__/App.test.jsx`

- [ ] **Step 1: Write test**

Create `frontend/src/__tests__/App.test.jsx`:

```jsx
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stub useSSE so it doesn't try to open a real EventSource
vi.mock('../hooks/useSSE.js', () => ({ useSSE: vi.fn() }));

describe('App', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { id: 'ord-placed', status: 'PLACED', items: [], total_price: '10.00' },
      ],
    });
  });

  it('fetches orders on mount and renders the kanban board', async () => {
    const { default: App } = await import('../App.jsx');
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Placed (1)')).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run test — expect failure**

```bash
cd frontend && npm test
```

Expected: FAIL — `App.jsx` is still a skeleton.

- [ ] **Step 3: Replace `frontend/src/App.jsx` with full implementation**

```jsx
import { useState, useEffect, useCallback } from 'react';
import { KanbanBoard } from './components/KanbanBoard.jsx';
import { RefundBanner } from './components/RefundBanner.jsx';
import { useSSE } from './hooks/useSSE.js';

export default function App() {
  const [orders, setOrders] = useState([]);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch('/api/orders');
      const data = await res.json();
      setOrders(data);
    } catch (err) {
      console.error('Failed to fetch orders:', err);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useSSE(
    '/api/events',
    (type, order) => {
      setOrders((prev) => {
        if (type === 'order:new') return [...prev, order];
        if (type === 'order:updated') return prev.map((o) => (o.id === order.id ? order : o));
        return prev;
      });
    },
    fetchOrders // called on SSE reconnect to fill any missed events
  );

  const activeOrders = orders.filter((o) =>
    ['PLACED', 'CONFIRMED', 'READY'].includes(o.status)
  );
  const refundPending = orders.filter((o) => o.refund_status === 'PENDING');

  return (
    <div>
      <header style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #ddd', fontWeight: 'bold' }}>
        PDV — Gestão de Pedidos
      </header>
      <RefundBanner orders={refundPending} onUpdate={fetchOrders} />
      <KanbanBoard orders={activeOrders} onUpdate={fetchOrders} />
    </div>
  );
}
```

- [ ] **Step 4: Run all frontend tests — expect pass**

```bash
cd frontend && npm test
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.jsx frontend/src/__tests__/App.test.jsx
git commit -m "feat: App.jsx — state management, SSE integration, full kanban render"
```

---

## Task 16: Frontend Dockerfile and nginx

**Files:**
- Create: `frontend/Dockerfile`
- Create: `frontend/nginx.conf`

- [ ] **Step 1: Create `frontend/nginx.conf`**

```nginx
server {
    listen 80;

    # Proxy all /api/* requests to the Express backend
    # proxy_buffering off is critical for SSE — without it, nginx buffers the stream
    # and events never reach the browser
    location /api/ {
        proxy_pass         http://app:3000/;
        proxy_http_version 1.1;
        proxy_set_header   Connection '';
        proxy_buffering    off;
        proxy_cache        off;
        proxy_read_timeout 3600s;
    }

    # Serve the React SPA — try the exact file, fall back to index.html
    # The fallback is what makes React Router work (if added later)
    location / {
        root       /usr/share/nginx/html;
        try_files  $uri /index.html;
    }
}
```

> **Learning note:** `proxy_buffering off` is essential for SSE. By default, nginx buffers responses from upstream servers before sending them to the client. This breaks SSE because the browser never receives the events until the buffer fills. Turning it off makes nginx forward each chunk immediately.

- [ ] **Step 2: Create `frontend/Dockerfile`**

```dockerfile
# Stage 1: build the React app
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: serve with nginx
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

> **Learning note:** This is a multi-stage build. The first stage (node:20-alpine) installs dependencies and compiles the React app. The second stage (nginx:alpine) only copies the compiled output — no Node.js, no source code, no dev dependencies in the final image. This makes the image much smaller and more secure.

- [ ] **Step 3: Build the frontend image to verify**

```bash
cd frontend && docker build -t pdv-frontend .
```

Expected: Build completes without errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/Dockerfile frontend/nginx.conf
git commit -m "feat: frontend Dockerfile with multi-stage build and nginx"
```

---

## Task 17: Full Stack Integration Test

This task verifies the complete system works end to end using Docker Compose.

- [ ] **Step 1: Create a `.env` file from the example**

```bash
cp .env.example .env
```

Edit `.env` and fill in your Keeta credentials:

```
KEETA_CLIENT_ID=<your client id from Keeta Developer Portal>
KEETA_CLIENT_SECRET=<your client secret>
```

Leave `DATABASE_URL` as-is — docker-compose sets it via the `environment` block.

- [ ] **Step 2: Start the full stack**

```bash
docker-compose up --build
```

Expected: All three services start. The backend logs show migrations applied and server running on port 3000. nginx starts on port 80.

- [ ] **Step 3: Verify the health endpoint**

```bash
curl http://localhost:3000/health
```

Expected: `{"status":"ok"}`

- [ ] **Step 4: Open the PDV in the browser**

Open `http://localhost:80` — should show the PDV header and three empty Kanban columns.

- [ ] **Step 5: Set up ngrok and register the webhook**

```bash
ngrok http 3000
```

Copy the HTTPS URL (e.g., `https://abc123.ngrok.io`). In the [Keeta Developer Portal](https://api-docs.mykeeta.com/apis/opendelivery):

1. Register your webhook URL as `https://abc123.ngrok.io/webhook`
2. Enable event types: `ORDER_CREATED`, `ORDER_CANCELLED`, `REFUND_REQUESTED`

- [ ] **Step 6: Send a test webhook to verify the flow**

Simulate a new order event by posting to your local server directly:

```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "ORDER_CREATED",
    "orderId": "test-order-001",
    "createdAt": "2026-03-25T12:00:00Z",
    "orderAmount": { "value": 42.50 },
    "payments": [{ "method": "CREDIT_CARD" }],
    "customer": { "name": "Test Customer" },
    "items": [
      { "name": "X-Burger", "quantity": 1, "unitPrice": { "value": 32.50 }, "observations": "sem cebola" },
      { "name": "Batata Frita G", "quantity": 1, "unitPrice": { "value": 10.00 }, "observations": null }
    ]
  }'
```

Expected:
- Response: `{"received":true}`
- The PDV browser (http://localhost) shows a new card in the **Placed** column with the order items

- [ ] **Step 7: Test the confirm action**

Click **Confirm** on the order card in the browser.

Expected:
- The card moves to the **Confirmed** column
- Backend logs show the Keeta API being called (will fail with auth error if using test credentials — the state transition in DB still occurs)

- [ ] **Step 8: Commit**

```bash
git add .
git commit -m "chore: verified full stack integration — all services running"
```

---

## Development Workflow Reference

After initial setup, the typical dev workflow is:

```bash
# Start the database only via Docker
docker-compose up db

# Run the backend with file watching (auto-restarts on changes)
cd backend && npm run dev

# Run the frontend dev server (hot reload)
cd frontend && npm run dev

# Run all backend tests
cd backend && npm test

# Run all frontend tests
cd frontend && npm test
```

The PDV is available at `http://localhost:5173` in dev mode (Vite). The API is at `http://localhost:3000`.
