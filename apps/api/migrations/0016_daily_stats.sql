CREATE TABLE IF NOT EXISTS daily_stats (
  date TEXT PRIMARY KEY,
  sales_amount INTEGER NOT NULL DEFAULT 0,
  order_count INTEGER NOT NULL DEFAULT 0,
  purchase_amount INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT
);
