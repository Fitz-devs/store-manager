CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  wechat_openid TEXT UNIQUE,
  nickname TEXT,
  role TEXT NOT NULL DEFAULT 'staff',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE TABLE products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT,
  brand TEXT,
  notes TEXT,
  image_key TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT
);
CREATE INDEX idx_products_name ON products(name);
CREATE INDEX idx_products_status ON products(status);

CREATE TABLE skus (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  spec_name TEXT,
  sale_unit TEXT NOT NULL DEFAULT '件',
  retail_price INTEGER NOT NULL DEFAULT 0,
  suggested_price INTEGER,
  friend_price INTEGER,
  latest_purchase_price INTEGER,
  stock_status TEXT NOT NULL DEFAULT 'in_stock',
  out_of_stock_at TEXT,
  promotion_text TEXT,
  promotion_expires_at TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT
);
CREATE INDEX idx_skus_product ON skus(product_id);
CREATE INDEX idx_skus_stock ON skus(stock_status);

CREATE TABLE barcodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  sku_id INTEGER NOT NULL REFERENCES skus(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  barcode_type TEXT NOT NULL DEFAULT 'single',
  unit_name TEXT NOT NULL DEFAULT '件',
  conversion INTEGER NOT NULL DEFAULT 1,
  is_primary INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE (code, sku_id)
);
CREATE INDEX idx_barcodes_code ON barcodes(code);
CREATE INDEX idx_barcodes_sku ON barcodes(sku_id);
CREATE INDEX idx_barcodes_product ON barcodes(product_id);

CREATE TABLE price_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku_id INTEGER NOT NULL REFERENCES skus(id) ON DELETE CASCADE,
  price_type TEXT NOT NULL,
  old_value INTEGER,
  new_value INTEGER NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  reason TEXT,
  operator_id INTEGER,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_price_history_sku ON price_history(sku_id, price_type, created_at);

CREATE TABLE purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_no TEXT NOT NULL UNIQUE,
  supplier_name TEXT,
  kind TEXT NOT NULL DEFAULT 'purchase',
  total_amount INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  image_keys TEXT,
  ocr_raw TEXT,
  operator_id INTEGER,
  ordered_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_purchases_ordered ON purchases(ordered_at);

CREATE TABLE purchase_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  sku_id INTEGER NOT NULL REFERENCES skus(id),
  product_name TEXT,
  spec_name TEXT,
  unit_name TEXT NOT NULL,
  conversion INTEGER NOT NULL DEFAULT 1,
  qty REAL NOT NULL,
  base_qty REAL NOT NULL,
  unit_price INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  price_changed INTEGER NOT NULL DEFAULT 0,
  retail_updated INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_purchase_items_sku ON purchase_items(sku_id);
CREATE INDEX idx_purchase_items_purchase ON purchase_items(purchase_id);

CREATE TABLE customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT
);
CREATE INDEX idx_customers_name ON customers(name);

CREATE TABLE orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no TEXT NOT NULL UNIQUE,
  customer_id INTEGER REFERENCES customers(id),
  customer_name TEXT,
  delivery_required INTEGER NOT NULL DEFAULT 0,
  delivery_address TEXT,
  delivery_contact TEXT,
  delivery_phone TEXT,
  delivery_at TEXT,
  delivered_at TEXT,
  delivery_photo_key TEXT,
  subtotal INTEGER NOT NULL DEFAULT 0,
  discount INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  paid_amount INTEGER NOT NULL DEFAULT 0,
  is_credit INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',
  delivery_status TEXT NOT NULL DEFAULT 'none',
  note TEXT,
  operator_id INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT
);
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_created ON orders(created_at);
CREATE INDEX idx_orders_delivery ON orders(delivery_status);
CREATE INDEX idx_orders_status ON orders(status);

CREATE TABLE order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  sku_id INTEGER NOT NULL REFERENCES skus(id),
  product_name TEXT,
  spec_name TEXT,
  unit_name TEXT NOT NULL,
  conversion INTEGER NOT NULL DEFAULT 1,
  qty REAL NOT NULL,
  base_qty REAL NOT NULL,
  unit_price INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  promotion_text TEXT
);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_sku ON order_items(sku_id);

CREATE TABLE payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payment_no TEXT NOT NULL UNIQUE,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  customer_id INTEGER,
  method TEXT NOT NULL,
  amount INTEGER NOT NULL,
  purchase_id INTEGER REFERENCES purchases(id),
  note TEXT,
  operator_id INTEGER,
  received_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_payments_order ON payments(order_id);
CREATE INDEX idx_payments_customer ON payments(customer_id);

CREATE TABLE barcode_cache (
  code TEXT PRIMARY KEY,
  name TEXT,
  brand TEXT,
  spec TEXT,
  image_url TEXT,
  source TEXT,
  fetched_at TEXT
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
