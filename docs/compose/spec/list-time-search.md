---
feature: list-time-search
status: delivered
updated: 2026-09-18
branch: feat/list-time-search
commits: d62b7bfae3f39916f0778586b07f52ec97135d43..99b18fa23930478a4342ed4eac65fdd1674a270e
---

# 订单/入库列表时间筛选与模糊搜索增强

## Report

**What was built** — 订单列表与入库列表新增可展开的「时间」日期区间筛选（复用 `DateRangeField`，变更即回到第 1 页查询，支持一键清除）；后端将前端 `YYYY-MM-DD` 边界归一化：订单按 `orders.created_at` 上海自然日转 UTC ISO，入库按 `purchases.ordered_at` 扩展为当日末。订单模糊搜索 `q` 在原有单号/客户名之外，增加送货地址、送货电话、联系人、备注（仅订单单据字段，不 join 客户档案）。入库模糊搜索 `q` 在单号/供应商之外，通过 `EXISTS` 匹配 `purchase_items.product_name` 商品名快照。列表搜索条件抽到 `lib/list-filters.ts`，非法日历日边界在 `lib/date-range.ts` 校验后跳过，避免 500。

**Verification**
- `bun run --cwd apps/api typecheck` → PASS
- `bun run --cwd apps/api test` → PASS（7 files / 39 tests；含 `list-filters` 10 项、`date-range` 3 项）
- `bun run --cwd apps/miniapp build:weapp` → PASS（`dist` 含 ListTimeFilter 与新 placeholder）
- 独立评审：T1/T2 合规；非法日期 500 问题已修复并复审通过，无剩余 critical

**Journey log**
- `.worktrees/list-search` 已有同主题 WIP 与规格草稿，直接续作而不是另起分支
- 无 D1 测试基建时，用 Kysely DummyDriver + SqliteQueryCompiler 编译 `apply*ListFilters` 做 SQL 断言
- 非法 `YYYY-MM-DD`（如 2026-02-30）会让 `toISOString` 抛错；日历日校验后应 **跳过边界** 而非透传原串
- 入库商品名只匹配明细快照 `product_name`，不查当前商品库/规格名（已确认决策）
- weapp `Picker mode=date` 无法单独清空一端；整体清除走「清除时间」chip 即可

## [S1] Problem

订单列表与入库列表目前只能按关键词模糊搜索，且后端虽已预留 `from`/`to` 时间参数，前端未暴露任何时间范围入口：

1. 订单列表无法按开单日期区间筛选，只能翻页找单。
2. 订单模糊搜索仅匹配订单号与客户名，无法用送货地址、手机号、联系人、备注找回订单。
3. 入库列表无法按时间区间筛选；模糊搜索只匹配入库单号与供应商，无法用商品名找回入库单。

## [S2] Design

### 目标行为

1. **时间范围查询（订单 + 入库）**
   - 列表搜索框下方增加「时间」筛选 chip；默认收起。
   - 点开后展示开始/结束日期（复用 `DateRangeField`，两端平台差异化组件已存在）。
   - 任一日期变更后自动触发第 1 页查询；清空日期即取消时间条件。
   - 提供「清除」操作，一键清空两端日期并重新查询。
   - 时间参数语义（闭区间，按上海时区自然日）：
     - 订单：按 `orders.created_at`
     - 入库：按 `purchases.ordered_at`
   - 前端发送：
     - 两端均发送 `YYYY-MM-DD`（有则传，无则省略）
     - 后端归一化：
       - 订单（`created_at` 为 UTC ISO）：`from`→上海日起点 UTC ISO，`to`→上海日终点 UTC ISO
       - 入库（`ordered_at` 多为 `YYYY-MM-DD`）：`from`→当日 `YYYY-MM-DD`，`to`→`YYYY-MM-DDT23:59:59.999`
   - 非法或非日历日输入（如 `2026-02-30`、`not-a-date`）：helper 返回 `undefined`，列表条件 **跳过该边界**，不抛 500。
   - 后端已有 `from`/`to` 过滤逻辑，保持契约，仅在边界不全时继续支持单端筛选。

