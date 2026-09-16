---
feature: purchase-ocr-import
status: delivered
updated: 2026-09-15
branch: feat/ocr-ai-research
commits: 2ac9698..(含 SiliconFlow 接入)
---

# 入库销售单 OCR 导入

## Report

**What was built** — 入库销售单 OCR 导入 P0+P1：`OcrDraft`（表头 + 箱码/单件码明细）扩展到 shared；`purchase-new` 支持多图上传识别、表头预填、原图缩略对照、换算可改、条码优先匹配、「一键双建」创建箱装+单件并 `box_piece` 关联；导入必带全量 `image_keys` 与 `ocr_raw`（失败页照片也保留）。OCR 通道优先级：`OCR_MOCK` → **硅基流动**（Secrets Store `siliconflow-key` 或 secret `SILICONFLOW_KEY`，OpenAI 兼容 `PaddlePaddle/PaddleOCR-VL`）→ Workers AI 旁路 → 无 AI 时 mock。

**Verification**
- `bun run api:typecheck` → PASS
- `bun run --cwd apps/api test` → PASS（25 tests，含 siliconflow-ocr 4 个）
- `apps/miniapp bun run build:weapp` / `build:h5` → PASS
- **导入链路 e2e**（`apps/api/scripts/verify-ocr-import.sh`，本地 `wrangler dev` + `OCR_MOCK=1`）→ PASS：
  1. setup → 上传假图进 R2
  2. mock OCR 返回 2 行 + 表头
  3. `from-ocr-row` 双建（箱码/件码）+ `box_piece` 关联
  4. 重复箱码 → 409
  5. `POST /api/purchases` 带 `image_keys`/`ocr_raw`/`conversion=12`
  6. 详情可查原图 key、`ocr_raw`、2 条明细、`linked_products`
- 真实中文收货单识别质量 **本轮不验**（T8 留待真机/样张）

**Journey log**
- OCR 结果用 fen 存 draft、UI 用元；`latest_purchase_price` 存件均价（箱价/conversion）
- `getPurchase` 曾漏回 `ocr_raw`（库里有、接口不吐）——溯源要在详情接口也露出
- Secrets Store 需 `store_id` 才能写进 wrangler 绑定；未配置 store 时用 `wrangler secret put SILICONFLOW_KEY` 等价接入
- SiliconFlow 模型 id 可用 `SILICONFLOW_OCR_MODEL` 覆盖（默认 `PaddlePaddle/PaddleOCR-VL`）
- 验证脚本里 JSON 必须用 `json.dumps` 组装，手工拼引号会 400

## [S1] Problem

供货商「销售单」是一次进货的主凭证，常见形态（真实样张）：

- **一次进货多张单据**（多页连续「1/1」或分批发货单）
- 明细列：`序号 | 整箱码 | 单件码 | 商品名称 | 数量 | 价 | 金额 | 备注`
- 同一行同时有 **整箱码 + 单件码**（如 `6907992507385` / `6907992507095`），品名带规格（`金典纯牛奶250ml*12`）
- 数量单位是「箱」，价是 **整箱价**；合计在表尾（`合计：伍仟陆佰壹拾肆元整 5614.00`）
- 单头有：业务员、客户名称/地址/电话、单据编号（`XD2609090000219`）、送货日期、送货司机、红章

现有链路缺口：

1. `OcrRow` 只有 name/spec/qty/unit/unit_price/amount，**没有箱码/单件码/序号/合计**
2. 确认后只能「匹配已有商品」，**不能一键建箱装+单件并 `box_piece` 关联**
3. `conversion` 在 OCR 结果里固定 1，「30箱 × 42」未体现箱→件换算
4. 表头（供应商/日期/单号）未预填
5. **照片溯源未当一等公民**：虽有 `image_keys`，但未定义「行→来源页」、「导入必须带齐原图+ocr_raw」、「放弃导入时原图怎么办」、「详情页如何从明细回看单据」

