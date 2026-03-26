CREATE TABLE IF NOT EXISTS events_log (
  id          SERIAL PRIMARY KEY,
  order_id    TEXT,
  event_type  TEXT NOT NULL,
  payload     JSONB NOT NULL,
  received_at TIMESTAMPTZ DEFAULT NOW()
);
