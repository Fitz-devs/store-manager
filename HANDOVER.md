# 店铺管家 · 需求清单与项目现状（交接文档）

> 单店自用的进销存 + 开单 + 赊账 + 配送管理系统
> 交付形态：微信小程序 + Web 网页版（同一套代码）
> 原则：全免费方案、单店、自己人用、够用就好

---

## 一、需求清单（含当前完成状态）

图例：✅ 已完成并验证 ｜ 🟡 代码就绪但缺配置/未实测 ｜ ⬜ 未做

### 1. 商品管理

| # | 需求 | 状态 |
|---|---|---|
| 1.1 | 扫商品码录入商品 | ✅ |
| 1.2 | 首次录入条码：**外网补全与 barcode_cache 均已删除**（2026-09），只查店内 `barcodes`；未命中手动填名称 | ✅（本地查询） |
| 1.3 | 手动录入：入库价、零售价、友情价、销售单位 | ✅ |
| 1.4 | 优惠信息（只做记录，如 "100元3件"、"买3送2"），且**优惠信息与其有效期关联展示** | ✅ |
| 1.5 | 优惠有效期为**日期范围**（开始/结束，可留空=不限，可清除），不是文本框 | ✅ |
| 1.6 | 记录每次入库价、零售价等价格变化（含旧值/新值/来源/原因/操作人） | ✅ |
| 1.7 | 商品详情展示价格变化趋势图（入库价） | ✅ |
| 1.8 | 商品详情展示入库记录（每次入库价格、数量） | ✅ |
| 1.9 | 商品图片：拍照/选图上传（R2），两端可用 | ✅ |
| 1.10 | 敏感信息默认隐藏（小眼睛）：友情价、入库价等 | ✅ |
| 1.11 | 整箱码与单件码关联（1箱=N件换算），详情可互相查看 | ✅ |
| 1.12 | 同一商品多个 SKU（如烟不同版本，商品码相同、价格不同）；扫码命中多 SKU 时弹选择器 | ✅ |
| 1.13 | 缺货标记（SKU 级）：列表角标 + "只看缺货"筛选 + 加购提示 + 入库时提示恢复 | ✅ |
| 1.14 | 商品别名（支持多个，空格/逗号分隔），参与模糊搜索 | ✅ |
| 1.15 | ~~奖品属性~~ **代码已删净** | — |
| 1.16 | 商品录入页：**条码在最前面**，但展示要小（只做录入，一行操作，不占大版面） | ✅ |
| 1.17 | 商品录入页：**图片是最大的元素**（全宽大图主视觉） | ✅ |

### 2. 入库

| # | 需求 | 状态 |
|---|---|---|
| 2.1 | 入库只记流水，不再改 SKU 价/价格历史（价格在「完善商品/商品编辑」阶段处理；进价差异在完善商品行内以「价差」提示确认） | ✅ |
| 2.2 | 入库单：供应商（文本字段）、日期、备注、明细、总额 | ✅ |
| 2.3 | 拍照 OCR 批量录入：拍照收货单 → 智谱 glm-ocr 识别成表格 → 原图对照人工确认/修改 → 匹配商品（名称模糊候选/新建）→ 生成入库单 | 🟡 代码就绪，需用真实单据实测 |
| 2.4 | 纯手工录入入口始终保留 | ✅ |
| 2.5 | ~~商品抵扣/以货换货入库~~ **代码与字段已删净**（迁移 0014） | — |

### 3. 开单与回款

