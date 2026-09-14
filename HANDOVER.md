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
| 1.2 | 首次录入时调公开免费接口补全商品名称/图片（查询链：淘宝开放平台 → 阿里云云市场条码API → **极数本源免费版（国内覆盖 >95%，免费）** → Open Food Facts → Open Products Facts → UPCitemdb → Barcode Spider；结果写入本地条码缓存全店复用；图片服务端镜像到 R2，尽力转 WebP） | ✅（免费通道全部就绪；极数本源匿名即用） |
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
| 1.15 | 奖品属性：可免费兑换整件商品，或加 X 元换购；开单加购时选择"正常销售 / 奖品兑换" | ✅ |
| 1.16 | 商品录入页：**条码在最前面**，但展示要小（只做录入，一行操作，不占大版面） | ✅ |
| 1.17 | 商品录入页：**图片是最大的元素**（全宽大图主视觉） | ✅ |

### 2. 入库

| # | 需求 | 状态 |
|---|---|---|
| 2.1 | 录入数量和价格，**进价与上次不同时提示是否同步更新零售价**（涨跌都提示） | ✅ |
| 2.2 | 入库单：供应商（文本字段）、日期、备注、明细、总额 | ✅ |
| 2.3 | 拍照 OCR 批量录入：拍照收货单 → Workers AI 识别成表格 → 原图对照人工确认/修改 → 匹配商品（名称模糊候选/新建）→ 生成入库单 | 🟡 代码就绪，需用真实单据实测 |
| 2.4 | 纯手工录入入口始终保留 | ✅ |
| 2.5 | 商品抵扣/以货换货自动生成"商品抵扣"入库单 | ✅ |

### 3. 开单与回款

| # | 需求 | 状态 |
|---|---|---|
| 3.1 | 扫码/搜索加购，支持一单多商品 | ✅ |
| 3.2 | 购物车改数量、改单价 | ✅ |
| 3.3 | 客户选择：搜索已有客户 / 现场新建；**全屏页面，不用浮窗**，创建/修改复用同一表单页 | ✅ |
| 3.4 | 送货上门：地址、联系人、电话、**约定送达时间（日期 + 时间选择器）** | ✅ |
| 3.5 | 客户多联系方式/多送货地址：开单时历史地址点选，新地址可保存回客户；客户详情可增删/设默认 | ✅ |
| 3.6 | 付款状态简化为**未付款 / 已付款**（不要单独的"赊账"开关） | ✅ |
| 3.7 | 付款方式**只在"已付款"时出现**：现金 / 微信 / 支付宝 / 换货 | ✅ |
| 3.8 | 回款可多次、可部分：记录方式、金额、时间；开单只记第一笔，余款在订单详情继续记 | ✅ |
| 3.9 | 以货换货（行家换货）：录入抵扣商品，自动重新入库 | ✅ |
| 3.10 | 送货拍照生成水印（时间 + 地址 + GPS + 送货人），小程序和网页都能拍 | ✅ |
| 3.11 | 订单列表入口（开单页"最近订单"+ 全部订单；"我的"页 全部/待收款/待送货） | ✅ |
| 3.12 | 订单详情：明细、配送信息、回款记录、记回款、作废 | ✅ |
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
| 5.2 | 微信一键登录（wx.login → openid 绑定已有账号） | 🟡 代码就绪，待配置 WX_APPID / WX_SECRET |
| 5.3 | 店员账号管理（老板可新增/停用） | ✅ |
| 5.4 | 首页统计：今日销售、待收款、待送货、缺货数 | ✅ |
| 5.5 | 数据导出（当前 JSON） | ✅ |
| 5.6 | 自动备份：每日 Cron 导出到 R2 + D1 Time Travel 30 天 | ✅ |

### 6. 交付与技术约束

- 小程序和网页版**能力对齐**（扫码、拍照、OCR、水印、日期时间选择都要能跑）
- 后端全部部署在 Cloudflare 免费额度内；图片走 R2，前置阿里云 ESA CDN（待备案后接入）
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
- 商品抵扣（换货）会生成入库单；单纯"奖品兑换"按奖品价计价，不生成额外单据

---

## 三、技术架构

```
微信小程序 / Web 版（Taro + React + TS，同一套代码）
   │  https://wj.160847.xyz（备案后接入阿里云 ESA，目前大陆直连不通）
   ▼
阿里云 ESA（CDN + 备案接入，待接入） → 回源 origin.160847.xyz
   ▼
Cloudflare Worker（Hono + Kysely + zod）
   ├── D1        业务数据（SQLite；14 张表）
   ├── R2        商品图 / 单据原图 / 水印照
   ├── Workers AI  收货单 OCR（默认 @cf/google/gemma-4-26b-a4b-it，备选 moondream3.1）
   ├── Static Assets  Web 版静态资源（Taro H5 产物 ./apps/miniapp/dist-h5）
   └── Cron      每日备份到 R2
```

