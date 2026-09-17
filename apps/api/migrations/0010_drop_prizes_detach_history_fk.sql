-- 项目约定：不使用数据库外键，关联完整性由应用层保证；
-- 订单/入库明细冗余存储商品快照（product_name/spec_name/unit_name/qty/unit_price 等），
-- 历史单据不依赖商品行存在。本迁移重建所有带外键的表为无外键版本，并移除奖品表。
-- 重建顺序：先子表后父表，避免旧表 ON DELETE CASCADE 在 DROP 时误删子表数据。
DROP TABLE IF EXISTS prizes;

CREATE TABLE price_history_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku_id INTEGER NOT NULL,
  price_type TEXT NOT NULL,
  old_value INTEGER,
  new_value INTEGER NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  reason TEXT,
  operator_id INTEGER,
  created_at TEXT NOT NULL
);
INSERT INTO price_history_new (id, sku_id, price_type, old_value, new_value, source, reason, operator_id, created_at)
SELECT id, sku_id, price_type, old_value, new_value, source, reason, operator_id, created_at FROM price_history;
DROP TABLE price_history;
ALTER TABLE price_history_new RENAME TO price_history;
CREATE INDEX idx_price_history_sku ON price_history(sku_id, price_type, created_at);

CREATE TABLE promotions_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  starts_at TEXT,
  ends_at TEXT,
  created_at TEXT NOT NULL
);
INSERT INTO promotions_new (id, sku_id, content, starts_at, ends_at, created_at)
SELECT id, sku_id, content, starts_at, ends_at, created_at FROM promotions;
DROP TABLE promotions;
ALTER TABLE promotions_new RENAME TO promotions;
CREATE INDEX idx_promotions_sku ON promotions(sku_id);

CREATE TABLE barcodes_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  sku_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE (code, sku_id)
);
INSERT INTO barcodes_new (id, code, sku_id, product_id, is_primary, created_at)
SELECT id, code, sku_id, product_id, is_primary, created_at FROM barcodes;
DROP TABLE barcodes;
ALTER TABLE barcodes_new RENAME TO barcodes;
CREATE INDEX idx_barcodes_code ON barcodes(code);
CREATE INDEX idx_barcodes_sku ON barcodes(sku_id);
CREATE INDEX idx_barcodes_product ON barcodes(product_id);

CREATE TABLE product_links_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  linked_product_id INTEGER NOT NULL,
  relation TEXT NOT NULL DEFAULT 'box_piece',
  note TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(product_id, linked_product_id)
);
INSERT INTO product_links_new (id, product_id, linked_product_id, relation, note, created_at)
SELECT id, product_id, linked_product_id, relation, note, created_at FROM product_links;
DROP TABLE product_links;
ALTER TABLE product_links_new RENAME TO product_links;
CREATE INDEX idx_product_links_product ON product_links(product_id);
CREATE INDEX idx_product_links_linked ON product_links(linked_product_id);

CREATE TABLE purchase_items_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_id INTEGER NOT NULL,
  sku_id INTEGER NOT NULL,
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
INSERT INTO purchase_items_new (id, purchase_id, sku_id, product_name, spec_name, unit_name, conversion, qty, base_qty, unit_price, amount, price_changed, retail_updated)
SELECT id, purchase_id, sku_id, product_name, spec_name, unit_name, conversion, qty, base_qty, unit_price, amount, price_changed, retail_updated FROM purchase_items;
DROP TABLE purchase_items;
ALTER TABLE purchase_items_new RENAME TO purchase_items;
CREATE INDEX idx_purchase_items_sku ON purchase_items(sku_id);
CREATE INDEX idx_purchase_items_purchase ON purchase_items(purchase_id);

CREATE TABLE order_items_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  sku_id INTEGER NOT NULL,
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
INSERT INTO order_items_new (id, order_id, sku_id, product_name, spec_name, unit_name, conversion, qty, base_qty, unit_price, amount, promotion_text)
SELECT id, order_id, sku_id, product_name, spec_name, unit_name, conversion, qty, base_qty, unit_price, amount, promotion_text FROM order_items;
DROP TABLE order_items;
ALTER TABLE order_items_new RENAME TO order_items;
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_sku ON order_items(sku_id);

CREATE TABLE payments_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payment_no TEXT NOT NULL UNIQUE,
  order_id INTEGER NOT NULL,
  customer_id INTEGER,
  method TEXT NOT NULL,
  amount INTEGER NOT NULL,
  purchase_id INTEGER,
  note TEXT,
  operator_id INTEGER,
  received_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
INSERT INTO payments_new (id, payment_no, order_id, customer_id, method, amount, purchase_id, note, operator_id, received_at, created_at)
SELECT id, payment_no, order_id, customer_id, method, amount, purchase_id, note, operator_id, received_at, created_at FROM payments;
DROP TABLE payments;
ALTER TABLE payments_new RENAME TO payments;
CREATE INDEX idx_payments_order ON payments(order_id);
CREATE INDEX idx_payments_customer ON payments(customer_id);

CREATE TABLE customer_addresses_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  label TEXT,
  contact_name TEXT,
  phone TEXT,
  address TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT
);
INSERT INTO customer_addresses_new (id, customer_id, label, contact_name, phone, address, is_default, created_at, updated_at)
SELECT id, customer_id, label, contact_name, phone, address, is_default, created_at, updated_at FROM customer_addresses;
DROP TABLE customer_addresses;
ALTER TABLE customer_addresses_new RENAME TO customer_addresses;
CREATE INDEX idx_customer_addresses_customer ON customer_addresses(customer_id);

CREATE TABLE orders_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no TEXT NOT NULL UNIQUE,
  customer_id INTEGER,
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
INSERT INTO orders_new (id, order_no, customer_id, customer_name, delivery_required, delivery_address, delivery_contact, delivery_phone, delivery_at, delivered_at, delivery_photo_key, subtotal, discount, total, paid_amount, is_credit, status, delivery_status, note, operator_id, created_at, updated_at)
SELECT id, order_no, customer_id, customer_name, delivery_required, delivery_address, delivery_contact, delivery_phone, delivery_at, delivered_at, delivery_photo_key, subtotal, discount, total, paid_amount, is_credit, status, delivery_status, note, operator_id, created_at, updated_at FROM orders;
DROP TABLE orders;
ALTER TABLE orders_new RENAME TO orders;
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_created ON orders(created_at);
CREATE INDEX idx_orders_delivery ON orders(delivery_status);
CREATE INDEX idx_orders_status ON orders(status);

CREATE TABLE skus_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  spec_name TEXT,
  sale_unit TEXT NOT NULL DEFAULT '件',
  retail_price INTEGER NOT NULL DEFAULT 0,
  friend_price INTEGER,
  latest_purchase_price INTEGER,
  stock_status TEXT NOT NULL DEFAULT 'in_stock',
  out_of_stock_at TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT
);
INSERT INTO skus_new (id, product_id, spec_name, sale_unit, retail_price, friend_price, latest_purchase_price, stock_status, out_of_stock_at, status, created_at, updated_at)
SELECT id, product_id, spec_name, sale_unit, retail_price, friend_price, latest_purchase_price, stock_status, out_of_stock_at, status, created_at, updated_at FROM skus;
DROP TABLE skus;
ALTER TABLE skus_new RENAME TO skus;
CREATE INDEX idx_skus_product ON skus(product_id);
CREATE INDEX idx_skus_stock ON skus(stock_status);