目标：拍照/多图 → OCR 结构化 JSON → **可编辑表单**（含原图对照）→ 用户确认/改 → 建品/匹配 → 入库；**每笔入库必须可回溯到原始单据照片与 OCR 原文**。

## [S2] Design

### S2.1 对齐现有契约

| 已有 | 用法 |
|---|---|
| `purchases.image_keys` JSON 数组 | 继续存本次全部单据原图（R2），详情页展示 |
| `purchases.ocr_raw` | 存原始模型输出，便于排查 |
| `product_links.relation='box_piece'` | 箱装商品 ↔ 单件商品双向关联 |
| `purchase_items.unit_name` + `conversion` + `qty` | 数量以「销售单位」计，`base_qty = qty * conversion` |
| `POST /api/purchases` | 仍由确认后的清单调用；OCR 只产草稿 |
| 人工核对原则 | **不自动入库**；导入必须用户点确认 |

相关文件：`apps/api/src/adapters/ai.ts`、`routes/ocr.ts`、`services/purchases.ts`、`services/products.ts`（`createProduct` / `linkProduct`）、`apps/miniapp/src/pages/purchase-new/index.tsx`、`packages/shared` 的 `OcrRow`。

### S2.2 OCR 输出契约（扩展）

在现有 `OcrRow` **旁新增** `OcrDraft`（不直接破坏 `OcrRow`，迁移期双轨；实现时可逐步内化）。

```ts
// packages/shared
interface OcrHeader {
  order_no: string | null       // 单据编号 XD2609090000219
  date: string | null           // 送货日期 2026-09-12 → ISO date
  customer_name: string | null  // 客户名称 → 预填供应商
  customer_phone: string | null
  salesman: string | null
  driver: string | null
  note: string | null
  total_raw: string | null      // 「5614.00」或「伍仟…元整」
  total_fen: number | null
  page_index: number            // 第几张图 0-based
  image_key: string
}

interface OcrDraftRow {
  seq: number | null            // 序号 1..n
  box_code: string | null       // 整箱码
  unit_code: string | null      // 单件码
  name: string                  // 商品名称原文
  name_cleaned: string
  spec_hint: string | null      // 250ml*12
  qty_raw: string               // 「30箱」
  qty: number
  unit: string                  // 箱 / 提 / 件
  unit_price_raw: string        // 「42.00」
  unit_price_fen: number | null
  amount_raw: string
  amount_fen: number | null
  remark: string | null
  conversion_guess: number      // 从 *12 解析，默认 1
  image_key: string             // 来源页
  page_index: number
}

interface OcrDraft {
  headers: OcrHeader[]          // 每页一条
  rows: OcrDraftRow[]
  model: string
  raw: string
}
```

**业务映射到入库行（确认后）**

- 数量单位 = 单据上的「箱/提」等 → `unit_name`；`conversion` = 用户确认的箱→件数（默认 `conversion_guess`）
- `unit_price` 为 **该销售单位单价**（整箱价），与现有 `normalizeUnitPrice` 一致
- 箱装 SKU：`sale_unit=箱`，挂 `box_code`；单件 SKU：`sale_unit=件`，挂 `unit_code`，`product_links` 互指

### S2.3 Prompt / 结构化约束（中文表）

与调研报告 `ocr-voice-ai-research` S2.2b 一致，并加销售单专用项：

- JSON key 用中文原列名或固定英文字段名，**禁止翻译表头后漂移**
- 数量原样 `30箱`，另给 `qty=30`、`unit=箱`；**不在模型里做箱→件乘法**
- 金额保留原字符串 + `value_fen`；失败则 null
- 每行必须尝试填 `整箱码`/`单件码`（13 位 EAN，允许 null）
- 页级：`单据编号`/`送货日期`/`客户名称`/`合计`
- 只输出 JSON，禁止 markdown 围栏
- 多图：客户端 **逐张** 调 OCR（或一次上传多张由服务端循环），按 `page_index` 合并 rows/headers

