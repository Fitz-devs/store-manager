import type { OcrDraft } from '@sm/shared'
import { ApiError } from '../lib/errors'
import {
  buildOcrDraft,
  draftToLegacyRows,
  extractJsonPayload,
  PURCHASE_OCR_PROMPT,
} from './ai'

export interface ZhipuOcrResult {
  rows: ReturnType<typeof draftToLegacyRows>
  draft: OcrDraft
  model: string
  raw: string
}

export interface ZhipuOcrOptions {
  apiKey: string
  baseUrl?: string
  /** 仅 glm-ocr（layout_parsing） */
  model?: string
  image: ArrayBuffer
  contentType: string
  imageKey: string
  pageIndex: number
}

export const ZHIPU_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4'
/** 专用 OCR（唯一模型）：0.2 元/M tokens */
export const DEFAULT_ZHIPU_OCR_MODEL = 'glm-ocr'

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function dataUrl(contentType: string, buffer: ArrayBuffer): string {
  return `data:${contentType || 'image/jpeg'};base64,${toBase64(buffer)}`
}

function stripTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|td|th|li)>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 从 layout_parsing 抽出 md_results / 拼接 content 文本 */
export function extractLayoutText(payload: unknown): string {
  if (typeof payload === 'string') return payload
  if (!payload || typeof payload !== 'object') return ''
  const obj = payload as Record<string, unknown>
  const md = obj.md_results
  if (typeof md === 'string' && md.trim()) return md
  const data = obj.data
  if (data && typeof data === 'object') {
    const nested = extractLayoutText(data)
    if (nested && nested !== '{}') return nested
  }
  if (Array.isArray(obj.layout_details)) {
    // layout_details 可能是嵌套数组
    const flat: unknown[] = []
    const walk = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(walk)
      else if (v && typeof v === 'object') flat.push(v)
    }
    walk(obj.layout_details)
    const parts = flat
      .map((item) => {
        const row = item as Record<string, unknown>
        return String(row.content ?? row.text ?? row.markdown ?? '')
      })
      .filter(Boolean)
    if (parts.length) return parts.join('\n\n')
  }
  return JSON.stringify(payload)
}

function pickField(lines: string[], label: string): string | null {
  const re = new RegExp(`${label}[：:]\\s*([^\\n]+)`)
  for (const line of lines) {
    const m = line.match(re)
    if (m?.[1]) {
      const v = m[1].trim()
      return v && v !== 'null' ? v : null
    }
  }
  return null
}

/** 同一字段多次出现时取更像有效值的（如送货日期取更晚/更完整的） */
function pickLastField(lines: string[], label: string): string | null {
  const re = new RegExp(`${label}[：:]\\s*([^\\n]+)`)
  const values: string[] = []
  for (const line of lines) {
    const m = line.match(re)
    if (m?.[1]) {
      const v = m[1].trim()
      if (v && v !== 'null') values.push(v)
    }
  }
  return values.length ? values[values.length - 1]! : null
}

function toHalfWidth(s: string): string {
  return s.replace(/[０-９]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0),
  )
}

function parseMoney(raw: string | null | undefined): number | null {
  if (raw == null) return null
  const n = Number(toHalfWidth(String(raw)).replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : null
}

function isEan(s: string): string | null {
  const v = toHalfWidth(s ?? '').trim()
  return /^\d{8,14}$/.test(v) ? v : null
}

type ColKey =
  | 'seq'
  | 'box_code'
  | 'unit_code'
  | 'name'
  | 'spec'
  | 'qty'
  | 'unit_price'
  | 'amount'
  | 'remark'

function headerToColKey(cell: string): ColKey | null {
  const t = toHalfWidth(cell).replace(/\s+/g, '')
  if (!t) return null
  if (/序号|^no\.?$/i.test(t)) return 'seq'
  if (/整箱码|箱码|外箱码/.test(t)) return 'box_code'
  if (/单条码|单件码|件码|单品码/.test(t)) return 'unit_code'
  if (/条码|编码|商品码|barcode/i.test(t)) return 'box_code'
  if (/商品名称|品名|货名|名称/.test(t)) return 'name'
  // 「规格/包装」列（如 1*16）
  if (/规格|包装/.test(t)) return 'spec'
  // 「件数/数量/个数」——不能只写「数量」，玉隆单是「件数」
  if (/件数|数量|个数|支数|瓶数|箱数| qty/i.test(t)) return 'qty'
  if (/零数|零头|尾数/.test(t)) return null
  if (/件价|单价|售价|进价|价/.test(t)) return 'unit_price'
  if (/金额|合计金额|小计/.test(t)) return 'amount'
  if (/备注/.test(t)) return 'remark'
  return null
}

function cellsFromTr(tr: string): string[] {
  return [...tr.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) =>
    stripTags(m[1] ?? ''),
  )
}

