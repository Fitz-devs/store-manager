ALTER TABLE customer_addresses ADD COLUMN lat REAL;
ALTER TABLE customer_addresses ADD COLUMN lng REAL;
ALTER TABLE orders ADD COLUMN delivery_lat REAL;
ALTER TABLE orders ADD COLUMN delivery_lng REAL;