推荐 endpoint：**智谱 glm-ocr（专用）+ glm-4.7-flash 结构化** → 硅基流动 PaddleOCR 两段式 → CF 旁路。VLM 直出备选 `glm-5.3-flash`。无 Key 时 mock。

### S2.4 确认页 UI（`purchase-new` 演进）

```
[表头卡] 供应商 | 入库日期 | 单号/备注   ← headers 合并预填，可改
[原图条] 缩略图多张，点开大图对照；行角标「页1」
[识别明细] 可编辑表单行：
  序号 | 整箱码 | 单件码
  品名（可改） | 数量 | 单位 | 换算(默认解析) | 单价 | 金额
  操作：匹配已有 / 一键双建 / 删除 / 加入清单
[合计条] 单据合计 vs 已入清单合计（差额提示，不阻断）
[导入] 生成入库单 → POST /api/purchases（含全部 image_keys）
```

交互规则：

1. **匹配已有**：按 `box_code` 或 `unit_code` 查 `barcodes`，再按品名搜索；命中只绑一端即可入库
2. **一键双建**（双方码都在且均未命中时显示）：
   - 服务端事务：商品 A（名=品名，SKU 规格=箱，sale_unit=箱，条码=箱码，latest_purchase_price=箱价）+ 商品 B（同名或「品名·单件」，sale_unit=件，条码=单件码）+ `product_links` `box_piece` 双向
   - 换算：A 的入库行 `conversion=N`，`unit_name=箱`
   - 返回两个 product/sku id，行状态变「已建品」
3. **加入清单** → 进现有 `items[]`，走既有价格变动提示与入库
4. 照片与溯源见 **S2.9**（本页只负责展示与操作，不另开第二套存储）
5. 多页：支持「继续拍下一张」追加 rows；表头取各页非空字段合并（后页不覆盖已有非空）

### S2.5 API

| 方法 | 变更 |
|---|---|
| `POST /api/ocr/purchase` | body 增加可选 `text_lines`（预研预留）；响应改为 `OcrDraft`（或兼容字段 `rows` + 新增 `headers`） |
| `POST /api/ocr/purchase-batch`（或客户端循环） | `image_keys[]` → 合并 `OcrDraft` |
| `POST /api/products/from-ocr-row` | body：`{ name, box_code, unit_code, conversion, unit_price_fen, spec_hint }` → 创建双商品+关联+条码，返回 `{ box: {product_id,sku_id}, unit: {...} }` |
| `POST /api/purchases` | **不改**语义；仍 `image_keys` + items |

错误：码冲突（已挂在其他 sku）→ 409，前端改为「匹配已有」；建品失败不写半截（事务）。

### S2.6 数据与费用

- 原图：R2 `purchases/` 前缀，随 purchase 永久保留（细则见 S2.9）
- OCR：单店日进货页数少，走免费/低价国产 endpoint；CF 仅旁路
- `ocr_raw` 截断上限维持 schema 500000

### S2.7 分阶段

| 阶段 | 内容 |
|---|---|
| **P0** | 扩展 `OcrDraft` + 确认表单（多图、表头预填、箱/单件码、换算、原图对照）；匹配已有；**照片/ocr_raw 溯源契约 S2.9**。**建品仍走现有商品页** |
| **P1** | `POST /api/products/from-ocr-row` 一键双建并关联 |
| **P2** | 批量接口/并发识别；合计校验；VisionKit 抽字降本（可选） |

### S2.8 明确不采纳

- 无确认自动入库
- 模型侧换算金额或箱→件
- **删除或覆盖**已上传的单据原图 / `ocr_raw`（溯源不可破坏）
- 引入与 `image_keys` 并行的第二套图床
- 本轮实现代码（等用户命令）

### S2.9 照片与溯源（一等需求）

单据照片是进货凭证，不是识别过程的临时文件。

