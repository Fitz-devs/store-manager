---
feature: order-address-map
status: delivered
updated: 2026-09-17
branch: main
commits: 11019bfd8e7eba4cd3d3df4cc96f88003eba112a..HEAD
---

# 订单地址跳转地图导航

## Report

**What was built** — 客户地址与订单送货地址支持 GCJ-02 坐标。小程序可 `chooseLocation` 选点，回填「行政地址 + POI 名称」供继续改门牌；订单/客户详情地址可点打开微信地图（标题为地址本身，不用客户名）；H5 有坐标跳高德导航 URI，无坐标复制地址。开单选历史地址带坐标；订单详情送货信息竖排；商品行可跳商品详情。

**Verification**
- `cd apps/api && bun run typecheck` → PASS
- `cd apps/api && bun run test` → PASS（含 `address-coords` 坐标 schema 用例）
- `cd apps/miniapp && bun run build:weapp` / `build:h5` → PASS
- 真机预览联调：选点回填、地图导航、订单详情布局与商品跳转均已调整
- 评审：`requiredPrivateInfos` 含 `chooseLocation`；坐标成对 + 严格 number

**Journey log**
- 微信 `chooseLocation` 必须写入 `requiredPrivateInfos`
- 选点 `address` 常只有区级，需与 POI `name` 拼接回填
- 地图标题用地址，不要客户名
- 小程序 `Image` 在 flex 下可能高度塌陷导致缩略空白，需外层固定尺寸
- 迁移号避开 main 已占用的 `0013`/`0014`，本功能用 `0015`

## [S1] Problem

送货单与客户常用地址是纯文本，无法一键定位/导航；历史地址无坐标。

## [S2] Design

### 目标行为

1. **地图选点**：`chooseLocation` 得 GCJ-02 坐标；回填 `行政地址 + POI 名`，输入框可继续改门牌，改字不清坐标。
2. **开单**：chip 带上 lat/lng；提交写入订单；保存客户地址带坐标；命中旧地址缺坐标时 PATCH 回填。
3. **打开地图**：有坐标 weapp `openLocation` / H5 高德 URI；无坐标 weapp 补点或复制，H5 复制。标题为地址。
4. **客户详情**：地址可导航；补坐标只写 lat/lng，不覆盖详细地址。
5. **订单详情**：送货信息竖排；商品行点击进商品详情（`product_id` 由 sku 关联）。

### 数据与接口

- 迁移 `0015_address_coords.sql`：`customer_addresses.lat/lng`、`orders.delivery_lat/lng`
- 校验：严格 `z.number()`，lat/lng 成对
- `PATCH /api/customers/:id/addresses/:addressId`：`{ address?, lat?, lng? }`
- `PATCH /api/orders/:id/delivery-location`：`{ lat, lng, address? }`
- `OrderItem.product_id`（join skus）
- `requiredPrivateInfos`: `getLocation`, `chooseLocation`

## [S3] Out of Scope

- 地理编码 / 文字自动转坐标
- 多地图选商、路径规划 UI
- 客户顶层 `customers.address` 坐标
- 电话一键拨号

## Tasks

- [x] T1: 迁移 + 类型/校验 + 客户地址/订单坐标 API (covers: S2)
- [x] T2: map 工具 + 订单/客户/开单页接入与真机 UX 修正 (covers: S2; depends: T1)
- [x] T3: 验证与评审 (covers: S2; depends: T2)
