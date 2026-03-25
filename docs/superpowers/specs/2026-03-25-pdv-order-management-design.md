# PDV Order Management System — Design Spec

**Date:** 2026-03-25
**Scope:** Iteration 1 — Order reception and management via Keeta OpenDelivery API
**Future iterations (out of scope here):** Menu integration, working hours management

---

## 1. What We Are Building

A browser-based Point of Sale (PDV) system for a single restaurant to receive and manage delivery orders from the Keeta platform. Staff open the PDV in a browser on a desktop or laptop, see incoming orders in real time, and advance them through their lifecycle (confirm → ready → done) or cancel them when needed.

The system integrates with [Keeta's OpenDelivery API](https://api-docs.mykeeta.com/apis/opendelivery). Keeta is the delivery marketplace — it sends orders to us, and we call back to Keeta to report status changes.

---

## 2. Architecture

### Overview

```
[Keeta Platform]
      |
      | HTTP POST (webhook events)
      ▼
[ngrok tunnel]  ← dev only: exposes localhost to the internet
      |
      ▼
[Express Server — Node.js]  ← backend container (port 3000)
      |              |
      |              | reads/writes
      |              ▼
      |        [PostgreSQL 16]  ← db container (port 5432, internal only)
      |
      | SSE (server-sent events, push)
      | REST (order actions: confirm, ready, cancel)
      ▼
[React SPA — Vite]  ← frontend container (nginx, port 80)
```

### Why This Architecture

- **Webhook + SSE** over polling: Keeta pushes orders to us instantly. SSE forwards them to the browser the moment they arrive — no polling lag, no wasted requests.
- **SSE over WebSockets**: SSE is a built-in browser API, one-directional (server → browser), and much simpler to implement. It's the right tool for this use case — the browser only needs to receive updates, not send them via a persistent socket.
- **Raw SQL with `pg`** over an ORM: keeps the data layer transparent and easy to read, which is valuable for learning. Queries are co-located with the logic that uses them.
- **Docker Compose**: three services (`app`, `frontend`, `db`) orchestrated together. One command to start the whole stack.

### Docker Compose Services

| Service    | Image              | Port (host) | Notes                          |
|------------|--------------------|-------------|--------------------------------|
| `db`       | postgres:16-alpine | —           | Internal only, not exposed     |
| `app`      | custom Dockerfile  | 3000        | Express + migrations on start  |
| `frontend` | custom Dockerfile  | 80          | nginx serving React build      |

In **development**, the React app runs via Vite's dev server on port 5173 (outside Docker), with all `/api/*` requests proxied to Express on port 3000. This gives hot-reload without rebuilding the Docker image on every frontend change.

In **production** (or staging), `docker-compose up` starts all three services. The React app is pre-built into static files and served by nginx.

---

## 3. Backend

### Technology

- **Runtime:** Node.js (LTS)
- **Framework:** Express
- **Database client:** `pg` (node-postgres) — raw SQL, no ORM
- **Authentication with Keeta:** OAuth2, `app_level_token` grant type. A single `clientId`/`clientSecret` pair is issued per software integration. Tokens are cached in memory and refreshed before expiry.

### Project Structure

```
backend/
├── Dockerfile
├── package.json
└── src/
    ├── index.js              # Express app setup, starts server
    ├── config.js             # Reads and validates env vars
    ├── db/
    │   ├── index.js          # Creates and exports the pg connection pool
    │   └── migrations/       # Numbered .sql files, run in order on startup
    │       ├── 001_orders.sql
    │       └── 002_events_log.sql
    ├── routes/
    │   ├── webhook.js        # POST /webhook
    │   ├── orders.js         # GET /orders, POST /orders/:id/:action
    │   └── sse.js            # GET /events
    └── services/
        ├── keeta.js          # Keeta API client: auth + order actions
        └── orders.js         # Business logic: state transitions, DB writes, SSE push
```

### API Endpoints

| Method | Path                        | Description                                              |
|--------|-----------------------------|----------------------------------------------------------|
| POST   | `/webhook`                  | Receives all Keeta event notifications                   |
| GET    | `/events`                   | SSE stream — browser subscribes here for real-time push  |
| GET    | `/orders`                   | Returns all active orders (PLACED/CONFIRMED/READY) + DONE orders with `refund_status = PENDING` |
| POST   | `/orders/:id/confirm`       | Operator confirms order; calls Keeta confirm API         |
| POST   | `/orders/:id/ready`         | Operator marks order ready; calls Keeta readyForPickup   |
| POST   | `/orders/:id/cancel`        | Operator requests cancellation; calls Keeta cancel API   |
| POST   | `/orders/:id/acceptRefund`  | Operator accepts a refund request from Keeta             |
| POST   | `/orders/:id/rejectRefund`  | Operator rejects a refund request from Keeta             |

### Keeta Webhook Events Handled

| Event type           | What we do                                                  |
|----------------------|-------------------------------------------------------------|
| New order            | Insert into `orders` + `order_items`, push SSE to browser  |
| Order cancelled (by Keeta) | Update order status to `CANCELLED`, push SSE         |
| Refund request       | Update order with refund flag, push SSE                     |

All other event types are logged to `events_log` and ignored.

### Keeta OAuth Flow

1. On startup, `services/keeta.js` calls `POST /oauth/token` with `grant_type: app_level_token` using `clientId` and `clientSecret` from env vars.
2. The resulting access token is cached in memory with its expiry timestamp.
3. Before every Keeta API call, the token is checked. If it's within 60 seconds of expiry, it is refreshed automatically.
4. All Keeta requests include `Authorization: Bearer <token>`.

> **Learning note:** The `app_level_token` grant type gives access to all stores authorised under the integration. For this project we only have one store, so this is the simplest path. The `shop_level_authorization_code` flow (which issues refresh tokens per store) is the alternative used when building a multi-tenant SaaS.

---

## 4. Database

### Schema

**`orders` table**

| Column          | Type        | Notes                                              |
|-----------------|-------------|----------------------------------------------------|
| `id`            | TEXT PK     | Keeta's orderId                                    |
| `status`        | TEXT        | PLACED, CONFIRMED, READY, DONE, CANCELLED          |
| `total_price`   | NUMERIC     | Order total in BRL                                 |
| `payment_method`| TEXT        |                                                    |
| `customer_name` | TEXT        | Decrypted from Keeta payload when needed           |
| `raw_payload`   | JSONB       | Full Keeta order payload stored for reference      |
| `placed_at`     | TIMESTAMPTZ | When the order was created on Keeta                |
| `confirmed_at`  | TIMESTAMPTZ | Nullable                                           |
| `ready_at`      | TIMESTAMPTZ | Nullable                                           |
| `done_at`       | TIMESTAMPTZ | Nullable                                           |
| `cancelled_at`  | TIMESTAMPTZ | Nullable                                           |
| `cancel_source` | TEXT        | `PDV` or `KEETA` — set when cancelled              |
| `refund_status` | TEXT        | NULL, PENDING, ACCEPTED, REJECTED                  |
| `created_at`    | TIMESTAMPTZ | Row insertion time                                 |

**`order_items` table**

| Column       | Type    | Notes                    |
|--------------|---------|--------------------------|
| `id`         | SERIAL  | Auto-increment PK        |
| `order_id`   | TEXT FK | References `orders.id`   |
| `name`       | TEXT    | Item name                |
| `quantity`   | INT     |                          |
| `unit_price` | NUMERIC |                          |
| `notes`      | TEXT    | Customer customisations  |

**`events_log` table**

| Column       | Type        | Notes                              |
|--------------|-------------|------------------------------------|
| `id`         | SERIAL      |                                    |
| `order_id`   | TEXT        | May be null for non-order events   |
| `event_type` | TEXT        | Raw event type string from Keeta   |
| `payload`    | JSONB       | Full webhook payload               |
| `received_at`| TIMESTAMPTZ |                                    |

> **Learning note:** `JSONB` in PostgreSQL stores JSON in a binary format that supports indexing and querying. We store the raw payload so we always have the original data, even if we later add columns or change how we parse it. This is a common pattern in event-driven systems.

### Migrations

Migration files live in `backend/src/db/migrations/` and are named with a numeric prefix (`001_`, `002_`, etc.). On startup, the backend runs them in order, skipping any already applied (tracked in a `migrations` table). No migration library is used — this is implemented in ~30 lines of plain JS to keep it transparent.

---

## 5. Frontend

### Technology

- **Framework:** React (via Vite)
- **Styling:** Plain CSS (no CSS framework) — keeps the learning surface focused on React and the integration, not a UI library
- **Real-time:** Native `EventSource` API (SSE) — no library needed
- **HTTP:** Native `fetch` — no Axios

### Component Structure

```
frontend/src/
├── main.jsx
├── App.jsx                   # Fetches initial orders, sets up SSE, manages state
├── hooks/
│   └── useSSE.js             # Encapsulates EventSource lifecycle
└── components/
    ├── KanbanBoard.jsx        # Renders three columns side by side
    ├── OrderColumn.jsx        # Column header + scrollable list of OrderCards
    └── OrderCard.jsx          # One card per order: items, total, action buttons
```

### Kanban Board Layout

Three columns, left to right:

| Column        | Orders shown       | Actions available on each card        |
|---------------|--------------------|---------------------------------------|
| **Placed**    | Status = PLACED    | Confirm, Cancel                       |
| **Confirmed** | Status = CONFIRMED | Mark Ready, Cancel                    |
| **Ready**     | Status = READY     | None (waiting for Keeta rider pickup) |

Above the three columns, a **Refund Requests banner** appears when any order has `refund_status = PENDING`. It lists the order number and total, with Accept and Reject buttons. The banner is hidden when there are no pending refunds.

Cancelled and DONE orders (without pending refunds) disappear from the board. A future iteration can add a History tab.

### Real-time Update Flow

1. On mount, `App.jsx` calls `GET /orders` to load current state.
2. `useSSE.js` opens an `EventSource` connection to `GET /events`.
3. When the server pushes an SSE event (e.g., a new order), `App.jsx` updates its local React state.
4. React re-renders the affected column — the new order card appears without any page reload.
5. If SSE disconnects, `EventSource` reconnects automatically. On reconnect, `App.jsx` refetches `GET /orders` to fill any gap.

> **Learning note:** `EventSource` is a browser API that maintains a persistent HTTP connection and fires events as the server sends them. Unlike WebSockets, it's unidirectional (server → browser only) and uses plain HTTP — no special protocol. The browser handles reconnection automatically.

---

## 6. Order Lifecycle

### State Machine

```
PLACED → CONFIRMED → READY → DONE
  |            |
  └────────────┴──→ CANCELLED
```

Valid transitions:

| From        | To          | Who triggers              | Keeta API call                    |
|-------------|-------------|---------------------------|-----------------------------------|
| PLACED      | CONFIRMED   | Operator (PDV)            | POST /orders/:id/confirm          |
| CONFIRMED   | READY       | Operator (PDV)            | POST /orders/:id/readyForPickup   |
| READY       | DONE        | Keeta (webhook event)     | None                              |
| PLACED      | CANCELLED   | Operator or Keeta         | POST /orders/:id/requestCancellation (if PDV) |
| CONFIRMED   | CANCELLED   | Operator or Keeta         | POST /orders/:id/requestCancellation (if PDV) |

Any other transition (e.g., READY → CONFIRMED) is rejected by the backend with a `400` error.

### Cancellation — Two Sources

**PDV-initiated:**
1. Operator clicks Cancel on a PLACED or CONFIRMED order card
2. Frontend calls `POST /orders/:id/cancel`
3. Backend calls Keeta `requestCancellation`
4. If Keeta approves: status → CANCELLED in DB, SSE event fired, card removed from board
5. If Keeta rejects: status unchanged, error event fired via SSE, card shows an error badge

**Keeta-initiated:**
1. Keeta sends a cancellation webhook to `POST /webhook`
2. Backend immediately responds `200 OK`
3. Async: status → CANCELLED in DB, SSE event fired
4. Card is removed from the board — no operator action required

### Refund Requests (Keeta-initiated)

1. Keeta sends a refund request webhook
2. Backend sets `refund_status = PENDING` on the order, fires SSE
3. A **Refund Requests banner** appears at the top of the Kanban board (above the columns) listing all orders with a pending refund — this handles the case where the order is already DONE and no longer on the board
4. Operator clicks Accept or Reject on the banner entry, which calls `POST /orders/:id/acceptRefund` or `rejectRefund`
5. Backend calls Keeta API, updates `refund_status` in DB, SSE removes the entry from the banner

---

## 7. Error Handling

### Webhook Endpoint

- **Always** responds `200 OK` within 5 seconds (Keeta requirement)
- Business logic (DB write, SSE push) runs asynchronously after the response is sent
- Duplicate events are deduplicated: if `orderId` + event type already exists in `events_log`, the event is logged but not reprocessed

### Keeta API Calls (from operator actions)

- If the Keeta API returns an error, the order's status in DB is **not changed**
- An error SSE event is pushed to the browser; the order card shows an error badge with a retry button
- The error and full response are logged server-side

### Invalid State Transitions

- Backend validates the transition before calling Keeta. Invalid transitions return `400`
- Frontend disables action buttons that are not valid for the current status — the `400` path is a safety net, not the primary guard

### SSE Disconnections

- `EventSource` reconnects automatically (browser-native behaviour)
- On each reconnect, `App.jsx` calls `GET /orders` to resync — any missed events are resolved by the fresh server state

### Database Errors

- Connection or query errors return `500` with a descriptive log message
- No automatic retry — failures are visible and explicit, which is better for learning

---

## 8. Environment Variables

```
# Keeta API
KEETA_CLIENT_ID=
KEETA_CLIENT_SECRET=
KEETA_BASE_URL=https://open.mykeeta.com/api/open/opendelivery

# Database
DATABASE_URL=postgres://pdv:pdv@db:5432/pdv

# Server
PORT=3000
WEBHOOK_SECRET=   # Optional: used to verify X-App-Signature header from Keeta
```

---

## 9. Development Setup

### Prerequisites

- Docker + Docker Compose
- Node.js LTS (for running Vite dev server outside Docker)
- ngrok account (free tier is sufficient)

### Starting the Stack

```bash
# Start the database and backend
docker-compose up db app

# In a separate terminal: start the React dev server
cd frontend && npm install && npm run dev

# In a separate terminal: expose backend to Keeta
ngrok http 3000
# Copy the ngrok HTTPS URL and register it as your webhook URL in Keeta Developer Portal
```

### Keeta Developer Portal Setup

1. Register the application and obtain `clientId` + `clientSecret`
2. Set webhook URL to `https://<your-ngrok-url>/webhook`
3. Enable webhook event types: `ORDER_CREATED`, `ORDER_CANCELLED`, `REFUND_REQUESTED`

---

## 10. Out of Scope (Future Iterations)

- Menu management (items, prices, categories)
- Working hours configuration
- Multi-store support
- Order history / analytics screen
- Push notifications (browser or mobile)
- Self-delivery tracking (Keeta dispatch/delivered/tracking endpoints)
- Customer data decryption (`batchDecrypt` endpoint)
