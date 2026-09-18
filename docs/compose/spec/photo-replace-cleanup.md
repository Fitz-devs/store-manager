---
feature: photo-replace-cleanup
status: delivered
updated: 2026-09-19
branch: main
commits: 961dbe666..HEAD
---

# 凭证/商品图替换时清理旧 R2 文件 + 新增凭证 PATCH 能力

## Report

**What was built** — 修改带图片字段时，旧 R2 文件现在会被同步清理，遵循与 `purgeProduct/purgeOrder/purgePurchase` 完全一致的容错模式（失败仅留孤儿、不报错、不阻塞响应）。覆盖四条路径：商品换图、订单补拍送达凭证、订单付款凭证、入库凭证。新增 `PATCH /api/payments/:id` 与 `PATCH /api/purchases/:id` 两个端点，让原来只能新建或只能补一次的凭证现在可以原地修改；`PATCH /api/products/:id` 与 `POST /api/orders/:id/deliver` 已存在的端点保持路径不变、修复覆盖式修改时的孤儿文件。付款端点允许改 `amount/method/note/photo_key/received_at`，差额同步调整 `orders.paid_amount` 并校验不超 `order.total`；入库端点只开放 `supplier_name/note/ordered_at/image_keys` 四个字段，避免修改触达流水/价格历史。

**Verification** —
- `bun run --cwd apps/api typecheck` → PASS（无声退出，无 TS 错误）
- `bun run --cwd apps/api test` → PASS（8 文件 46 测试全部通过，无 PRE-EXISTING）
- 端点契约：`PATCH /api/payments/:id` 返 `{ order, payment }`；`PATCH /api/purchases/:id` 返 `PurchaseWithItems`
- 退出条件：旧 key 与新 key 相同时跳过 R2 调用；`patch.photo_key/image_key(s) === undefined` 时完全跳过清理

**Journey log** —
- 用户原问"是否可走 D1 触发器做异步清理"，经评估放弃：触发器内无法调用 R2，需另起队列 + cron worker；架构成本与同步删模式差一个数量级，且与现有 `purgeProduct/purgeOrder/purgePurchase` 已建立的同步删模式分叉。最终按用户选定的"同步删 + 容忍孤儿"实现。
- 用户选中"在 main 上原地改、不开 worktree"，显式覆盖了 compose-next 默认的 worktree gate。
- `payments.updatePayment` 初版把"是否清理旧图"的判断写成 `previousPhotoKey !== patch.photo_key`，但 `patch.photo_key` 是 partial 类型，传 `{note}` 时是 undefined，会让 `string|null !== undefined` 永远为真而误删。在自审阶段发现并补 `patch.photo_key !== undefined` 显式短路。
- `purchases.updatePurchase` 第一稿加了 `updated_at: nowIso()` 进 values，tsc 没拦（`purchases` 表没有 updated_at 列，跑迁移会失败）。比对 schema 后移除，避免回归到 D1 schema 漂移。
- 本仓库 service 层尚无集成测试基建（HANDOVER.md 已记录为 known gap），本次延续既有约定，只在算法层做 vitest 验证。如未来接入 vitest-pool-workers + 迁移，可在 addPayment / updatePayment / updatePurchase 路径补回归测试。

## [S1] Problem
替换带图片的字段时，旧的 R2 对象会变成孤儿，长期占用 bucket 空间：

- 商品换图（PATCH `/api/products/:id` 带 `image_key`）→ 旧 `products.image_key` 留在 R2。
- 订单补拍送达凭证（POST `/api/orders/:id/deliver` 重复调用）→ 旧 `orders.delivery_photo_key` 留在 R2。
- 入库单重新上传凭证（POST `/api/purchases` 唯一新建路径，无法修改）→ 旧 `purchases.image_keys` 数组里被替换掉的那几张留在 R2。
- 订单付款凭证（payments 表）→ 当前根本没有修改入口；想"重传凭证"只能再 addPayment 一条，旧凭证永远挂着。

`HANDOVER.md` 已记录 service 层资金路径缺集成测试，所以本次按现有同步删模式（与 `purgeProduct/purgeOrder/purgePurchase` 完全一致）补齐：失败仅留孤儿、不报错、不阻塞主流程。

## [S2] Design

### 数据流（4 个修改入口统一模式）

每个 modify-in-place 端点都遵循：

1. 读旧行，捕获旧 `image_key`(s)。
2. 在 DB 事务内更新（业务不变）。
3. 事务提交成功后，**同步**调用 `storage.delete(oldKey).catch(() => undefined)`；多张凭证则按集合差集删。
4. 删失败一律 swallow：与现有 `purgeProduct`/`purgeOrder`/`purgePurchase` 的容错一致；不阻断响应、不返回错误给前端、不入日志队列。

旧 key 与新 key 相同（payload 没改图）时跳过删除，省一次 R2 调用。
`patch.image_key / patch.photo_key / patch.image_keys === undefined`（partial 字段未传）时完全跳过清理，避免误删。

### 端点变更

