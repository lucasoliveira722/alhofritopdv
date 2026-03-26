CREATE TABLE IF NOT EXISTS order_items (
  id         SERIAL PRIMARY KEY,
  order_id   TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  quantity   INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC(10,2),
  notes      TEXT
);