| 契约 | 行为 |
|---|---|
| **上传时机** | 选图/拍照后立刻 `uploadLocalImage(..., 'purchases')` 进 R2；OCR 只读 R2 key，**先有图再识别** |
| **导入必带** | `POST /api/purchases` 的 `image_keys` = 本次会话 **全部** 已上传原图（含未产生有效行的页）；`ocr_raw` 写入合并后的原始/摘要 JSON（截断规则沿用） |
| **行→页** | `OcrDraftRow.image_key` + `page_index` 随草稿保留；导入后仍以 `purchases.image_keys` 顺序 + 明细展示即可回看；确认页点行可预览对应页 |
| **详情页** | 已有「单据照片」区保留；增强：明细行可点「看原单」打开该行来源页大图（P0 用列表顺序即可，不必新表） |
| **放弃导入** | 确认页取消/返回：R2 对象 **不删除**（避免误删凭证）；可接受短期孤儿对象，后续可选清理策略，**不阻断主流程**；若将来加草稿表，仍指向同一 R2 key，不重传 |
| **不覆盖** | 同 key 不原地覆盖；重拍=新 key；导入后照片与入库单同生命周期，随每日 R2 备份 |
| **导出** | 现有 JSON 导出应继续包含 `image_keys` / `ocr_raw`（与 HANDOVER 备份一致） |
| **权限** | 沿用现有登录后 `fileUrl`；不新增公开匿名图床 |

实现检查清单（写进 T6/T8 验收）：

1. 识别失败页仍出现在缩略图条且最终能进 `image_keys`
2. 入库成功后 `purchase-detail` 能 `previewImage` 打开每一张原图
3. 拒绝「导入成功但 image_keys 为空」的路径（有图会话必须写全）
4. `ocr_raw` 非空可追溯当时模型输出

## [S3] Out of Scope

- 修改开单/回款/客户模块
- 发票专票、对账单
- 离线 OCR、多门店
- 语音（仍见 `ocr-voice-ai-research`）

## Tasks

> 设计任务已勾；实现任务等用户明确命令后再做。

- [x] T1: 对齐现有 purchase/product_link/OCR 契约与样张字段 — acceptance: S2.1/S2.2 覆盖箱码、单件码、多页、表头（covers: S2.1, S2.2）
- [x] T2: 定义确认页表单与一键双建交互 — acceptance: 含原图对照、换算可改、导入写 image_keys（covers: S2.4, S2.5）
- [x] T2b: 照片与 ocr_raw 溯源契约 — acceptance: 上传先于识别、导入必带全量图、行可回看、放弃不删源图（covers: S2.9）
- [x] T3: 划定 P0/P1/P2 与 Out of Scope — acceptance: 实现顺序无歧义（covers: S2.7, S2.8）
- [x] T4: shared 扩展 `OcrDraft` 类型 + OCR prompt 契约 — acceptance: 类型可编译；prompt 含箱/单件/表头/禁围栏（covers: S2.2, S2.3）
- [x] T5: Worker OCR 路径返回 `OcrDraft`（OpenAI 兼容客户端 + mock） — acceptance: 无真实 Key 时 mock 可用（covers: S2.3, S2.5; depends: T4）
- [x] T6: `purchase-new` 多图确认表单 — acceptance: 可改字段、加入清单、失败页图保留、有图导入带 image_keys/ocr_raw（covers: S2.4, S2.9; depends: T5）
- [x] T7: `from-ocr-row` 双建+关联 API 与确认页按钮 — acceptance: 两商品两码互链；条码冲突 409；失败回滚（covers: S2.5; depends: T6）
- [x] T8a: 导入链路 e2e（跳过真图 OCR）— acceptance: mock→双建→入库→详情 image_keys/ocr_raw/关联可查（covers: S2.4, S2.5, S2.9）
- [ ] T8b: 真实销售单样张真机验收 — acceptance: 识别质量与详情 preview（covers: S2.4, S2.6；需样张）

## 参考

- 调研：`docs/compose/spec/ocr-voice-ai-research.md`（中文通道与 JSON 硬约束）
- 现有：`HANDOVER.md` §商品整箱↔单件、§入库 OCR
