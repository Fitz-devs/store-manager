---
feature: ai-mode-skills
status: delivered
updated: 2026-09-19
branch: feat/ai-mode-skills
commits: 2938798..2abcf4e
---

# 微信小程序 AI 开发模式接入（四 SKILL）

## Report

**What was built** — 微信「小程序 AI 开发模式」接入（内测能力，开发版使用，官方要求相关代码不入正式提审）：`app.config.ts` 声明 `agent` 四个 SKILL + `lazyCodeLoading` + `aiSkill` 独立分包（空 pages，Taro 4.2.1 实测原样保留），SKILL 静态文件经 copy.patterns 进包。**querySkill** 只读查询（商品价格/客户欠款/销售订单）；**orderSkill** 开单：匹配商品客户 → 对话复述明细与收款 → 用户明确同意后 `submitOrder` 直接 POST /api/orders（多笔收款/未付款/优惠/送货）；**purchaseSkill** 入库：模型读图或 `recognizePurchaseSlip`（format:image 智谱降级）→ match → 确认后 `submitPurchase` 直接入库；`queryPurchases` 提供入库单号→purchase_id 解析；`patchPurchaseImages` 补传照片；**productSkill** 商品管理（建档/批量建档/加规格/改价/缺货标记/下架），**所有变更类操作契约：复述明细获用户明确同意后才能调用**（mcp.json description + SKILL.md + AGENTS.md 三层落地）。后端新增 `PATCH /api/orders/:id`（orderUpdateSchema + updateOrder + 旧送货照 R2 清理）、purchaseUpdateSchema.ordered_at 改 optional（PATCH 部分更新）；移动端 purchase-detail「补充上传照片」/ order-detail「替换送货照」按钮。18 个原子接口名跨 SKILL 全局唯一；单号域区分（入库单号纯数字 vs 订单号 O 开头，AGENTS.md 约束7）。运行时共享 storage：app.ts 写 `sm_api_base`，原子接口用 `sm_token` 鉴权。AI 对话内图片传递（format:image）实测运行时传占位符 `{{image_xxx}}` 而非真实路径——接口已做占位符防御并引导页面手动补传，该能力待微信侧完善。

**Verification** —
- `node --check` 全部 SKILL JS + mcp.json JSON.parse：PASS；18 接口名全局唯一：PASS
- `bun run build:weapp` / `build:h5`：PASS；dist/app.json 含 agent 四 SKILL + aiSkill 独立分包；页面按钮与 AI 接口均进包
- `bun run test`（apps/api）：46/46 PASS；apps/api tsc 无新增错误（miniapp 存量基线错误未动）
- 端到端桩实跑（node + wx mock 对本地 API）：查询三接口、submitOrder（现结/未付款/超额拒绝）、submitPurchase（带图/无图/占位符降级）、productSkill 六接口（改价 reason 强校验/无条码建档回退）、queryPurchases 单号解析 → patchPurchaseImages 补传、占位符防御三路径：全部符合契约
- 微信开发者工具：编译通过；AI 编译面板加载 SKILL（querySkill 描述可见）；运行时 "No. of subpackages: 1"
- 真实收货单对话测试：模型读图识别正确；单号域错配已由 queryPurchases + 引导修复

**Journey log**
- **空 pages 独立分包可用**：原设计占位页兜底，实测 Taro 4.2.1 原样保留 dist/app.json 与运行时双重验证，占位页删除
- **落库形态两次演进**：初版草稿接力（storage 桥 + page-link）→ 用户定案「AI 对话内复述确认 → submitOrder/submitPurchase 直接 POST」；tab 页 handoff 行为未定义是不用 handoff 的原因
- **原子接口名跨 SKILL 全局唯一**（真机调试 -80426 硬约束）：searchCustomers → matchCustomers 改名，18 接口保持唯一
- **format:image 实测传占位符** `{{image_6984}}` 而非真实文件路径：对话内图片补传暂不可用，接口占位符检测 + 详情页手动补传为可靠路径；content 含「失败」字样会被调试面板误报「未收到有效响应」，写操作失败文案需温和并给人工出口
- **联调陷阱**：页面请求走烤入产物的 API_BASE（不读 sm_api_base），模拟器联调须以 LAN IP 重建产物；devtools 重编译会清 storage；node + wx mock 桩是原子接口的可复用测试法

## [S1] Problem