### 目录结构

```
apps/api          Cloudflare Worker（Hono + Kysely）
  src/routes/     auth users products skus barcodes purchases ocr files customers orders payments reports
  src/services/   products purchases orders payments customers barcodes backup
  src/adapters/   storage.ts(R2) ai.ts(Workers AI)      ← 平台绑定只在这层
  src/db/         schema.ts(Kysely 类型) index.ts(bundle) batch.ts
  migrations/     0001~0006 SQL 迁移
  scripts/        setup-cloudflare.sh / seed-demo.sh
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
7. **本地 `wrangler dev` 用 `wrangler.dev.toml`（不含 AI binding）**，测试 OCR 需 `bun run dev:remote`（需 `wrangler login`）
8. **条码补全链**（`src/services/barcodes.ts`，按顺序命中即停，结果全部缓存；69 开头国内码会优先走国内源）：
   1. 淘宝码上淘 `taobao.ma.barcode.productinfo.get`（免费但**需企业开发者**，见 `services/taobao.ts` + `lib/md5.ts`）
   2. 阿里云云市场条码API（**个人可**，有免费试用次数；通用通道：配 `ALI_MARKET_BARCODE_URL` + `ALI_MARKET_APPCODE`，兼容"聚美智数 / 物品编码中心 / 万维易源 showapi"三种返回结构）
   3. **极数本源免费版** `GET https://v1.apizero.cn/api/barcode-lookup?barcode=`（免费，国内日常消费品覆盖 >95%；匿名 20 次/天，配 `APIZERO_KEY`（免费注册）200 次，QPS 2；免费版**不含图片**，无 key 也能用）
   4. Open Food Facts（食品，无 key，无限制）
   5. Open Products Facts（通用商品，无 key）
   6. UPCitemdb（100 次/天，按 IP）
   7. Barcode Spider（配 `BARCODESPIDER_TOKEN`，免费用户 100 次/天）
   都查不到 → 手动录入。
9. **图片镜像**：`cf.image` 转 WebP（免费额度 5000 次唯一变换/月），失败自动回退原图；图片存 R2 后同域输出，小程序无跨域/域名问题
10. 小程序端必须通过 `npx taro build --type weapp` 产物验证；网页端用 `wrangler dev` + 无头浏览器（CDP）截图验证过 UI

---

## 四、数据模型（17 张表）

| 表 | 说明 |
|---|---|
| users | 账号（username / password_hash / wechat_openid / role=owner\|staff / status） |
| products | 商品（name / aliases(JSON) / category / brand / notes / image_key） |
| skus | 规格（product_id / spec_name / sale_unit / retail_price / friend_price / latest_purchase_price / stock_status / status=active\|archived，归档代替删除） |
| barcodes | 条码（code / sku_id / product_id / is_primary，多 SKU 商品用箱/件码区分版本） |
| promotions | 优惠（sku_id / content / starts_at / ends_at，一个规格可挂多条） |
| prizes | 奖品（sku_id / description / extra_price，一个规格可挂多种兑换） |
| product_links | 关联商品（product_id / linked_product_id / relation / note，整箱↔单件互相跳转） |
| price_history | 价格历史（sku_id / price_type=purchase\|retail\|friend / old_value / new_value / source / reason / operator_id） |
| purchases | 入库单（purchase_no / supplier_name / kind=purchase\|goods_offset / total_amount / image_keys / ocr_raw / ordered_at） |
| purchase_items | 入库明细（sku_id / unit_name / conversion / qty / base_qty / unit_price / amount / price_changed / retail_updated） |
| customers | 客户（name / phone / address / notes） |
| customer_addresses | 客户地址（customer_id / label / contact_name / phone / address / is_default） |
| orders | 订单（order_no / customer_id / delivery_* / delivered_at / delivery_photo_key / subtotal / discount / total / paid_amount / is_credit / status / delivery_status） |
| order_items | 订单明细（sku_id / unit_name / conversion / qty / unit_price / amount / promotion_text） |
| payments | 回款（payment_no / order_id / method=cash\|wechat\|alipay\|goods / amount / purchase_id / received_at） |
| barcode_cache | 条码补全缓存（code / name / brand / spec / image_url / image_key / source） |
| settings | 键值配置（如店名） |

金额一律以"分"存 INTEGER；时间 ISO 字符串；单据号格式 `YYMMDD-序号`。

---

## 五、API 概览（前缀 /api，Bearer JWT）

