#!/usr/bin/env bash
# 验证：mock OCR → from-ocr-row 双建 → 导入入库（含 image_keys / ocr_raw）
set -euo pipefail
BASE=${API_BASE:-http://127.0.0.1:8787}

json_field() {
  python3 -c "import sys,json;d=json.load(sys.stdin);print(d$1)"
}

echo "1) setup"
TOKEN=$(curl -sf -X POST "$BASE/api/auth/setup" -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123","nickname":"老板","store_name":"验证店"}' \
  | json_field "['data']['token']")
AUTH="Authorization: Bearer $TOKEN"

echo "2) upload dummy purchase image"
# 1x1 png
PNG_B64='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
printf '%s' "$PNG_B64" | base64 -d > /tmp/ocr-test.png
KEY=$(curl -sf -X POST "$BASE/api/files" -H "$AUTH" \
  -F "file=@/tmp/ocr-test.png;type=image/png" -F "scope=purchases" \
  | json_field "['data']['key']")
echo "   key=$KEY"

echo "3) mock OCR"
OCR_JSON=$(curl -sf -X POST "$BASE/api/ocr/purchase?page_index=0" -H "$AUTH" -H 'Content-Type: application/json' \
  -d "{\"image_key\":\"$KEY\"}")
echo "$OCR_JSON" | python3 -c "import sys,json;d=json.load(sys.stdin)['data'];print('rows',len(d['draft']['rows']),'model',d['model']);print('header',d['draft']['headers'][0]['order_no'],d['draft']['headers'][0]['customer_name'])"
BOX_S=$(echo "$OCR_JSON" | json_field "['data']['draft']['rows'][0]['box_code']")
UNIT_S=$(echo "$OCR_JSON" | json_field "['data']['draft']['rows'][0]['unit_code']")
BOX2=$(echo "$OCR_JSON" | json_field "['data']['draft']['rows'][1]['box_code']")
UNIT2=$(echo "$OCR_JSON" | json_field "['data']['draft']['rows'][1]['unit_code']")

echo "4) from-ocr-row dual create (row0)"
PAIR=$(curl -sf -X POST "$BASE/api/products/from-ocr-row" -H "$AUTH" -H 'Content-Type: application/json' \
  -d "{\"name\":\"金典纯牛奶250ml*12\",\"box_code\":\"$BOX_S\",\"unit_code\":\"$UNIT_S\",\"conversion\":12,\"unit_price_fen\":4200,\"sale_unit\":\"箱\"}")
echo "$PAIR" | python3 -c "import sys,json;d=json.load(sys.stdin)['data'];print('box',d['box']);print('unit',d['unit']);print('link',d['link_id'])"
BOX_SKU=$(echo "$PAIR" | json_field "['data']['box']['sku_id']")
LINK=$(echo "$PAIR" | json_field "['data']['link_id']")
test -n "$LINK" && test "$LINK" != "None"

echo "5) conflict 409 expected"
CODE=$(curl -s -o /tmp/conflict.json -w '%{http_code}' -X POST "$BASE/api/products/from-ocr-row" -H "$AUTH" -H 'Content-Type: application/json' \
  -d "{\"name\":\"重复\",\"box_code\":\"$BOX_S\",\"conversion\":1,\"sale_unit\":\"箱\"}")
echo "   status=$CODE"
test "$CODE" = "409"

echo "6) from-ocr-row dual create (row1)"
curl -sf -X POST "$BASE/api/products/from-ocr-row" -H "$AUTH" -H 'Content-Type: application/json' \
  -d "{\"name\":\"安慕希(原味)205g*12\",\"box_code\":\"$BOX2\",\"unit_code\":\"$UNIT2\",\"conversion\":12,\"unit_price_fen\":4600,\"sale_unit\":\"箱\"}" > /tmp/pair2.json
BOX_SKU2=$(json_field "['data']['box']['sku_id']" < /tmp/pair2.json)
echo "   box_sku2=$BOX_SKU2"

echo "7) import purchase with image_keys + ocr_raw"
RAW='mock-draft-raw'
BODY=$(python3 - <<PY
import json
print(json.dumps({
  "supplier_name": "小余 伟记购销部",
  "ordered_at": "2026-09-12",
  "note": "XD2609090000219",
  "image_keys": ["$KEY"],
  "ocr_raw": "$RAW",
  "items": [
    {"sku_id": int("$BOX_SKU"), "unit_name": "箱", "conversion": 12, "qty": 30, "unit_price": 4200},
    {"sku_id": int("$BOX_SKU2"), "unit_name": "箱", "conversion": 12, "qty": 24, "unit_price": 4600},
  ],
}))
PY
)
PUR=$(curl -sf -X POST "$BASE/api/purchases" -H "$AUTH" -H 'Content-Type: application/json' -d "$BODY") || {
  echo "purchase create failed" >&2
  curl -s -X POST "$BASE/api/purchases" -H "$AUTH" -H 'Content-Type: application/json' -d "$BODY" >&2
  exit 1
}
PID=$(echo "$PUR" | json_field "['data']['id']")
PNO=$(echo "$PUR" | json_field "['data']['purchase_no']")
echo "   purchase $PID $PNO"

echo "8) verify purchase detail"
DETAIL=$(curl -sf "$BASE/api/purchases/$PID" -H "$AUTH")
echo "$DETAIL" > /tmp/purchase-detail.json
python3 - <<PY
import json
d=json.load(open('/tmp/purchase-detail.json'))['data']
keys=json.loads(d['image_keys'] or '[]')
assert keys==['$KEY'], keys
assert d['ocr_raw']=='mock-draft-raw', d['ocr_raw']
assert d['supplier_name']=='小余 伟记购销部'
assert len(d['items'])==2
item=d['items'][0]
assert item['conversion']==12
assert item['qty']==30
print('OK purchase', d['purchase_no'], 'images', keys, 'items', len(d['items']), 'ocr_raw', d['ocr_raw'][:20])
print('item0', item.get('product_name'), item['qty'], item['unit_name'], 'conv', item['conversion'], 'price', item['unit_price'])
PY

echo "9) verify linked_products"
curl -sf http://127.0.0.1:8787/api/products/1 -H "$AUTH" > /tmp/product1.json
python3 - <<'PY'
import json
d=json.load(open('/tmp/product1.json'))['data']
links=d.get('linked_products') or []
assert any(l.get('relation')=='box_piece' for l in links), links
print('OK links', [(l['id'], l['relation'], l['name']) for l in links])
skus=d['skus']
box=next(s for s in skus if s['sale_unit']=='箱')
assert box['latest_purchase_price']==350, box  # 4200/12
print('OK box sku purchase_price', box['latest_purchase_price'])
PY

echo "PASS import-after-ocr"