微信「小程序 AI 开发模式」资格已批（AppID wxfba378cc2a6f590a）。店主希望能对小程序 AI 说话完成高频操作：查商品价格/客户/订单，以及语音开单。当前小程序没有任何 SKILL 接入，AI 无法调用店内数据。

本轮目标：搭好 AI 模式公共接入（agent 配置 + 独立分包），并交付查询、开单、入库、商品管理 SKILL，全部复用现有 Hono API，零后端改动。在 nightly 开发者工具中可调试，AI 真机对话测试由用户手动完成。

## [S2] Design

### S2.1 公共接入（weapp-only，H5 不受影响）

- `app.config.ts`：
  - `lazyCodeLoading: "requiredComponents"`（官方要求）
  - `subPackages` 增加 `{ root: 'aiSkill', independent: true, pages: [] }`。空 pages 独立分包经实测 Taro 4.2.1 原样保留（dist/app.json + devtools 运行时 "No. of subpackages: 1" 双重验证），无需占位页。
  - `agent` 字段：`{ skills: [querySkill, orderSkill], instruction: 'aiSkill/AGENTS.md' }`。`agent` 不在 Taro 类型中，经现有 `as unknown as` 断言透传。
- SKILL 文件是纯静态 JS/MD/JSON（官方目录结构），**不走 webpack 编译**：源码放 `src/aiSkill/`（不被 import，不参与打包），通过 `config/index.ts` 的 `copy.patterns`（weapp 分支）拷贝到 `dist/aiSkill/`。apis 用 CommonJS 纯 JS。
- `src/aiSkill/` 目录：
  ```
  aiSkill/
    AGENTS.md                      # 全局提示词（≤10000B）
    querySkill/{SKILL.md,mcp.json,index.js,lib.js,apis/*.js}
    orderSkill/{SKILL.md,mcp.json,index.js,lib.js,apis/*.js}
  ```
- 环境共享：原子接口运行在独立 JS 环境，与小程序共享 storage。`app.ts` 启动时写 `sm_api_base`（取自现有 `API_BASE`），原子接口用 `wx.getStorageSync('sm_api_base')` 取 API 地址；鉴权复用现有 `sm_token`（Bearer 头）。
- API 响应信封 `{ok,data,error}` 由原子接口自行解包；401 时返回 `isError: true` + 引导去小程序重新登录，不静默。

### S2.2 querySkill（只读）

原子接口（全部 GET，复用现有路由）：

| 接口 | 上游 | 返回要点 |
|---|---|---|
| `searchProducts({keyword, limit?≤10})` | `/api/products?q=&page_size=`，再对每个商品取 `/api/products/:id` 拿 SKU | sku 级：sku_id、product_id、name（商品名+规格合并展示，如「可乐 330ml（经典版）」）、sale_unit、retail_price_yuan（分→元由代码换算，不让模型算）、缺货标记；`outputSchema` 标 `pagePath`（`pages/product-detail/index?id=<product_id>`，`format:"page-link"`，`x-link-text-field` 指向商品名字段） |
| `searchCustomers({keyword, limit?≤10})` | `/api/customers?q=` | customer_id、name、phone、unpaid_amount_yuan；page-link → `pages/customer-detail/index?id=` |
| `queryOrders({q?, status?, delivery_status?, only_unpaid?, from?, to?})` | `/api/orders` | order_id、order_no、customer_name、total_yuan、paid_amount_yuan、status、delivery_status、created_at；page-link → `pages/order-detail/index?id=` |

- 金额一律由接口代码分→元格式化为字符串放入 `structuredContent`；`content` 遵循「事实 + 动作」两段式。
- 未匹配/空结果：content 说明事实 + 给出口（换关键词）+ 禁止原样重调。

### S2.3 orderSkill（对话确认后直接下单）

设计决策：**不用 handoff**（order-new 是 tabBar 页，接力到 tab 页行为未定义），用 **storage 草稿桥 + 文本混排蓝链**。

原子接口：

