---
feature: ocr-match-perf
status: delivered
updated: 2026-09-19
branch: feat/ocr-match-perf
commits: 36ea41e..4afde63
---

# OCR 入库匹配：批量轻量接口与防误匹配

## Report

**What was built** — OCR 入库自动匹配改为 **仅商品码**：新增 `POST /api/products/match-ocr`，一次请求批量 `barcodes.code IN (...)`（走索引），再轻量回填 sku/product 字段，**不做**品名/别名/品牌/分类的 `LIKE` 扫描，也不拉 `getProductDetail`（无入库历史/优惠/关联）。小程序 `purchase-new` 与 AI skill `matchPurchaseItems` 均改为该批量接口；条码未命中行显示「商品码未命中」并提供「检索匹配」，由用户手动检索或建档，消除空库/模糊第一项导致的假「已完善」。

**Verification**
- `bun run api:typecheck` → PASS
- `bun run api:test` → PASS（9 files，51 tests，含 match-ocr 5 个）
- `bun run --cwd apps/miniapp build:weapp` → PASS
- 独立 review：初审指出 `missing` 行缺少手动匹配入口（critical）；已修复后复审 PASS

**Journey log**
- 「有索引还慢」多半不是缺索引：`LIKE '%长品名%'` + 多字段 OR + COUNT，以及命中后拉 `getProductDetail`，才是主因
- 产品决策：自动匹配只认店内商品码；品名检索只保留用户主动点选路径
- 假匹配排查：生产空库理论上不应 `matched`；更常见是打到本地 API/残留商品，或旧逻辑 `items[0]` 自动绑定
- Review 抓到 UI 死角：自动 miss 后若无「检索」入口，手动匹配代码等于不可达
- `candidates` 含主 hit 全量（含主规格），便于同码多 SKU 一次给全

## [S1] Problem

### S1.1 匹配慢（性能）

OCR 识别完成后，`purchase-new` 对每一行 `Promise.all` 打多接口；AI skill `matchPurchaseItems` 则逐行串行调用。

慢的根因不是「条码列没索引」：

1. `barcodes.code` 已有 `idx_barcodes_code`，等值查条码本身应很快。
2. `lookupBarcode` 命中后调用 `getProductDetail`：串行拉 products/skus/barcodes/promotions/price_history(200)/purchase_items JOIN purchases(200)/product_links/categories。OCR 匹配只需要绑定字段，却每次都取完整详情。
3. 条码未命中回退 `GET /api/products?q=`：`name/aliases/brand/category LIKE '%q%'` 无法使用 B-tree 索引，外加 COUNT 分页。
4. 客户端扇出放大：N 行 ×（≤2 次 lookup + 名称搜索 + 详情）。D1 每请求延迟叠加。

### S1.2 空库仍显示「已完善」（正确性）

用户反馈：线上商品表为空，OCR 确认页仍有一行「已完善 · 商品名」。

旧逻辑名称路径：`data.items.find(exact) || data.items[0]` 会把模糊扫描的第一项自动绑定；空库理论上不应 matched，需结合实际 API 基址/数据核对，但代码侧必须禁止非条码自动绑定。

## [S2] Design

### S2.1 批量轻量匹配契约（**仅商品码**）

产品决策：自动匹配 **只走商品码**；条码未命中 → `missing`，由用户手动检索/建档。**不在自动路径做品名模糊/多字段 OR 扫描**。

`POST /api/products/match-ocr`（鉴权同 products）。

**Request**

```ts
{
  rows: Array<{
    box_code?: string | null
    unit_code?: string | null
  }>  // 1..100
}
```

**Response** `ok(c, { results: MatchOcrRowResult[] })`，与输入下标对齐。

