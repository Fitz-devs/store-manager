-- 条码缓存只存文字信息（条码/名称/品牌/规格），不再转存外部商品图
ALTER TABLE barcode_cache DROP COLUMN image_url;
ALTER TABLE barcode_cache DROP COLUMN image_key;
