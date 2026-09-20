# productSkill：商品档案管理

对话式维护店内商品档案：建档、加规格、改价、缺货标记、下架。**所有变更类操作必须先获用户确认**（见下方硬约束）。

## 硬约束（变更确认）

1. **任何写接口调用前，必须先把变更明细完整复述给用户并获得明确同意**（用户说「确认/改吧/好/就这些」才算）。复述内容包括：品名/规格、涉及字段、旧值→新值（改价时）、原因（改价时）。
2. 用户含糊（「随便弄弄」「你看着办」）、沉默、或只描述问题未表态时，**不得调用任何写接口**，应继续追问。
3. 建档场景：从收货单批量建档前，把整批明细（品名/单位/进价）念一遍再等确认；用户没提零售价时按 0 建档并说明「价格稍后在商品管理里完善」。
4. 改价 `reason` 必填（写入价格历史），原因必须来自用户口述，不得编造。
5. 本 SKILL **不提供删除商品/规格**的能力；用户要求删除时，解释改为「下架」（历史单据保留），或引导到小程序详情页用强确认删除。

## 业务流程

```text
用户意图入口（均需先复述明细并获明确同意）
├── 「帮我建档 XX」────────────► createProduct
├── 入库流程单据品没档案 ──────► createProductsFromSlip（批量）
│     └── 成功后回到 purchaseSkill：preparePurchase 或重新 matchPurchaseItems
├── 「给 XX 加个规格」─────────► addSku（product_id 取自 searchProducts）
├── 「XX 涨价/调价到 N 元」────► searchProducts 查现价 → 复述旧价→新价 → 确认 ► updateSkuPrice
├── 「XX 缺货了/恢复了」───────► setSkuStockStatus
└── 「XX 不卖了/下架」─────────► 复述商品名确认 ► archiveProduct
```

## 接口依赖

- `addSku` / `archiveProduct` 的 `product_id`、`updateSkuPrice` / `setSkuStockStatus` 的 `sku_id`：**只能取自 querySkill.searchProducts 或本 SKILL 建档接口的返回原值**。
- 改价前应先 `searchProducts` 拿到现价，复述时给用户「旧价→新价」。
- 入库闭环：purchaseSkill.matchPurchaseItems 返回 not_found 时，走 `createProductsFromSlip` 建档后继续入库流程。

## 跨接口约束

1. 金额一律元字符串（3.50），由接口代码换算为分，模型不换算。
2. 从收货单建档只带进价（purchase_price / unit_price_fen），零售价留 0 由店主后续完善——与入库 OCR 向导行为一致。
3. 单规格商品档案与多规格商品共用同一套接口；同一商品多版本（如不同烟支）用 `addSku`，不要重复建档同名商品。
4. 操作成功后按接口 `content` 如实转述；失败时告知原因，不重试相同参数。
