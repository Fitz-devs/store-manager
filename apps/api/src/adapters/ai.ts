import type { OcrDraft, OcrDraftRow, OcrHeader, OcrRow } from '@sm/shared'

/** 收货单识别提示词（智谱 glm-ocr 与历史 Workers AI 共用） */
export const PURCHASE_OCR_PROMPT = [
  '你是中文进货/销售单识别助手。识别图片，只输出 JSON，禁止 markdown 代码块或解释。',
  '重要：单据抬头的公司名是**供货商**（我们要的），不是客户；「客户名称」是我们收货方自己的名字，不要填进 supplier。',
  '输出格式：',
  '{"header":{"supplier_name":"供货商公司名或null","supplier_phone":"供货商电话或null","order_no":"单据编号或null","date":"送货日期 YYYY-MM-DD 或 null","customer_name":"收货方名称或null","customer_phone":null,"salesman":null,"driver":null,"note":null,"total_raw":"合计原文字或null"},"rows":[{"seq":序号或null,"box_code":"条码/整箱码或null","unit_code":"单件码或null","name":"商品名称原文","spec_hint":"如1*16或250ml*12或null","conversion":16,"qty_raw":"数量原文如30件","qty":30,"unit":"件","unit_price_raw":"单价原文","unit_price":42.00,"amount_raw":"金额原文","amount":1260.00,"remark":null}]}',
  '要求：件数/数量列的数字必须进 qty，单位进 unit；规格 1*16 的 N 进 conversion；金额与单价保留原字符串并给出数字；不要把单位换算掉；无法识别填 null。',
].join('\n')

export function extractJsonPayload(text: string): Record<string, unknown> | null {
  const cleaned = text.replace(/```json/gi, '```').replace(/```/g, '')
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>
  } catch {
    return null
  }
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const n = Number(value.replace(/[^\d.-]/g, ''))
    return Number.isFinite(n) ? n : null
  }
  return null
}
function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed && trimmed !== 'null' ? trimmed : null
}

export function parseConversionFromName(name: string, specHint?: string | null): number {
  const source = `${specHint ?? ''} ${name}`
  const patterns = [/[*×xX]\s*(\d{1,3})\b/, /(\d{1,3})\s*(?:支|瓶|罐|袋|个|盒|杯|听|片)\b/]
  for (const pattern of patterns) {
    const match = source.match(pattern)
    if (match?.[1]) {
      const n = Number(match[1])
      if (Number.isFinite(n) && n > 1 && n <= 999) return n
    }
  }
  return 1
}

function normalizeDate(value: string | null): string | null {
  if (!value) return null
  const cleaned = value.replace(/[年月./]/g, '-').replace(/日/g, '').trim()
  const match = cleaned.match(/(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (match) {
    const [, y, m, d] = match
    return `${y}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}`
  }
  return value
}

export function buildOcrDraft(
  payload: Record<string, unknown>,
  meta: { image_key: string; page_index: number; model: string; raw: string },
): OcrDraft {
  const headerRaw = (payload.header ?? {}) as Record<string, unknown>
  const rowsRaw = Array.isArray(payload.rows)
    ? payload.rows
    : Array.isArray(payload.items)
      ? payload.items
      : []

  const header: OcrHeader = {
    order_no: asString(headerRaw.order_no ?? headerRaw['单据编号']),
    date: normalizeDate(asString(headerRaw.date ?? headerRaw['送货日期'])),
    supplier_name: asString(headerRaw.supplier_name ?? headerRaw['供货商'] ?? headerRaw['供应商']),
    supplier_phone: asString(headerRaw.supplier_phone ?? headerRaw['供货商电话'] ?? headerRaw['公司电话']),
    customer_name: asString(headerRaw.customer_name ?? headerRaw['客户名称']),
    customer_phone: asString(headerRaw.customer_phone ?? headerRaw['客户电话']),
    salesman: asString(headerRaw.salesman ?? headerRaw['业务员']),
    driver: asString(headerRaw.driver ?? headerRaw['送货司机']),
    note: asString(headerRaw.note ?? headerRaw['备注']),
    total_raw: asString(headerRaw.total_raw ?? headerRaw['合计']),
    total_fen: (() => {
      const n = toNumber(headerRaw.total_fen ?? headerRaw['合计'])
      return n === null ? null : Math.round(n * 100)
    })(),
    page_index: meta.page_index,
    image_key: meta.image_key,
  }

  const rows: OcrDraftRow[] = []
  for (const item of rowsRaw) {
    const row = item as Record<string, unknown>
    const name = asString(row.name ?? row['商品名称'] ?? row['品名'])
    if (!name) continue
    const spec_hint = asString(row.spec_hint ?? row.spec ?? row['规格'])
    const qty = toNumber(row.qty ?? row['数量']) ?? 1
    const unit = asString(row.unit ?? row['单位']) ?? '件'
    const unit_price = toNumber(row.unit_price ?? row['单价'] ?? row['价'])
    const amount = toNumber(row.amount ?? row['金额'])
    rows.push({
      seq: toNumber(row.seq ?? row['序号']),
      box_code: asString(row.box_code ?? row['整箱码']),
      unit_code: asString(row.unit_code ?? row['单件码']),
      name,
      name_cleaned: name.replace(/\s+/g, ' ').trim(),
      spec_hint,
      qty_raw: asString(row.qty_raw) ?? `${qty}${unit}`,
      qty,
      unit,
      unit_price_raw: asString(row.unit_price_raw) ?? (unit_price === null ? '' : String(unit_price)),
      unit_price_fen: unit_price === null ? null : Math.round(unit_price * 100),
      amount_raw: asString(row.amount_raw) ?? (amount === null ? '' : String(amount)),
      amount_fen: amount === null ? null : Math.round(amount * 100),
      remark: asString(row.remark ?? row['备注']),
      conversion_guess:
        toNumber(row.conversion_hint) && Number(row.conversion_hint) > 0
          ? Number(row.conversion_hint)
          : parseConversionFromName(name, spec_hint),
      image_key: meta.image_key,
      page_index: meta.page_index,
    })
  }

  return {
    headers: [header],
    rows,
    model: meta.model,
    raw: meta.raw,
  }
}

export function draftToLegacyRows(draft: OcrDraft): OcrRow[] {
  return draft.rows.map((row) => ({
    name: row.name,
    spec: row.spec_hint,
    qty: row.qty,
    unit: row.unit,
    unit_price: row.unit_price_fen === null ? null : row.unit_price_fen / 100,
    amount: row.amount_fen === null ? null : row.amount_fen / 100,
  }))
}