- `auth`：setup-status / setup / login / wx-login / wx-bind / me / change-password
- `users`：列表 / 新增 / 修改 / 停用（仅老板）
- `products`：列表（q 支持名称/别名/条码/品牌模糊） / categories / 新增 / 详情（含 SKU/条码/优惠/奖品/关联商品/价格历史/入库记录） / 修改 / 下架 / 新增 SKU / 新增条码 / 关联商品
- `skus`：修改（价格变更自动写历史） / 缺货切换 / 归档（不可删最后一条在售规格） / 优惠增删 / 奖品增删
- `barcodes`：lookup（本地→缓存→外部补全） / enrich / 新增（code + 是否主码） / 修改 / 删除
- `purchases`：列表 / 详情 / check-prices（进价变动检测） / 新建
- `ocr`：/api/ocr/purchase（识别收货单）
- `customers`：列表 / 新增 / 详情 / 修改 / 地址增删、设默认
- `orders`：列表 / 新建（支持多奖品兑换、换货付款） / 详情 / 送达（水印照） / 作废
- `payments`：新建（多次/部分回款；goods 方式自动生成入库单）
- `reports`：home（今日统计）/ export（JSON 导出）
- `files`：上传（R2）；`/files/*` 读取；`/status` 服务状态页

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
| 线上地址 | https://wj.160847.xyz（**大陆直连不通，需备案 + ESA**） |
| 微信小程序 | 未配置 AppID（project.config.json 目前是 touristappid） |

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
cd apps/api && bun run deploy            # 迁移需手动：bunx wrangler d1 migrations apply store-manager-db --remote
```

---

## 七、待完善事项（建议接手后按优先级处理）

1. **备案 + 阿里云 ESA 接入**（当前最大阻塞：大陆无法直连，微信小程序域名也必须备案）
   - 备案域名 `160847.xyz` → ESA 加速 `wj.160847.xyz` → 回源 `origin.160847.xyz`
   - ESA 缓存规则：`/files/*` 缓存、`/api/*` 不缓存
2. **微信小程序上线配置**：AppID、服务器域名（https://wj.160847.xyz）、隐私协议、地理位置接口申请、提审
3. **微信登录**：配置 `WX_APPID` / `WX_SECRET` 两个 Worker secret 并实测绑定流程
4. **条码补全数据源**：
   - **极数本源（推荐先配，免费）**：https://apizero.cn/account/keys 注册拿 Key → `wrangler secret put APIZERO_KEY`（不配也能用，匿名 20 次/天；配了 200 次，QPS 2）
   - 阿里云云市场（个人可，国内覆盖最好、含图片数据集）：搜索"商品条码查询"，选带免费试用的供应商 → `ALI_MARKET_BARCODE_URL` / `ALI_MARKET_APPCODE`
   - Barcode Spider（免费 100 次/天）：devapi.barcodespider.com 注册 → `BARCODESPIDER_TOKEN`
   - 淘宝开放平台需企业认证，个人不可用（代码已就绪 `TB_APP_KEY`/`TB_APP_SECRET`）
5. **OCR 真实单据实测**：用真实收货单测 Workers AI 识别质量；如不理想可换模型或降图片尺寸
6. 报表增强：毛利、日结、畅销/滞销（当前只有首页基础统计）
7. 送货单/小票分享（生成图片版，便于微信发给客户）
8. 数据导出支持 Excel/CSV（当前是 JSON）
9. 补测试：目前 12 个单元测试（金额换算、密码哈希、MD5/签名）+ 手工集成测试，建议补关键业务逻辑测试（价格变更、回款核销、抵扣入库）
10. 错误监控（Workers 日志/告警）与例行备份恢复演练
11. 商品数据量大时的搜索优化（当前 LIKE，单店几千 SKU 足够）
12. 可能的交互优化：开单页购物车与订单列表的布局、商品详情的趋势图美化等

---

## 八、已完成的验证记录

- API 集成测试（curl）：初始化 → 建商品（多价格/条码/别名/奖品）→ 搜索 → 条码补全+图片镜像 → 入库（入库价变动同步售价）→ 缺货 → 开单（赊账/现结/换货/奖品）→ 多次回款 → 送货 → 统计 → 导出，全链路通过
- 单元测试：8 项通过（金额换算、单位价归一、涨跌幅、密码哈希）
- UI 验证：无头 Edge + CDP 实际渲染截图（登录、开单、客户选择/新建、地址回显、付款、奖品选择、商品录入、日期范围等）
- 构建：小程序 `dist` 648~688K 无警告；H5 构建无警告
- 线上：迁移 0001~0006 已应用，Worker + Web 已部署，`/status` 正常