| 端点 | 方法 | 行为 |
| --- | --- | --- |
| `PATCH /api/products/:id` | 已存在 | service `updateProduct` 增加：旧 `image_key` 删除 |
| `POST /api/orders/:id/deliver` | 已存在 | service `deliverOrder` 改为：旧 `delivery_photo_key` 删除 |
| `PATCH /api/payments/:id` | 新增 | 替换凭证（`photo_key` + `note` + `method` + `amount` + `received_at`），旧 `photo_key` 删除；不允许改 `order_id` |
| `PATCH /api/purchases/:id` | 新增 | 替换 `image_keys` 数组；按差集删（被移除的旧 key） |

### Schema（packages/shared）

- 新增 `paymentUpdateSchema = paymentCreateSchema.omit({ order_id: true }).partial()` ——amount / method / note / photo_key / received_at 均可选。
- 新增 `purchaseUpdateSchema` 仅 `supplier_name/ordered_at/note/image_keys` 四字段，部分可选，不开放 items / price_updates / ocr_raw。
- 导出 `PaymentUpdateInput` / `PurchaseUpdateInput` 类型。
- `orderDeliverSchema` 已是 partial，**不动**。

### Service 层新增/修改

- `products.updateProduct(db, id, patch, storage?)` 增 `storage` 形参；非 `undefined` 时按上述模式清理。
- `orders.deliverOrder(db, id, input, storage?)` 同上。
- 新增 `payments.updatePayment(db, id, patch, storage?)`：
  - SELECT 旧 `photo_key`、旧 `amount`。
  - 校验 `order.status !== 'void'`。
  - 若改 `amount` 且新值过大：校验 `paid_amount - old + new <= total`，超出抛 `VALIDATION`。
  - UPDATE payments 行；差额调整 `orders.paid_amount`。
  - 提交后清理旧 photo_key。
  - 返回 `{ order, payment }`。
- 新增 `purchases.updatePurchase(db, d1, id, patch, storage?)`：
  - SELECT 旧 `image_keys`（JSON 解析为数组）。
  - 仅写 `note/supplier_name/image_keys/ordered_at`（不写 `updated_at`——purchases 表无该列）。
  - 事务提交后，对 oldKeys ∖ newKeys 差集逐个 `storage.delete().catch(() => undefined)`。

### Routes 层

- `routes/products.ts`：现有 PATCH 调用 `updateProduct(db, id, input, createStorage(c.env.BUCKET))`。
- `routes/orders.ts`：现有 POST `/deliver` 调用 `deliverOrder(..., createStorage(c.env.BUCKET))`。
- `routes/payments.ts`：新增 `router.patch('/:id', ...)` → `updatePayment(...)`。PATCH 用 `idSchema` 校验。
- `routes/purchases.ts`：新增 `router.patch('/:id', ...)` → `updatePurchase(...)`。

### 错误码（沿用现有 ApiError）

- 404 `PAYMENT_NOT_FOUND` / `PURCHASE_NOT_FOUND`
- 400 `ORDER_VOID` ——付款凭证不允许针对已作废订单修改
- 400 `VALIDATION` ——zod 抛出的内容由现有 `parseBody` 自动翻译

### 接口契约示例

`PATCH /api/payments/42`
```json
{ "photo_key": "abc/xyz_new.jpg", "note": "更正", "method": "wechat", "amount": 1500 }
```
返回 `{ payment: {...}, order: OrderWithItems }`。

`PATCH /api/purchases/7`
```json
{ "image_keys": ["k1_new.jpg", "k3.jpg"], "note": "重传" }
```
旧 keys = `["k1_old.jpg", "k2.jpg", "k3.jpg"]`，差集 = `["k1_old.jpg", "k2.jpg"]` 被删。

## [S3] Out of Scope

- 不清理历史已存在的孤儿文件（HANDOVER 提到的 known gap）。
- 不做 payments 行"软作废 + 新增"语义；本次按用户选定"直接修改原行"。
- 不改 OCR、AI、统计逻辑；不被本次端点触发的连带表不变。
- 不写 service 层集成测试（HANDOVER 已知 known gap，未来用 vitest-pool-workers 补齐，本次不扩大范围）。
- 不上异步队列/D1 触发器；保持同步删的现状。
- 不增加 DELETE /:payment 或 DELETE /:purchase 图片接口。
- 小程序端本次不动，前端改造不在本次 spec 范围。

## Tasks
- [x] T1: 在 `packages/shared/src/schemas.ts` 加 `paymentUpdateSchema` / `purchaseUpdateSchema` 与对应 Input 类型 — 完成（`bun run --cwd apps/api typecheck` 干净）
- [x] T2: services 层 —— `updateProduct` / `deliverOrder` 加 storage 形参与旧 key 清理；新增 `payments.updatePayment`（处理 amount 差量）；新增 `purchases.updatePurchase`（处理 image_keys 差集）— 完成
- [x] T3: routes 层 —— products.ts PATCH 与 orders.ts /deliver 传入 storage；payments.ts 加 `PATCH /:id`；purchases.ts 加 `PATCH /:id` — 完成
- [x] T4: 验证 —— `bun run --cwd apps/api typecheck` + `bun run --cwd apps/api test`；typecheck 干净，46/46 测试 PASS — 完成
- [x] T5: 自审三栏（spec compliance / correctness / codebase consistency）；发现并修复 2 处自引入 regression（payments.updatePayment 的 patch.photo_key 未传时误删、purchases.updatePurchase 写了不存在的 updated_at 列）— 完成