| 接口 | 行为 |
|---|---|
| `matchProducts({keywords:string[]≤20})` | 每个关键词调 `/api/products?q=`（≤3 条/词）+ `/api/products/:id` 取 SKU，返回候选：sku_id、product_id、product_name（含规格）、sale_unit、retail_price_yuan、promotions 文本；多商品/多 SKU 命中时标 `ambiguous: true` 供模型追问 |
| `matchCustomers({keyword})` | 同 querySkill 契约（orderSkill 内独立声明；接口名因 -80426 全局唯一约束改名） |
| `patchOrderDeliveryPhoto({order_id, imagePath, note?})` | **补传**：用户明确要求时调用；imagePath 走 format:image 上传后 `PATCH /api/orders/:id`（本轮新增：orderUpdateSchema {note, delivery_photo_key} + updateOrder 服务，旧送货照 R2 清理）；不改变收款与送达状态；返回详情蓝链。订单详情页「已送达」订单另有「替换送货照」按钮走同一 PATCH |
| `submitOrder({items:[{sku_id, product_id, qty, unit_price_yuan?}], customer_id?, is_credit?, discount_yuan?, payments?, delivery?, note?})` | **用户定案：对话确认后直接下单，不走草稿接力**。复述客户/明细/合计/收款（或未付款）获明确同意后调用；双重校验 ID；单价默认零售价（议价显式传参）；payments 合计超订单金额拒绝；未付款默认 is_credit；送货信息可选；`POST /api/orders` 落库；返回单号+明细+`orderDetailPath` page-link「查看订单」。确认契约：mcp.json description + SKILL.md 硬约束 |

- `submitOrder` 校验：items ≤200、qty>0、sku_id 必须存在于 product_id 对应商品且 active，编造/跨商品 ID 一律 `isError` 并指引重跑 matchProducts；payments 合计超过订单金额拒绝；客户 ID 经 `/api/customers/:id` 校验存在。
- 订单备注（note）：submitOrder 支持传 note 直接落库。
- 落库方式（用户定案 2026-09-19）：开单与入库均为「AI 对话内复述 → 用户明确同意 → submitOrder/submitPurchase 直接 POST」；`sm_ai_order_draft`/`sm_ai_purchase_draft` 草稿桥代码在 order-new/purchase-new 页保留但对话流不再写入。

### S2.4 order-new 草稿预填

- `pages/order-new/index.tsx` 增加 `useDidShow`：读 `sm_ai_order_draft`；存在则先清 storage（防双消费），然后：
  - 购物车为空 → 直接预填 items（payload 的 `SkuWithBarcodes` 直接构成现有 `CartItem`，lineId 本地生成）+ 客户（复用 `applyCustomer`，含地址联动），并 toast 提示；
  - 购物车非空 → `Taro.showModal` 询问是否用 AI 草稿替换，确认后替换，取消仅弃草稿（已清 storage）。
- 预填后数据仍走现有提交链路（含价格、库存、付款），不改提交逻辑。
- 代码全部 `process.env.TARO_ENV === 'weapp'` 守卫的部分（如 wx.* 直调）遵循仓库平台差异约定；H5 下草稿桥同样可用（storage 是 Taro 抽象），预填逻辑跨端生效。

### S2.5 SKILL 文案规范（官方最佳实践）

- mcp.json：接口 description 首句点业务对象；ID 类字段声明取值来源接口；同名字段跨接口统一（sku_id/customer_id/order_id）。
- SKILL.md：只写业务流程编排、跨接口约束（submitOrder/submitPurchase 前必须复述明细获用户明确同意）、意图分流；接口清单只写前置条件与上下游。
- AGENTS.md：说明店铺管家业务域、两个 SKILL 的分工与关联、回答风格；不写死回复格式、不含越狱语句。

### S2.6 purchaseSkill（入库草稿，第二轮加入）

对话处理收货单：模型读图/口述明细 → 匹配店内商品 → **复述明细获用户明确同意 → submitPurchase 直接提交入库单**（用户定案：不要草稿接力页面）。开单同理走 submitOrder。