```ts
interface MatchOcrSkuHit {
  sku_id: number
  product_id: number
  product_name: string
  sale_unit: string
  spec_name: string | null
  retail_price: number | null
  friend_price: number | null
  latest_purchase_price: number | null
  matched_code: string | null
}

interface MatchOcrRowResult {
  status: 'matched' | 'missing'
  match_source: 'box_code' | 'unit_code' | 'none'
  hit: MatchOcrSkuHit | null
  candidates: MatchOcrSkuHit[]  // 同码多 sku 时含全部命中（含主 hit）
}
```

**服务端算法**

1. 收集非空 box/unit code，一次 `WHERE code IN (...)`（`idx_barcodes_code`）。
2. 命中后仅按 sku/product id IN 轻量查询；不查 price_history/purchase_items/promotions/links。
3. 每行优先 `box_code`，其次 `unit_code`；优先 `status=active` 的 sku，全归档则回退全部命中。
4. **不做名称搜索**。
5. 无码或未命中 → `missing` / `none` / `hit=null`。
6. 同码多 SKU：`hit` = active 优先 + `is_primary` + 最小 sku_id；`candidates` 含全部。

**错误**：rows 空或 >100 → 400 VALIDATION。

**手动检索（客户端）**：自动码查未中后，用户点「检索匹配」才调 `GET /api/products?q=` 并 ActionSheet 点选；AI skill 未命中提示检索/确认建档，禁止编造 sku_id。

### S2.2 客户端接入

#### 小程序 `purchase-new`

- `autoLookupAll`：`POST /api/products/match-ocr`（按 50 行分片），仅 `matched && hit` 时绑定。
- 未命中 → `missing`，标签「商品码未命中 · 点此检索」+ 按钮「检索匹配」。
- `matchRow`：先 match-ocr；仍未中才 `products?q=` + 用户点选（无 `items[0]` 自动绑定）。

#### AI skill `purchaseSkill.matchPurchaseItems`

- 分片 ≤50 调 match-ocr，只传 box/unit code。
- `matched`/`ambiguous`（candidates>1）/`missing` 语义如上；不再按品名串行查列表+详情。
- mcp.json/SKILL.md 已改为「仅商品码」描述。

### S2.3 防误匹配规则（正确性）

| 规则 | 行为 |
|---|---|
| 空库 | match-ocr 全 `missing`，客户端不得显示「已完善」 |
| 条码命中 | 可自动绑定；`product_name` 来自 DB |
| 名称 | **自动路径禁止品名绑定** |
| 手动检索 | 必须用户点选 |
| 绑定 | `sku_id` 来自接口原值，禁止编造 |

### S2.4 测试边界

- 空库/无码 → 全 missing；箱码优先件码；同码多 SKU；查询 `code IN` 无 LIKE/COUNT。
- 自动路径不调用 `products?q=`。

## [S3] Out of Scope

- 开单/客户/订单模块
- FTS5/搜索引擎
- 商品列表页搜索语义大改
- 真实销售单 OCR 识别质量
- 线上数据清理（若确有残留商品属运维）

## Tasks

- [x] T1: shared 增加 match-ocr 请求/响应类型与 zod schema — acceptance: 类型可编译，schema 校验 1..100 行 (covers: S2.1)
- [x] T2: `matchOcrRows` 服务 + `POST /api/products/match-ocr`（仅商品码） — acceptance: 空库全 missing；code IN；无名称 LIKE；箱码优先 (covers: S2.1, S2.3)
- [x] T3: API 单测 — acceptance: 空库/箱码优先/件码/同码多 SKU；查询不含 LIKE (covers: S2.4; depends: T2)
- [x] T4: `purchase-new` 自动匹配仅 match-ocr，miss 可点「检索匹配」 — acceptance: 自动路径无 products?q=；miss 有手动检索入口 (covers: S2.2, S2.3)
- [x] T5: AI skill `matchPurchaseItems` 仅商品码批量匹配 — acceptance: 无品名模糊扫描；missing 提示检索/建档 (covers: S2.2; depends: T2)
- [x] T6: 端到端验证 typecheck/tests/weapp build — acceptance: typecheck/test/weapp 均 PASS (covers: S2.4; depends: T3,T4,T5)