function looksLikeHeaderRow(cells: string[]): boolean {
  return cells.filter((c) => headerToColKey(c)).length >= 3
}

function buildRowFromMap(
  map: Partial<Record<ColKey, string>>,
  seqFallback: number,
): Record<string, unknown> | null {
  const name = (map.name ?? '').trim()
  const box = isEan(map.box_code ?? '')
  const unitCode = isEan(map.unit_code ?? '')
  const qtyRaw = toHalfWidth(map.qty ?? '').trim()
  const specRaw = toHalfWidth(map.spec ?? '').trim()
  const priceRaw = map.unit_price ?? ''
  const amountRaw = map.amount ?? ''
  if (!name && !box && !qtyRaw) return null
  // 「30件」「30 箱」等；无单位时默认「件」（件数列常见）
  const qtyMatch = qtyRaw.match(/(\d+(?:\.\d+)?)\s*(箱|件|提|包|盒|组|套)?/)
  const qty = qtyMatch?.[1] ? Number(qtyMatch[1]) : null
  const unitLabel = qtyMatch?.[2] || '件'
  const unit_price = parseMoney(priceRaw)
  const amount = parseMoney(amountRaw)
  // 规格列「1*10」「*16」→ 换算
  const specFromCol = specRaw || name.match(/[*×xX]\s*\d+(?:\s*\*\s*\d+)*/)?.[0] || null
  const convMatch = (specFromCol ?? '').match(/[*×xX]\s*(\d{1,3})\s*$/)
  const conversionFromSpec = convMatch?.[1] ? Number(convMatch[1]) : 1
  return {
    seq: map.seq ? Number(toHalfWidth(map.seq)) || seqFallback : seqFallback,
    box_code: box,
    unit_code: unitCode,
    name: name || '未知商品',
    spec_hint: specFromCol,
    qty_raw: qtyRaw || (qty ? `${qty}${unitLabel}` : ''),
    qty: qty ?? 1,
    unit: unitLabel,
    unit_price_raw: priceRaw,
    unit_price,
    amount_raw: amountRaw,
    amount,
    remark: map.remark?.trim() || null,
    conversion_hint: conversionFromSpec,
  }
}

