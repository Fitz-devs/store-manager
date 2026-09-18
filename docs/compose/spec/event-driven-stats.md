---
feature: event-driven-stats
status: delivered
updated: 2026-09-18
branch: event-driven-stats
commits: aaa292b..（本笔 feat 含 review 修复与文档；时区修正为后续独立一笔）
---

# 事件驱动日统计行（daily_stats）

## Report

**What was built** — 新增 `daily_stats` 表（migration 0016，按上海日历日一行：sales_amount / order_count / purchase_amount，单位分，无外键）。五个事件点在同批次原子维护统计行：开单 `+sales+count`、作废订单按其 `created_at` 归属日 `-sales-count`（仅 open 单）、清除订单同口径且 void 后不双扣、入库 `+purchase`、清除入库 `-purchase`；`voidOrder` 由裸 execute 改为 batch。`GET /api/reports/home` 的当日三项改读统计行（无行返 0），未收/待送/缺货维持现算，`HomeReport` 结构与 miniapp 均无变化。新增 owner-only `POST /api/reports/stats/rebuild`：从订单/入库明细 JS 侧按上海日全量重算并覆盖统计行，幂等可随时对账/回填历史；`exportAll` 与每日 R2 备份自动包含 `daily_stats`。

**Verification** — `bun run --cwd apps/api test`：6 文件 33 测试全过（含 7 个新增 daily-stats 单测，覆盖语句形态、负增量、void 不双扣、跨日归属）；`bun run --cwd apps/api typecheck` 干净；`migrate:local` 0016 应用成功；本地 wrangler dev 端到端冒烟：0/0/0 → 入库 0/0/2500 → 开单 1050/1/2500 → 作废 0/0/2500 → 清除 0/0/2500（不双扣）→ 再开单 700/1/2500 → 清入库 700/1/0 → rebuild 两次均 700/1/0 → 导出含 `daily_stats` → staff rebuild 403。独立 review：0 critical / 0 major / 7 minor；已修 M2（创建路径统计日期改取捕获时刻 `now`，避免跨午夜错日）与 M5（删除失去消费方的 `shanghaiDayStartUtc`）并复验通过；M1（void/purge 读写竞态，既有代码同模式）、M3（rebuild 分块非整体事务，幂等可重跑）、M4（历史单据扣减可产生负值行，rebuild 归一）、M6（路由/export 行为由冒烟覆盖，仓库无路由测试基建）、M7（created_at 损坏时 fail-closed）接受为设计内残余，均可用 rebuild 对账兜底。

**Journey log** —
- 创建路径的统计日期必须从捕获的 `now` 推导（`shanghaiDateString(new Date(now))`），不能在多次 await 后重新取当前时间，否则跨上海午夜会把增量记到错误的日。
- 本项目惯用「batch 外读、batch 内写」模式（voidOrder/purgeOrder/addPayment 均如此），给统计增量加条件守卫无法在 batch 内表达；并发双扣窗口接受，由 rebuild 对账收敛。
- UPDATE-then-INSERT(ON CONFLICT DO NOTHING) 同 batch 两语句可安全替代单条 upsert：行存在则 UPDATE 生效、INSERT 空转；不存在则反之——在 D1 batch 原子性下无交错。
- UPDATE+1 的 UPDATE…WHERE 空转是常态路径的一部分，无需先 SELECT 判断行是否存在。
## [S1] Problem

首页 `/api/reports/home` 的当日销售、单数、采购额每次查询都对 orders/purchases 实时聚合；未来日结/报表类需求会重复这类聚合。改为事件驱动：业务写入时在同一个 D1 batch 内原子维护按日统计行，查询只读一行，并保留从明细全量重算的对账能力。

## [S2] Design

### 表结构（migration 0016）

```sql
CREATE TABLE daily_stats (
  date TEXT PRIMARY KEY,            -- 上海时区日历日 'YYYY-MM-DD'
  sales_amount INTEGER NOT NULL DEFAULT 0,     -- 当日 open 订单 total 之和（分），扣除作废/清除
  order_count INTEGER NOT NULL DEFAULT 0,
  purchase_amount INTEGER NOT NULL DEFAULT 0,  -- 当日入库 total_amount 之和（分），扣除清除
  updated_at TEXT
);
```

- 不建外键、不级联，关联完整性由应用层维护（项目规则）。
- 金额单位分，与 orders.total / purchases.total_amount 一致。

### 事件点与增量规则

`daily_stats` 只承载「当日流水型」指标；「当前状态型」指标（未收款、待送货、缺货数）继续现算。订单 total 创建后不可改，因此只有以下事件：

