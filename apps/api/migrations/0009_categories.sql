CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS product_categories (
  product_id INTEGER NOT NULL,
  category_id INTEGER NOT NULL,
  PRIMARY KEY (product_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_product_categories_category ON product_categories(category_id);
CREATE INDEX IF NOT EXISTS idx_product_categories_product ON product_categories(product_id);

INSERT OR IGNORE INTO categories (name, created_at)
SELECT DISTINCT products.category, datetime('now')
FROM products
WHERE products.category IS NOT NULL AND TRIM(products.category) != '';

INSERT OR IGNORE INTO product_categories (product_id, category_id)
SELECT products.id, categories.id
FROM products
INNER JOIN categories ON categories.name = products.category
WHERE products.category IS NOT NULL AND TRIM(products.category) != '';
