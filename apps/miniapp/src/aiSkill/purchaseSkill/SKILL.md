# purchaseSkill：入库单据处理

根据收货单照片或口述明细匹配店内商品，**在对话里向用户复述明细并获得明确同意后直接提交入库单**（不跳转小程序页面）。

## 硬约束（入库确认）

1. 调用 `submitPurchase` 前，必须把入库明细完整复述给用户：每行的品名、数量、单位、单价、金额，以及供应商与日期，合计金额也要报出。
2. 只有用户明确同意（「确认/入库吧/好」）后才能调用 `submitPurchase`；含糊表态不得提交。
3. sku_id / product_id 只能取自 `matchPurchaseItems` 或 productSkill 建档接口的返回原值，禁止编造。
4. 单据单价以图片/用户口述的数字为准，没看清就追问，禁止编造或用零售价冒充进价。
5. 搭赠（进 X 送 X）：可拆成多行传入 match/submit（搭赠行 `unit_price_yuan` 填 `"0"`）。submitPurchase 会按相同 sku 自动合并数量与金额并摊进货价，**不入库搭赠字段**。也可在对话里把实收数量与总应付说清楚后再提交。

## 业务流程

```text
用户发收货单照片 / 口述来货明细
  │
  ├─ 路径 A（推荐，省钱）：模型直接读图提取明细 → matchPurchaseItems(rows)
  │
  ├─ 路径 B（降级）：模型读图把握不足，或用户要求系统识别
  │     recognizePurchaseSlip(imagePath) → 识别行（含 image_key）→ matchPurchaseItems(rows)
  │
  ├─ matchPurchaseItems 结果处理
  │     ├── not_found ──► 商品码未命中（自动匹配只认店内商品码，不做品名模糊搜索）；引导用户小程序检索，确认要建档时复述明细获确认后调 productSkill.createProductsFromSlip，再回本流程
  │     ├── ambiguous ──► 让用户确认规格
  │     └── 单据价 vs 库内进价不一致 ──► 如实提醒，以单据价为准
  │
  └─ 复述完整明细 + 合计 ──► 用户明确同意 ──► submitPurchase(items, supplier_name?, ordered_at?, note?, image_keys? 或 imagePath?)
        ├── 路径 A：把对话里的 image（format:image）原样传入 imagePath，自动上传挂到入库单
        ├── 路径 B：把 recognizePurchaseSlip 返回的 image_key 放入 image_keys 数组
        └── 成功后入库单详情会显示对应单据照片；缺图时 content 会提示用户
        └── 成功 ──► 告知入库单号、明细、合计；引用「查看入库单」链接

入库单查询与缺图补传：
  - 用户提到入库单号（纯数字，如 260919-0011）──► queryPurchases(q=单号) 拿 purchase_id
        └── 注意：入库单号 ≠ 订单号（订单号 O 开头，查订单用 querySkill.queryOrders）
  - 补传（优先引导页面手动，对话补传为辅助；均需用户明确同意）：
        - **首选**：用户到小程序「入库」列表 → 点开该入库单 → 详情页点「补充上传照片」（页面按钮，支持多次追加）
        - 对话内：用户直接发单据照片 ──► 复述「入库单 X / 供应商 Y / 将补传照片」──► 确认后 patchPurchaseImages(purchase_id, imagePath)
              └── purchase_id 取自 queryPurchases/submitPurchase 返回原值
              └── 若接口返回「图片占位符未注入」错误：说明运行时没把对话图片传入接口，**不要重试**，引导用户走页面手动补传
```

## 接口依赖

- `submitPurchase` 前置：必须先跑 `matchPurchaseItems`（或建档接口拿到 sku_id）；入参与其返回原值对齐。
- `recognizePurchaseSlip` 是降级入口，出参 rows 形状与 matchPurchaseItems 的 rows 入参兼容；其 image_key 可传给 submitPurchase 挂到入库单。
- 需要核实零售价/优惠时，配合 querySkill 的 searchProducts。

## 跨接口约束

1. `unit_name` + `conversion` 描述单据单位：1 箱=12 件则 unit_name=箱、conversion=12；不确定时 conversion 省略按 1，并在复述时说明。
2. 提交失败按 `content` 如实告知用户，核对明细后可重试；不要在未告知用户的情况下反复提交。
3. 同一单据不要重复提交；提交成功后如用户要改数量，引导到小程序入库单详情处理（人工改单）。