/** 解析 glm-ocr HTML 表：优先按表头名对齐列 */
export function parseHtmlTableToRows(html: string): Array<Record<string, unknown>> {
  const trs = html.match(/<tr[\s\S]*?<\/tr>/gi) ?? []
  const rowCells = trs.map(cellsFromTr).filter((c) => c.length)
  let colMap: Partial<Record<number, ColKey>> = {}
  let bodyStart = 0
  for (let i = 0; i < rowCells.length; i++) {
    const cells = rowCells[i]!
    if (looksLikeHeaderRow(cells)) {
      colMap = {}
      cells.forEach((cell, idx) => {
        const key = headerToColKey(cell)
        if (key) colMap[idx] = key
      })
      bodyStart = i + 1
      break
    }
  }

  const rows: Array<Record<string, unknown>> = []
  for (let i = bodyStart; i < rowCells.length; i++) {
    const cells = rowCells[i]!
    if (looksLikeHeaderRow(cells)) continue
    const map: Partial<Record<ColKey, string>> = {}
    if (Object.keys(colMap).length >= 3) {
      for (const [idx, key] of Object.entries(colMap) as Array<[string, ColKey]>) {
        map[key] = cells[Number(idx)] ?? ''
      }
    } else {
      // 位置回退：
      // A: 序号|箱码|件码|品名|数量|价|金额|备注
      // B: 序号|箱码|品名|数量|价|金额（只有箱码）
      const c1IsEan = isEan(cells[1] ?? '')
      const c2IsEan = isEan(cells[2] ?? '')
      if (c1IsEan && !c2IsEan) {
        map.seq = cells[0]
        map.box_code = cells[1]
        map.name = cells[2]
        map.qty = cells[3]
        map.unit_price = cells[4]
        map.amount = cells[5]
        map.remark = cells[6]
      } else {
        map.seq = cells[0]
        map.box_code = cells[1]
        map.unit_code = cells[2]
        map.name = cells[3]
        map.qty = cells[4]
        map.unit_price = cells[5]
        map.amount = cells[6]
        map.remark = cells[7]
      }
    }
    const row = buildRowFromMap(map, rows.length + 1)
    if (row) rows.push(row)
  }
  return rows
}

/** 从 layout 文本/HTML 组装 draft payload（仅 glm-ocr，无二次 LLM） */
export function buildPayloadFromGlmOcr(layoutText: string): Record<string, unknown> {
  // 可能有多个 <table>，取含「箱码/商品名称」的主表
  const tables: string[] = []
  let rest = layoutText
  const tableRe = /<table[\s\S]*?(?:<\/table>|(?=\n\n)|$)/gi
  let match: RegExpExecArray | null
  while ((match = tableRe.exec(layoutText))) {
    tables.push(match[0])
  }
  if (!tables.length) {
    const start = layoutText.indexOf('<table')
    if (start >= 0) tables.push(layoutText.slice(start))
  }
  let rows: Array<Record<string, unknown>> = []
  let bestScore = -1
  for (const tableHtml of tables) {
    const parsed = parseHtmlTableToRows(tableHtml)
    const score =
      parsed.filter((r) => r.box_code || r.unit_code).length * 2 + parsed.length
    if (score > bestScore) {
      bestScore = score
      rows = parsed
    }
    rest = rest.replace(tableHtml, ' ')
  }
  const textOnly = rest.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ')
  const lines = textOnly
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  const header = {
    // 供货商：抬头公司名 + 电话；不要用「客户名称」
    supplier_name:
      pickField(lines, '供货商') ||
      pickField(lines, '供应商') ||
      (() => {
        // 标题行如「惠州市玉隆商贸有限公司销售单」
        for (const line of lines) {
          const m = line.match(/([一-鿿]{2,}(?:有限公司|商行|批发|贸易|商贸|供应链))/)
          if (m?.[1]) return m[1]
        }
        return null
      })(),
    supplier_phone:
      pickField(lines, '电话') ||
      pickField(lines, '公司电话') ||
      pickField(lines, '联系电话'),
    order_no: pickLastField(lines, '单据编号'),
    // 同页可能印两个日期，取最后出现的有效 YYYY-MM-DD
    date: (() => {
      const dates = [...lines.join('\n').matchAll(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/g)].map(
        (m) =>
          `${m[1]}-${m[2]!.padStart(2, '0')}-${m[3]!.padStart(2, '0')}`,
      )
      const labeled = pickLastField(lines, '送货日期') || pickLastField(lines, '日期')
      if (labeled) {
        const m = labeled.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
        if (m) return `${m[1]}-${m[2]!.padStart(2, '0')}-${m[3]!.padStart(2, '0')}`
      }
      return dates[dates.length - 1] ?? null
    })(),
    customer_name: pickField(lines, '客户名称') || pickField(lines, '客户'),
    customer_phone: pickField(lines, '客户电话') ?? pickField(lines, '业务手机'),
    salesman: pickField(lines, '业务员'),
    driver: pickField(lines, '送货司机'),
    note: pickField(lines, '备注'),
    total_raw: (() => {
      for (const line of lines) {
        if (!line.includes('合计')) continue
        const m = line.match(/(\d+(?:\.\d+)?)\s*$/)
        if (m?.[1]) return m[1]
      }
      const m = textOnly.match(/合计[^0-9]{0,20}(\d+(?:\.\d+)?)/)
      return m?.[1] ?? null
    })(),
  }
  return { header, rows }
}

