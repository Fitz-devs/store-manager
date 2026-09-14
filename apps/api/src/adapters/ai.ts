import type { OcrRow } from '@sm/shared'
import { ApiError } from '../lib/errors'

export interface OcrResult {
  rows: OcrRow[]
  model: string
  raw: string
}

export interface AiAdapter {
  recognizePurchaseReceipt(image: ArrayBuffer, contentType: string): Promise<OcrResult>
}

const DEFAULT_MODELS = ['@cf/google/gemma-4-26b-a4b-it', '@cf/moondream/moondream3.1-9B-A2B']

const PROMPT = [
  '你是入库单识别助手。识别图片中的商品明细，只输出 JSON，不要输出任何其他文字。',
  '输出格式：{"items":[{"name":"商品名称","spec":"规格或null","qty":数量,"unit":"单位或null","unit_price":单价元或null,"amount":金额元或null}]}',
  '数字请输出为数字类型（例如 3、12.5），无法识别的字段填 null。如果整张图无法识别，返回 {"items":[]}。',
].join('\n')

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function extractJson(text: string): { items?: unknown[] } | null {
  const cleaned = text.replace(/```json/gi, '```').replace(/```/g, '')
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as { items?: unknown[] }
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

function normalizeRows(items: unknown[]): OcrRow[] {
  return items
    .map((item) => {
      const row = item as Record<string, unknown>
      const name = typeof row.name === 'string' ? row.name.trim() : ''
      if (!name) return null
      return {
        name,
        spec: typeof row.spec === 'string' && row.spec.trim() ? row.spec.trim() : null,
        qty: toNumber(row.qty) ?? 1,
        unit: typeof row.unit === 'string' && row.unit.trim() ? row.unit.trim() : null,
        unit_price: toNumber(row.unit_price),
        amount: toNumber(row.amount),
      } satisfies OcrRow
    })
    .filter((row): row is OcrRow => row !== null)
}

export function createAi(ai: Ai, preferredModel?: string): AiAdapter {
  const models = preferredModel ? [preferredModel, ...DEFAULT_MODELS] : DEFAULT_MODELS
  return {
    async recognizePurchaseReceipt(image, contentType) {
      const dataUrl = `data:${contentType};base64,${toBase64(image)}`
      let lastError: unknown = null
      for (const model of models) {
        try {
          const result = (await (ai as unknown as {
            run: (model: string, input: unknown) => Promise<unknown>
          }).run(model, {
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: PROMPT },
                  { type: 'image_url', image_url: { url: dataUrl } },
                ],
              },
            ],
          })) as { response?: string }
          const raw = typeof result?.response === 'string' ? result.response : ''
          const parsed = extractJson(raw)
          if (parsed && Array.isArray(parsed.items)) {
            return { rows: normalizeRows(parsed.items), model, raw }
          }
          lastError = new Error(`模型 ${model} 返回内容无法解析`)
        } catch (error) {
          lastError = error
        }
      }
      const message = lastError instanceof Error ? lastError.message : '未知错误'
      throw new ApiError(502, 'OCR_FAILED', `识别失败：${message}`)
    },
  }
}
