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