export async function recognizeWithZhipuOcr(
  options: ZhipuOcrOptions,
): Promise<ZhipuOcrResult> {
  const baseUrl = (options.baseUrl || ZHIPU_BASE_URL).replace(/\/$/, '')
  const model = options.model || DEFAULT_ZHIPU_OCR_MODEL
  if (model !== 'glm-ocr') {
    throw new ApiError(400, 'VALIDATION', '仅支持 glm-ocr')
  }
  const file = dataUrl(options.contentType, options.image)

  // 1) 优先 chat/completions + 业务 JSON prompt（glm-ocr 直接出字段）
  try {
    const chatRes = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: options.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 4096,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: PURCHASE_OCR_PROMPT },
              { type: 'image_url', image_url: { url: file } },
            ],
          },
        ],
      }),
    })
    if (chatRes.ok) {
      const payload = (await chatRes.json()) as {
        model?: string
        choices?: Array<{ message?: { content?: string } }>
      }
      const raw = payload.choices?.[0]?.message?.content ?? ''
      const parsed = extractJsonPayload(raw)
      if (parsed && Array.isArray(parsed.rows) && parsed.rows.length > 0) {
        const draft = buildOcrDraft(parsed, {
          image_key: options.imageKey,
          page_index: options.pageIndex,
          model: payload.model || model,
          raw,
        })
        return {
          rows: draftToLegacyRows(draft),
          draft,
          model: payload.model || model,
          raw,
        }
      }
    }
  } catch {
    // 回退 layout_parsing
  }

  // 2) 回退 layout_parsing + 本地表解析
  const layoutRes = await fetch(`${baseUrl}/layout_parsing`, {
    method: 'POST',
    headers: {
      Authorization: options.apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, file }),
  })
  if (!layoutRes.ok) {
    const text = await layoutRes.text().catch(() => '')
    throw new ApiError(
      502,
      'ZHIPU_OCR_FAILED',
      `智谱 glm-ocr 失败 HTTP ${layoutRes.status}${text ? `：${text.slice(0, 200)}` : ''}`,
    )
  }
  const layoutPayload = (await layoutRes.json()) as unknown
  const ocrText = extractLayoutText(layoutPayload).trim()
  if (!ocrText) {
    throw new ApiError(502, 'ZHIPU_OCR_FAILED', 'glm-ocr 未返回可解析文本')
  }

  const parsed = buildPayloadFromGlmOcr(ocrText)
  if (!Array.isArray(parsed.rows) || parsed.rows.length === 0) {
    throw new ApiError(
      502,
      'ZHIPU_OCR_FAILED',
      `glm-ocr 未解析出表格行。原文前 200 字：${ocrText.slice(0, 200)}`,
    )
  }

  const raw = JSON.stringify({ ocr_text: ocrText, structured: parsed })
  const draft = buildOcrDraft(parsed, {
    image_key: options.imageKey,
    page_index: options.pageIndex,
    model,
    raw,
  })
  return {
    rows: draftToLegacyRows(draft),
    draft,
    model,
    raw,
  }
}

export async function resolveZhipuKey(env: {
  ZHIPU_API_KEY?: string
  ZHIPU_API_KEY_STORE?: { get: () => Promise<string> }
}): Promise<string | null> {
  const fromEnv = env.ZHIPU_API_KEY?.trim()
  if (fromEnv) return fromEnv
  const store = env.ZHIPU_API_KEY_STORE
  if (store && typeof store.get === 'function') {
    const value = (await store.get().catch(() => ''))?.trim()
    if (value) return value
  }
  return null
}