| # | 需求 | 状态 |
|---|---|---|
| 3.1 | 扫码/搜索加购，支持一单多商品 | ✅ |
| 3.2 | 购物车改数量、改单价 | ✅ |
| 3.3 | 客户选择：搜索已有客户 / 现场新建；**全屏页面，不用浮窗**，创建/修改复用同一表单页 | ✅ |
| 3.4 | 送货上门：地址、联系人、电话、**约定送达时间（日期 + 时间选择器）** | ✅ |
| 3.5 | 客户多联系方式/多送货地址：开单时历史地址点选，新地址可保存回客户；客户详情可增删/设默认 | ✅ |
| 3.6 | 付款状态简化为**未付款 / 已付款**（不要单独的"赊账"开关） | ✅ |
| 3.7 | 付款方式**只在"已付款"时出现**：现金 / 微信 / 支付宝 / 其他（抵扣原因+金额） | ✅ |
| 3.8 | 回款可多次、可部分：支持**开单多笔组合收款**（每笔独立方式/金额/凭证照片），合计不超订单金额；已收齐后禁止再回款；余款在订单详情继续记 | ✅ |
| 3.9 | ~~以货换货~~ **代码已删净** | — |
| 3.10 | 送货拍照生成水印（时间 + 地址 + GPS + 送货人），小程序和网页都能拍 | ✅ |
| 3.11 | 订单列表入口（开单页"最近订单"+ 全部订单；"我的"页 全部/待收款/待送货） | ✅ |
| 3.12 | 订单详情：明细、配送信息、回款记录（含凭证照片预览）、记回款、作废、彻底删除 | ✅ |
| 3.13 | 订单状态：未回款 / 部分回款 / 已结清 / 已作废（由已收金额推导） | ✅ |

### 4. 客户

| # | 需求 | 状态 |
|---|---|---|
| 4.1 | 客户档案：姓名、电话、地址、备注 | ✅ |
| 4.2 | 多个联系方式 + 多个送货地址（带标签如 家/店/仓库，可设默认） | ✅ |
| 4.3 | 客户欠款汇总、订单历史、按客户记回款 | ✅ |

### 5. 账号与系统

| # | 需求 | 状态 |
|---|---|---|
| 5.1 | 账号密码登录（首次初始化老板账号，无内置默认密码） | ✅ |
| 5.2 | 微信一键登录（wx.login → openid 绑定已有账号） | ✅ Worker secrets 已配置；待真机绑定实测 |
| 5.3 | 用户管理（仅老板）：新增账号（老板/店员）、重置密码、停用/启用、**删除账号**（物理删除，历史单据保留、经办人显示"-"） | ✅ |
| 5.4 | 首页统计：今日销售、待收款、待送货、缺货数 | ✅ |
| 5.5 | 数据导出（当前 JSON） | ✅ |
| 5.6 | 自动备份：每日 Cron 导出到 R2 + D1 Time Travel 30 天 | ✅ |

### 6. 交付与技术约束

- 小程序和网页版**能力对齐**（扫码、拍照、OCR、水印、日期时间选择都要能跑）
- 后端全部部署在 Cloudflare 免费额度内；图片走 R2，Worker 自定义域名直连（ESA 接入为可选加速项）
- 前后端同一语言（TypeScript）；Bun 工具链
- 商品图片存 R2，域名前置 ESA CDN

---

## 二、已明确的产品决策（不要再扩大范围）

- **不算实时库存**：只记录出入库流水、入库记录、销售明细，不做库存余额/盘点/预警
- **不做离线**：在线即可
- **不做字段级权限**：老板+店员都能看入库价等敏感信息；"小眼睛"只是 UI 默认隐藏，防旁人偷看
- **优惠信息只记录**，不参与自动计算价格
- **不做复杂订单状态机**：配送状态 + 已收金额两个维度即可
- **单店、自己人用**：不需要多门店、多租户、复杂 CRM、供应商管理（入库单用文本字段）
- 评估过后端框架 bknd，因 beta 风险放弃，选 Hono + Kysely
- **奖品兑换、以货换货、商品抵扣、条码外网补全、barcode_cache 均已删净**（2026-09）；付款方式固定为 现金/微信/支付宝/其他
- **彻底删除**：商品（先下架引导，详情页亦可直接删）、订单、入库单均可物理删除（红色强确认）；删除只清本条数据及其子行/关联照片，历史单据行永不动
- **全库不使用外键**（迁移 0010）：关联完整性由应用层保证；订单/入库明细冗余商品快照字段

---

## 三、技术架构

