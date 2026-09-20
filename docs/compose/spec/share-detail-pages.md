---
feature: share-detail-pages
status: delivered
updated: 2026-09-20
branch: feat/share-detail-pages
commits: f754c68..b0248a3
---

# 小程序详情页分享

## Report

**What was built** — 4 个详情页（订单 / 入库 / 商品 / 客户）添加 `onShareAppMessage`，同事之间可直接转发单据或商品链接。分享标题自动取单号 / 金额 / 欠款，path 携带 id，对方打开「详情」页自动跳到对应记录。详情未加载完成时回退到「店铺管家」+ 对应列表页。H5 / 朋友圈不配（详情接口要登录态，陌生人打不开）。

**Verification**
- `bun run --cwd apps/miniapp build:weapp` → PASS（dist/app.js 生成）
- `bun run --cwd apps/miniapp build:h5` → PASS（dist-h5/index.html 生成）
- 独立 review 初审 partial：customer-detail 标题里 `formatFen().replace('¥','')` 把 ¥ 干掉了；修复并重编 PASS
- review 重审修复后 PASS

**Journey log**
- 仓库之前完全没有 `onShareAppMessage` 配置——转发菜单自然就不出现，跟版本无关
- H5 与朋友圈场景因登录态限制暂不做：详情接口需要本店登录，陌生人打开也是去登录页
- 列表 / 表单 / 设置页不分享：对方也需登录本店，列表分享意义不大；表单 / 设置打开是空状态

## [S1] Problem

微信小程序必须显式声明 `onShareAppMessage`，否则右上角「···」没有「转发」菜单。
当前 20 个页面都没声明，店里同事无法互相转发订单 / 商品 / 客户 / 入库单详情。

## [S2] Design

### S2.1 范围

仅 4 个详情页加 `onShareAppMessage`：

| 页面 | 分享标题 | path |
|---|---|---|
| `order-detail` | `订单 O{no} ¥{total}` | `/pages/order-detail/index?id={id}` |
| `purchase-detail` | `入库单 {no} ¥{total}` | `/pages/purchase-detail/index?id={id}` |
| `product-detail` | `{product.name}` | `/pages/product-detail/index?id={id}` |
| `customer-detail` | `客户 {name}`（+ ` 欠款 ¥{amount}` 若 > 0）| `/pages/customer-detail/index?id={id}` |

不在范围：列表页、设置页、登录页、表单页（*-new / *-edit / customer-select）。理由：列表分享意义不大（对方也要登录本店）；表单 / 设置分享打开是空状态。

### S2.2 契约

```ts
onShareAppMessage = () => ({
  title: <summary string, see table above>,
  path: <current page path with id query>,
})
```

要点：
- `path` 必须包含 `id` 参数，对方打开 `useDidShow` 拉数据
- `title` 截断 ≤ 50 字符（小程序限制）
- 数据未加载完成时（`detail` 为 `null`）：返回兜底文案「店铺管家」并回退到对应列表页 path（无 id）
- 不配 `onShareTimeline`（朋友圈）：详情接口要登录态，陌生人打不开
- 不引入新依赖（`@tarojs/taro` 已导出 `onShareAppMessage`）

## [S3] Out of Scope

- 列表页分享（path 携带筛选条件、URL 过长、对方也要登录）
- 表单页分享
- 朋友圈分享（陌生人无法登录）
- 二维码小程序码生成

## Tasks

- [x] T1: order-detail 加 `onShareAppMessage` — acceptance: 转发菜单出现，标题含订单号和金额，path 带 id（covers: S2.1, S2.2）
- [x] T2: purchase-detail 同 — acceptance: 标题含入库单号和金额，path 带 id（covers: S2.1, S2.2）
- [x] T3: product-detail 同 — acceptance: 标题为商品名，path 带 id（covers: S2.1, S2.2）
- [x] T4: customer-detail 同 — acceptance: 标题含客户名与欠款（¥{amount}），path 带 id（covers: S2.1, S2.2）
- [x] T5: typecheck / weapp build — acceptance: 都 PASS（covers: S2.2）