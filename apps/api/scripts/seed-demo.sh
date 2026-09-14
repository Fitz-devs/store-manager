#!/bin/bash
set -e
BASE=${API_BASE:-http://127.0.0.1:8787}
pick() { python3 -c "import sys,json;d=json.load(sys.stdin);print(eval('d'+sys.argv[1]))" "$1"; }

echo "== 初始化老板账号 admin/admin123 =="
TOKEN=$(curl -s -X POST $BASE/api/auth/setup -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123","nickname":"老板","store_name":"幸福便利店"}' | pick "['data']['token']")
AUTH="Authorization: Bearer $TOKEN"

echo "== 商品1：可乐（含历史进价/优惠） =="
curl -s -X POST $BASE/api/products -H "$AUTH" -H 'Content-Type: application/json' -d '{
  "name":"可乐 330ml","category":"饮料","brand":"可口可乐","purchase_price":250,
  "sku":{"spec_name":"经典版","sale_unit":"罐","retail_price":350,"suggested_price":300,"friend_price":320,"promotion_text":"100元3件","promotion_expires_at":"2026-12-31"},
  "barcodes":[{"code":"6901234567890","barcode_type":"single","unit_name":"罐","conversion":1,"is_primary":true}]
}' > /dev/null

echo "== 商品2：中华（同码两个 SKU：软/硬） =="
curl -s -X POST $BASE/api/products -H "$AUTH" -H 'Content-Type: application/json' -d '{
  "name":"中华香烟","category":"烟","brand":"中华","purchase_price":58000,
  "sku":{"spec_name":"软中华","sale_unit":"条","retail_price":70000,"friend_price":68000},
  "barcodes":[{"code":"6901028075290","barcode_type":"single","unit_name":"条","conversion":1,"is_primary":true}]
}' > /dev/null
curl -s -X POST $BASE/api/products/2/skus -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"spec_name":"硬中华","sale_unit":"条","retail_price":45000,"friend_price":43000}' > /dev/null
curl -s -X POST $BASE/api/products/2/barcodes -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"sku_id":3,"code":"6901028075290","barcode_type":"single","unit_name":"条","conversion":1}' > /dev/null

echo "== 商品3：农夫山泉（箱码+单件码，1箱=24瓶） =="
curl -s -X POST $BASE/api/products -H "$AUTH" -H 'Content-Type: application/json' -d '{
  "name":"农夫山泉 550ml","category":"饮料","brand":"农夫山泉","purchase_price":120,
  "sku":{"spec_name":"单瓶","sale_unit":"瓶","retail_price":200,"suggested_price":200},
  "barcodes":[
    {"code":"6921168509256","barcode_type":"single","unit_name":"瓶","conversion":1,"is_primary":true},
    {"code":"16921168509253","barcode_type":"box","unit_name":"箱","conversion":24}
  ]
}' > /dev/null

echo "== 进货：可乐 2 箱，进价上涨，同步零售价到 4 元 =="
curl -s -X POST $BASE/api/purchases -H "$AUTH" -H 'Content-Type: application/json' -d '{
  "supplier_name":"城北批发部","ordered_at":"2026-09-12",
  "items":[{"sku_id":1,"unit_name":"箱","conversion":24,"qty":2,"unit_price":6720}],
  "price_updates":[{"sku_id":1,"retail_price":400}]
}' > /dev/null

echo "== 缺货标记：硬中华 =="
curl -s -X POST $BASE/api/skus/3/stock-status -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"status":"out_of_stock"}' > /dev/null

echo "== 客户 + 赊账送货订单 + 部分回款 =="
curl -s -X POST $BASE/api/customers -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"name":"张三","phone":"13800000000","address":"幸福路 1 号 3 单元"}' > /dev/null
curl -s -X POST $BASE/api/orders -H "$AUTH" -H 'Content-Type: application/json' -d '{
  "customer_id":1,"is_credit":true,"note":"下午送货",
  "delivery":{"required":true,"address":"幸福路 1 号 3 单元","contact":"张三","phone":"13800000000","at":"今天 15:00"},
  "items":[
    {"sku_id":1,"unit_name":"罐","conversion":1,"qty":12,"unit_price":400},
    {"sku_id":4,"unit_name":"瓶","conversion":1,"qty":24,"unit_price":200}
  ]
}' > /dev/null
curl -s -X POST $BASE/api/payments -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"order_id":1,"method":"wechat","amount":3000}' > /dev/null

echo "== 完成，登录：admin / admin123 =="
curl -s $BASE/api/reports/home -H "$AUTH" | python3 -c "import sys,json;d=json.load(sys.stdin)['data'];print(json.dumps({k:d[k] for k in ('today_sales','unpaid_total','pending_delivery_count','out_of_stock_count')},ensure_ascii=False))"