```
微信小程序 / Web 版（Taro + React + TS，同一套代码）
   │  https://wj.160847.xyz（Worker 自定义域名，已可访问；ESA 可选接入）
   ▼
Cloudflare Worker（Hono + Kysely + zod）
   ├── D1        业务数据（SQLite；18 张表，**全库无外键**，完整性由应用层保证）
   ├── R2        商品图 / 单据原图 / 水印照 / 回款凭证照
   ├── OCR      智谱 glm-ocr（ZHIPU_API_KEY；本地可 OCR_MOCK=1 走假数据）
   ├── Static Assets  Web 版静态资源（Taro H5 产物 ./apps/miniapp/dist-h5）
   └── Cron      每日备份到 R2
```

### 目录结构

```
apps/api          Cloudflare Worker（Hono + Kysely）
  src/routes/     auth users products skus barcodes purchases ocr files customers orders payments reports categories
  src/services/   products purchases orders payments customers barcodes backup
  src/adapters/   storage.ts(R2) zhipu-ocr.ts(智谱)      ← 平台绑定只在这层
  src/db/         schema.ts(Kysely 类型) index.ts(bundle) batch.ts
  migrations/     0001~0012 SQL 迁移
  scripts/        setup-cloudflare.sh / seed-demo.sh / verify-ocr-import.sh
apps/miniapp      Taro 4.2.1 + React 18 小程序/网页
  src/components/ select-field / datetime-field / date-range-field（平台差异化组件）
  src/utils/      media.ts（跨端选图上传）scan.ts + scan.h5.ts（扫码）watermark 系列
packages/shared   前后端共享类型 + zod schema + 常量
```

### 关键实现约定（接手的 AI 必读）

1. **Taro H5 的 Picker 组件在 React 18 下有 hydration bug**（控制台 `taro-input-core.watchValue` 异常，交互层不渲染）。所有选择器都用 `src/components/` 下的平台组件：
   - 小程序端：Taro `Picker`（`.tsx`）
   - H5 端：原生 `<input type="date|time">` / `<select>` 覆盖在字段上（`.h5.tsx`）
   - 新增选择器时请沿用这个模式，不要直接用 Taro Picker
2. **`taro-button-core` 默认 `width: 100%`**。全局 `.btn { width: auto }` 已处理；在 flex 行里如果按钮异常占满，检查这条
3. **`taro-input-core` 是宿主元素**，全局样式已设 `display:block; flex:1; min-width:0`，flex 行里的输入框才能正常伸展
4. **H5 tab 页的固定底栏要避开 tabBar**：用 `utils/env.ts` 的 `TAB_PAGE_FOOTER_STYLE`（H5 下 bottom=50px，小程序为 0）
5. **H5 没有 `process` 对象**：`process.env.TARO_APP_API` 在 `config/index.ts` 的 `defineConstants` 注入，不能在运行时代码里裸用
6. **H5 静态资源**（如 tabBar 图标）需要在 `config/index.ts` 的 `copy.patterns` 显式拷贝，否则产物只有引用没有文件
7. **本地 `wrangler dev` 用 `wrangler.dev.toml`（不含 AI binding）**；测 OCR 用 `OCR_MOCK=1`（已在 dev 配置）走本地假数据，真实识别需配 `ZHIPU_API_KEY`
8. **条码查询**：`lookupBarcode` 只查本地 `barcodes` → 否则 `source: none`。外网补全链与 `barcode_cache` 表均已删除（迁移 0013）。
9. **删除与关联清理**：彻底删除商品/订单/入库单时，同步删除 R2 中关联照片（商品图/送货水印/单据照/回款凭证）；删图失败不影响主流程（先删库后删图）
10. 小程序端必须通过 `npx taro build --type weapp` 产物验证；网页端用 `wrangler dev` + 无头浏览器（CDP）截图验证过 UI

---

## 四、数据模型（18 张表，全库无外键）

