-- 多优惠/多奖品/商品关联：新建表，移除 SKU 上的单值字段与条码冗余列
ALTER TABLE skus DROP COLUMN promotion_text;
ALTER TABLE skus DROP COLUMN promotion_starts_at;
ALTER TABLE skus DROP COLUMN promotion_ends_at;
ALTER TABLE skus DROP COLUMN prize_price;

ALTER TABLE barcodes DROP COLUMN barcode_type;
ALTER TABLE barcodes DROP COLUMN unit_name;
ALTER TABLE barcodes DROP COLUMN conversion;

CREATE TABLE promotions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku_id INTEGER NOT NULL REFERENCES skus(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  starts_at TEXT,
  ends_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_promotions_sku ON promotions(sku_id);

CREATE TABLE prizes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku_id INTEGER NOT NULL REFERENCES skus(id) ON DELETE CASCADE,
  description TEXT,
  extra_price INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_prizes_sku ON prizes(sku_id);

CREATE TABLE product_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  linked_product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  relation TEXT NOT NULL DEFAULT 'box_piece',
  note TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(product_id, linked_product_id)
);
CREATE INDEX idx_product_links_product ON product_links(product_id);
CREATE INDEX idx_product_links_linked ON product_links(linked_product_id);