| 事件 | 位置 | 增量 | 统计行日期 |
|---|---|---|---|
| 创建订单 `createOrder` | services/orders.ts | `sales_amount += total`，`order_count += 1` | 写入时刻的上海日 |
| 作废订单 `voidOrder` | services/orders.ts | 原 status='open' 时 `sales_amount -= total`，`order_count -= 1` | 订单 `created_at` 的上海日 |
| 清除订单 `purgeOrder` | services/orders.ts | 原 status='open' 时同上（void 单已在作废时扣过，不双扣） | 订单 `created_at` 的上海日 |
| 创建入库 `createPurchase` | services/purchases.ts | `purchase_amount += total_amount` | 写入时刻的上海日 |
| 清除入库 `purgePurchase` | services/purchases.ts | `purchase_amount -= total_amount` | 入库单 `created_at` 的上海日 |
| 回款 `addPayment` / 送货 `deliverOrder` | — | 无影响（未收款现算） | — |

实现约束：

1. 每个事件点的统计 upsert 必须与业务写入在**同一个 `batchCompiled` batch** 里（D1 batch 原子）。`voidOrder` 目前是裸 `execute`，需改为 batch。
2. upsert 模式：`UPDATE ... SET sales_amount = sales_amount + ? WHERE date = ?` + `INSERT ... ON CONFLICT(date) DO NOTHING`（两条同 batch，顺序 UPDATE→INSERT，行存在时 UPDATE 生效、INSERT 被忽略；不存在时 UPDATE 空转、INSERT 落行）。允许负增量（作废/清除）。
3. 上海日换算复用 `shanghaiDateString`（lib/ids.ts），对历史记录用 `shanghaiDateString(new Date(created_at))`。

### 读路径（reports.ts /home）

- `today_sales` / `today_order_count` / `today_purchase_amount`：读 `daily_stats` 当日行，无行则 0。
- `unpaid_total`、`unpaid_order_count`、`pending_delivery_count`、`out_of_stock_count`：维持现有聚合查询不变。
- `recent_orders`：不变。`HomeReport` 类型与响应结构不变，miniapp 无改动。

### 对账（rebuild）

- `POST /api/reports/stats/rebuild`，`requireOwner` 中间件保护。
- 从 orders/purchases 明细在 JS 侧按上海日全量分组重算，覆盖式 upsert 全部统计行；幂等，任何时候可调用以修正漂移或回填历史。
- 明细口径：订单仅计 `status='open'`；入库全部计入。

### 周边同步

- `db/schema.ts` 增加 `DailyStatsTable` 并挂到 `DB`。
- `services/backup.ts` `exportAll` 导出 `daily_stats`。

## [S3] Out of Scope

- 未收款/待送货/缺货数的事件驱动化（继续现算）。
- customers 表冗余统计列（unpaid/order_count/last_order_at 继续现算）。
- 毛利/成本快照、日结与畅销滞销报表 UI。
- KV 或任何读缓存层。
- miniapp 端任何改动。
- 部署与远程迁移执行（完成后由用户按「先 migrate:remote 再 deploy」顺序操作）。

## Tasks

- [x] T1: migration 0016 建 `daily_stats` 表 + `schema.ts` 类型挂载 — acceptance: `bun run --cwd apps/api migrate:local` 成功；`tsc --noEmit` 通过且 `db.selectFrom('daily_stats')` 类型可用 (covers: S2 表结构)
- [x] T2: 五个事件点的统计行增量写入（同 batch 原子；voidOrder 改 batch；purge 不双扣）— acceptance: 新增单测覆盖增量语句构建、负增量、purge-after-void 不双扣、跨日扣减日期归属，vitest 通过 (covers: S2 事件点)
- [x] T3: `/api/reports/home` 当日三项改读统计行 — acceptance: 无统计行时三项返回 0、有行时读行值；响应结构含 HomeReport 全字段，vitest 通过 (covers: S2 读路径)
- [x] T4: `POST /api/reports/stats/rebuild`（owner-only）+ JS 分组重算 — acceptance: 重算幂等且与明细一致（单测覆盖分组口径：仅 open 订单、全部入库），vitest 通过 (covers: S2 对账)
- [x] T5: `exportAll` 导出 `daily_stats` — acceptance: 导出对象含 `daily_stats` 键，vitest 通过 (covers: S2 周边同步)
- [x] T6: 全量验证 — acceptance: `bun run --cwd apps/api test`、`bun run --cwd apps/api typecheck` 全绿；`migrate:local` 后用 seed 流程冒烟 `/reports/home` 正常 (covers: S1, S2)