| 表 | 说明 |
|---|---|
| users | 账号（username / password_hash / wechat_openid / role=owner\|staff / status） |
| products | 商品（name / aliases(JSON) / category / brand / notes / image_key / status=active\|archived） |
| skus | 规格（product_id / spec_name / sale_unit / retail_price / friend_price / latest_purchase_price / stock_status / status=active\|archived，归档代替规格级删除） |
| barcodes | 条码（code / sku_id / product_id / is_primary，多 SKU 商品用箱/件码区分版本） |
| promotions | 优惠（sku_id / content / starts_at / ends_at，一个规格可挂多条） |
| product_links | 关联商品（product_id / linked_product_id / relation / note，整箱↔单件互相跳转） |
| price_history | 价格历史（sku_id / price_type=purchase\|retail\|friend / old_value / new_value / source / reason / operator_id） |
| purchases | 入库单（purchase_no / supplier_name / total_amount / image_keys(JSON) / ocr_raw / ordered_at） |
| purchase_items | 入库明细（sku_id / **product_name/spec_name 快照** / unit_name / conversion / qty / base_qty / unit_price / amount） |
| customers | 客户（name / phone / address / notes） |
| customer_addresses | 客户地址（customer_id / label / contact_name / phone / address / is_default） |
| orders | 订单（order_no / customer_id / delivery_* / delivered_at / delivery_photo_key / subtotal / discount / total / paid_amount / is_credit / status / delivery_status） |
| order_items | 订单明细（sku_id / **product_name/spec_name 快照** / unit_name / conversion / qty / unit_price / amount / promotion_text） |
| payments | 回款（payment_no / order_id / method=cash\|wechat\|alipay\|other / amount / note / photo_key / received_at） |
| barcode_cache | ~~条码补全缓存~~ **已删除**（迁移 0013） | — |
| categories | 分类（name） |
| product_categories | 商品↔分类多对多 |
| settings | 键值配置（如店名） |

金额一律以"分"存 INTEGER；时间 ISO 字符串；单据号格式 `O`/`P`/`入库单号` + 序号（见 `lib/ids.ts`）。

---

## 五、API 概览（前缀 /api，Bearer JWT）

- `auth`：setup-status / setup / login / wx-login / wx-bind / me / change-password
- `users`：列表 / 新增 / 修改（昵称/角色/状态/重置密码） / **删除**（仅老板；物理删，不能删自己）
- `products`：列表（q 支持名称/别名/条码/品牌模糊，status=active\|archived\|all） / categories / 新增 / 详情（含 SKU/条码/优惠/关联商品/价格历史/入库记录） / 修改 / 下架 / **purge 彻底删除** / 新增 SKU / 新增条码 / 关联商品 / from-ocr-row 一键双建
- `skus`：修改（价格变更自动写历史） / 缺货切换 / 归档（不可归档最后一条在售规格） / 优惠增删
- `barcodes`：lookup（本地→缓存→外部补全） / enrich / 新增（code + 是否主码） / 修改 / 删除
- `purchases`：列表 / 详情 / check-prices（进价变动检测） / 新建 / **purge 彻底删除**
- `ocr`：/api/ocr/purchase（识别收货单，智谱 glm-ocr）
- `customers`：列表 / 新增 / 详情 / 修改 / 地址增删、设默认
- `orders`：列表 / 新建（payments 多笔组合收款，各笔可带 photo_key 凭证） / 详情 / 送达（水印照） / 作废 / **purge 彻底删除**
- `payments`：新建（多次/部分回款；校验不超余款；photo_key 凭证照片）
- `reports`：home（今日统计）/ export（JSON 导出）
- `files`：上传（R2，scope=products\|purchases\|deliveries\|payments\|misc）；`/files/*` 读取；`/status` 服务状态页

---

## 六、当前部署信息