| 接口 | 行为 |
|---|---|
| `recognizePurchaseSlip({imagePath})` | **降级通道**。`inputSchema.imagePath` 标 `"format":"image"`（官方多模态声明）；`wx.uploadFile` 传 `/api/files`（scope=purchases）→ `POST /api/ocr/purchase`（智谱/本地 mock）→ 返回 draft.rows（含条码、单位价分→元）+ 抬头 supplier_name/date |
| `matchPurchaseItems({rows})` | 单据行匹配：有 box_code/unit_code 优先 `GET /api/barcodes/lookup`，否则按品名 `/api/products?q=` + 详情取 SKU；返回 sku_id/product_id/零售价/**latest_purchase_price_yuan（库内进价对照）**/ambiguous/not_found |
| `queryPurchases({q?, from?, to?, limit?})` | `GET /api/purchases?q=`（单号/供应商模糊）→ 返回 purchase_id/purchase_no/供应商/金额/`image_count`/详情 page-link。**单号→purchase_id 解析入口**：用户给入库单号（纯数字）时先调本接口，再 patchPurchaseImages；空结果 content 引导「入库单号 vs 订单号（O 开头）」域区分（用户实测缺口，2026-09-19） |
| `patchPurchaseImages({purchase_id, imagePath?, image_keys?})` | **补传**：用户明确要求时调用；purchase_id 取自 queryPurchases/submitPurchase 原值；imagePath 走 format:image 自动上传，image_keys 可合并；`PATCH /api/purchases/:id`（旧 key 会被 R2 清理）；返回单号+详情蓝链。入库详情页另有「补充上传照片」按钮走同一 PATCH（追加语义，客户端合并 image_keys） |
| `submitPurchase({items:[{sku_id, product_id, qty, unit_name?, conversion?, unit_price_yuan?}], supplier_name?, ordered_at?, note?, imagePath?, image_keys?})` | **用户定案：对话确认后直接入库，不走草稿接力**。复述明细/金额获明确同意后调用；双重校验 product_id+sku_id；单价优先单据价（元→分代码换算）缺省回退 latest_purchase_price×conversion；`POST /api/purchases` 落库；返回单号+明细+`purchaseDetailPath` page-link「查看入库单」。确认契约落在 mcp.json description + SKILL.md 硬约束（复述品名/数量/单价/金额/供应商/合计，用户明确同意才能提交）。`imagePath`（format:image）与 `image_keys` 均可挂图；**上传失败不阻断入库**，content 提示用户到入库详情页补充上传（温和文案，不带「失败」字样） |

- 路径设计：**路径 A（推荐，省钱）** 模型直接读对话中的单据图出 JSON，调 matchPurchaseItems；**路径 B（降级）** 模型把握不足或用户要求时走 recognizePurchaseSlip（即现有智谱 OCR 管道）。真实单据的模型识别准确率仍需上线前实测。
- 接口名全局唯一约束下命名：`recognizePurchaseSlip`/`matchPurchaseItems`/`submitPurchase`（全量 15 个接口跨 4 SKILL 唯一）。
- `pages/purchase-new/index.tsx` 的 `sm_ai_purchase_draft` 草稿桥代码保留（无害），但对话主流程已不再写入该键；页面手工入库路径不受影响。

### S2.7 productSkill（商品档案管理，第三轮加入）

对话式商品管理。**变更确认契约（用户指定）：所有写接口（建档/加规格/改价/缺货标记/下架）必须先把变更明细完整复述给用户并获得明确同意后才能调用；用户含糊时不得调用。** 该约束同时落在 AGENTS.md 硬约束第 6 条、SKILL.md「变更确认」专节、每个写接口 mcp.json description 首句。

| 接口 | 上游 | 行为要点 |
|---|---|---|
| `createProduct({name, spec_name?, sale_unit?, retail_price_yuan?, friend_price_yuan?, purchase_price_yuan?, barcode?, brand?, category?, aliases?, notes?})` | `POST /api/products` | 手动建档；用户没提零售价→0（后续完善，与 OCR 向导一致）；返回 product_id/sku_id + page-link 详情页 |
| `createProductsFromSlip({rows≤50})` | 逐行 `POST /api/products/from-ocr-row` | 收货单批量建档（箱/单件双建+关联+进价带入）；**服务端要求至少一个条码，单据行无条码时接口自动回退为普通建档**（no_barcode_fallback=true，零售价 0 待完善）；部分失败逐行报告；成功后引导回 purchaseSkill 流程 |
| `addSku({product_id, spec_name?, sale_unit?, retail_price_yuan?, friend_price_yuan?})` | `POST /api/products/:id/skus` | 商品加规格；product_id 取自上游原值 |
| `updateSkuPrice({sku_id, retail_price_yuan?, friend_price_yuan?, reason})` | `PATCH /api/skus/:id` | 改价写价格历史；**reason 必填**（接口层强校验，来源必须是用户口述）；friend_price 空串=清除 |
| `setSkuStockStatus({sku_id, status})` | `POST /api/skus/:id/stock-status` | 在售/缺货标记（不盘点数量） |
| `archiveProduct({product_id})` | `PATCH /api/products/:id` `{status:'archived'}` | 下架（历史单据保留）；**不暴露删除/purge**，用户要求删除时引导下架或小程序详情页强确认 |