2. **订单模糊搜索字段扩展**
   - `q` 对以下字段做 `LIKE %keyword%`（OR）：
     - `orders.order_no`
     - `orders.customer_name`
     - `orders.delivery_address`
     - `orders.delivery_phone`
     - `orders.delivery_contact`
     - `orders.note`
   - **不** join 客户档案表（用户已确认仅订单单据字段）。
   - 列表页搜索 placeholder 调整为：`搜索单号 / 客户 / 地址 / 电话`。

3. **入库模糊搜索支持商品名**
   - `q` 对以下字段做匹配（OR）：
     - `purchases.purchase_no`
     - `purchases.supplier_name`
     - `purchase_items.product_name`（明细商品名快照，通过 `EXISTS` 子查询）
   - **不**匹配规格名快照，**不** join 当前商品库改名后的名称（用户已确认仅商品名快照）。
   - 列表页搜索 placeholder 调整为：`搜索入库单号 / 供应商 / 商品名`。

### 数据与接口

- `GET /api/orders`
  - 查询参数：`q`, `status`, `delivery_status`, `customer_id`, `from`, `to`, `only_unpaid`, `page`, `page_size`
  - 本功能改动点：`q` 扩展匹配字段；`from`/`to` 语义文档化并由前端传入完整自然日边界
- `GET /api/purchases`
  - 查询参数：`q`, `from`, `to`, `page`, `page_size`
  - 本功能改动点：`q` 增加 `EXISTS (purchase_items.product_name like)`；`from`/`to` 由前端接入
- 实现落点：`apps/api/src/lib/list-filters.ts`（条件）、`apps/api/src/lib/date-range.ts`（边界归一化）

### 前端

- `pages/orders/index.tsx`：时间 chip + DateRangeField 展开区 + from/to 查询参数；placeholder 更新
- `pages/purchases/index.tsx`：同上；placeholder 更新
- 复用组件：`components/list-time-filter`、`components/date-range-field`、`components/search-box`；样式沿用 `app.scss` 的 `sm-chips` / `list-header` / `picker-half`

### 测试边界

- API 层对 `applyOrderListFilters` / `applyPurchaseListFilters` 用 Kysely DummyDriver 编译 SQL 断言，覆盖：
  - 订单 `q` 命中送货地址/电话/联系人/备注
  - 入库 `q` 命中商品名快照 EXISTS（含 purchase_id 关联谓词）
  - `from`/`to` 单端与双端生效；非法日期跳过边界
- `date-range` helpers 单元测试：上海 UTC 边界、入库日边界、非法日历日
- 前端构建：`bun run --cwd apps/miniapp build:weapp`

## [S3] Out of Scope

- 客户档案表字段（电话/地址/客户地址簿）参与订单搜索
- 订单商品名 / 入库规格名 / 当前商品库名称参与列表搜索
- 时间快捷预设 chip（今日/近7天/本月）
- 筛选条件持久化、多条件组合高级筛选面板
- 排序切换、导出、库存类筛选
- LIKE 通配符转义（与 products/customers 现状一致，后续统一处理）

## Tasks

- [x] T1: 后端扩展订单/入库 `q` 字段与时间边界测试 — acceptance: 订单可按送货地址/电话命中；入库可按商品名快照命中；`from`/`to` 用例通过 (covers: S2)
- [x] T2: 订单/入库列表页接入时间筛选与搜索字段提示 — acceptance: 两页有可展开「时间」筛选，变更日期自动刷新；placeholder 反映新搜索范围 (covers: S2; depends: T1)
- [x] T3: 验证（api typecheck/test + miniapp weapp 构建）与规格终稿 — acceptance: 验证命令通过或标注 PRE-EXISTING；文档 status=delivered 并填写 Report (covers: S2; depends: T2)
