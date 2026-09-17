-- 以货换货/商品抵扣已下线且无历史数据，删除相关列
ALTER TABLE purchases DROP COLUMN kind;
ALTER TABLE payments DROP COLUMN purchase_id;