| 项 | 值 |
|---|---|
| Cloudflare 账号 | fitz_dev@icloud.com（account id: 2a80b288ed08261799e8d0f85101a986） |
| Worker | store-manager-api |
| D1 | store-manager-db（id: 3660ef43-bf5c-4ac2-8870-7d3346792e4c） |
| R2 | store-manager-files |
| 对外域名 | `wj.160847.xyz`（Worker 自定义域名，同时托管 Web 版） |
| 回源源站 | `origin.160847.xyz`（ESA 回源用） |
| 域名注册 | 阿里云（NS 已在 Cloudflare） |
| 线上地址 | https://wj.160847.xyz（Web 版可直接访问） |
| 微信小程序 AppID | `wxfba378cc2a6f590a`（已写入 project.config.json；WX_APPID/WX_SECRET 已配为 Worker secrets） |

常用命令：

```bash
# 本地
cd apps/api && bun run migrate:local && bun run dev        # API http://127.0.0.1:8787
cd apps/miniapp && bun run dev:h5                          # 网页版 http://127.0.0.1:10086
cd apps/miniapp && bun run dev:weapp                       # 小程序（微信开发者工具导入 apps/miniapp）

# 数据库
cd apps/api && bun run db:reset          # 清空本地库
cd apps/api && bun run seed:demo         # 灌演示数据（admin/admin123，需 API 已启动）

# 部署（会先构建 Web 再发布）
cd apps/api && bun run setup:cloudflare  # 一键初始化 Cloudflare（首次）
cd apps/api && bun run migrate:remote    # 生产 D1 迁移（先迁移后部署）
cd apps/api && bun run deploy            # 构建 H5 + 部署 Worker
```

---

## 七、待完善事项（建议接手后按优先级处理）

1. **微信小程序提审的域名备案**（Web 版已可直接访问；小程序 request/uploadFile 合法域名要求备案，`160847.xyz` 备案后再提审；ESA 接入为可选加速）
2. **微信小程序上线配置**：AppID 已填；仍需服务器域名（https://wj.160847.xyz）、隐私协议、地理位置接口申请、提审。完整步骤见 `docs/wechat-miniprogram-setup.md`
3. **微信登录**：`WX_APPID` / `WX_SECRET` 已配置（线上 `wx_login_enabled: true`）；待真机走一遍绑定流程
4. ~~条码补全数据源~~ **已移除外网补全**（2026-09）；扫码只查本地库与历史缓存
5. **OCR 真实单据实测**：用真实收货单测智谱 glm-ocr 识别质量；如不理想可换 `ZHIPU_OCR_MODEL` 或降图片尺寸
6. 报表增强：毛利、日结、畅销/滞销（当前只有首页基础统计）
7. 送货单/小票分享（生成图片版，便于微信发给客户）
8. 数据导出支持 Excel/CSV（当前是 JSON）
9. 补测试：目前 30 个单元测试（6 个文件：金额换算、密码哈希、MD5/签名、条码提供方、OCR 草稿、智谱解析）；services 层资金路径（开单/回款/入库）尚无集成测试，建议用 vitest-pool-workers + 迁移建 schema 补齐
10. 错误监控（Workers 日志/告警）与例行备份恢复演练
11. 商品数据量大时的搜索优化（当前 LIKE，单店几千 SKU 足够）
12. 可能的交互优化：开单页购物车与订单列表的布局、商品详情的趋势图美化等

---

## 八、已完成的验证记录

- API 集成测试（curl）：初始化 → 建商品（多价格/条码/别名）→ 搜索 → 条码补全 → 入库 → 缺货 → 开单（赊账/现结）→ 多次回款 → 送货 → 统计 → 导出，全链路通过
- 单元测试：30 项通过（金额换算、单位价归一、涨跌幅、密码哈希、条码提供方解析、OCR 草稿）
- UI 验证：无头浏览器实际渲染验证（登录、开单、客户选择/新建、地址回显、付款、商品录入、日期范围等）
- 构建：H5 构建无警告；小程序 `bun run build:weapp` 可出包
- 线上：迁移 0001~0013 已应用（含 0010 去 prizes+全库去外键、0011 条码缓存去图、0012 回款凭证列、0013 drop barcode_cache）；Worker + Web 已部署，`/status` 正常。**0014（drop purchases.kind / payments.purchase_id）待 migrate:remote**
