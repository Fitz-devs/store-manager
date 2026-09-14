ALTER TABLE skus ADD COLUMN promotion_starts_at TEXT;
ALTER TABLE skus RENAME COLUMN promotion_expires_at TO promotion_ends_at;