- 跨 SKILL 联动：purchaseSkill.matchPurchaseItems 与 orderSkill.matchProducts 的 not_found 文案已改为「经用户明确确认后调用 productSkill 建档」；AGENTS.md 写明四 SKILL 关系。
- 接口名全局唯一（15 个接口，4 个 SKILL）。
- 明确不做：对话侧删除商品/规格、规格级归档、改商品名称/分类等字段编辑（页面人工处理）。

## [S3] Out of Scope

- ~~入库 OCR SKILL~~ → 已在第二轮以 purchaseSkill 并入本分支（见 S2.6）；真实单据的模型识别准确率实测与智谱降级策略调优仍在上线前待办
- 原子组件 GUI 卡片（官方暂不支持调试；本轮用文本 + page-link 交互）
- 聊天侧直接 createOrder / createPurchase / 回款 / 作废等资金写操作
- 合入 main、正式版提审（官方要求 AI 模式代码不入正式审核）
- wx.onAgentHandoff 页面接力（tab 页目标行为未定义，留待后续验证）

## Tasks

- [x] T1: 公共接入——app.config.ts（agent/lazyCodeLoading/subPackages）、copy.patterns、app.ts 写 sm_api_base — acceptance: `bun run build:weapp` 产物 dist/app.json 含 agent 与 aiSkill 独立分包，dist/aiSkill 含 AGENTS.md/SKILL.md/mcp.json/index.js/apis（covers: S2.1）
- [x] T2: querySkill——SKILL.md/mcp.json/index.js/apis 三接口 + 鉴权（lib.callApi 内联 Bearer+401 分支） — acceptance: 产物文件齐备、`node --check` 通过、mcp.json JSON 可解析且含 outputSchema page-link 标记（covers: S2.2, S2.5）
- [x] T3: orderSkill——matchProducts/matchCustomers/prepareOrder + sm_ai_order_draft 草稿桥 — acceptance: 同 T2 + prepareOrder 不暴露 createOrder、价格取自 API 返回（covers: S2.3, S2.5）
- [x] T4: order-new 草稿预填（useDidShow + 替换确认弹窗 + 客户/明细回填） — acceptance: devtools 模拟器注入草稿后开单页购物车与客户正确回填，空车直填/非空弹窗两条路径均可验证（covers: S2.4）
- [x] T5: 全量验证——build:weapp、tsc --noEmit、build:h5 回归、api:test 回归、devtools 编译冒烟 — acceptance: 全部命令通过，模拟器截图留证（covers: S2.1, S2.4）
- [x] T6: purchaseSkill——recognizePurchaseSlip/matchPurchaseItems + mcp.json（format:image）+ SKILL.md — acceptance: node 桩实跑条码/名称/未匹配/编造 ID 分支通过（covers: S2.6）
- [x] T7: preparePurchase → **submitPurchase 直接入库**（用户定案 2026-09-19：AI 对话确认后直接入库）——复述确认契约 + POST /api/purchases + 单号/详情蓝链返回；purchase-new 草稿桥代码保留但对话流不再写入（covers: S2.6）
- [x] T8: 接线——agent.skills 三枚、copy.patterns、AGENTS.md 分工更新 — acceptance: dist/app.json 三个 skill 齐、dist/aiSkill/purchaseSkill 文件齐、mcp.json 含 format:image（covers: S2.1, S2.6）
- [x] T9: productSkill 六接口 + 变更确认契约（mcp.json description/SKILL.md/AGENTS.md 三层落约束） — acceptance: reason 必填强校验、不暴露删除、15 接口名全局唯一（covers: S2.7）
- [x] T10: 跨 SKILL 联动——purchase/order 的 not_found 文案指向 createProductsFromSlip/createProduct（covers: S2.7）
- [x] T11: 补传闭环——后端 PATCH /api/orders/:id（orderUpdateSchema+updateOrder+R2 清理）；purchase-detail「补充上传照片」/order-detail「替换送货照」按钮；AI 侧 patchPurchaseImages + patchOrderDeliveryPhoto（format:image）；submitPurchase 文案温和化引导详情页补传 — acceptance: PATCH 端到端写入 delivery_photo_key/image_keys；api:test 46/46；17 接口名全局唯一（covers: S2.3, S2.6）
- [x] T12: queryPurchases 单号解析接口 + 单号域区分引导（AGENTS.md 约束7 / queryOrders description / SKILL.md 流程） — acceptance: q=260919-0011 解析出 purchase_id 并打通 patchPurchaseImages 链路；空结果 content 引导域区分；18 接口名全局唯一（covers: S2.6）
