import { Hono } from 'hono'
import { ocrRequestSchema } from '@sm/shared'
import type { AppEnv } from '../env'
import { buildOcrDraft, draftToLegacyRows } from '../adapters/ai'
import {
  recognizeWithZhipuOcr,
  resolveZhipuKey,
} from '../adapters/zhipu-ocr'
import { createStorage } from '../adapters/storage'
import { ApiError, ok, parseBody } from '../lib/errors'

const MOCK_PAYLOAD = {
  header: {
    order_no: 'XD2609090000219',
    date: '2026-09-12',
    customer_name: '小余 伟记购销部',
    customer_phone: '13556284368',
    salesman: '伊利黄惠芸',
    driver: '粤L58082',
    note: null,
    total_raw: '5614.00',
  },
  rows: [
    {
      seq: 1,
      box_code: '6907992507385',
      unit_code: '6907992507095',
      name: '金典纯牛奶250ml*12',
      spec_hint: '250ml*12',
      qty_raw: '30箱',
      qty: 30,
      unit: '箱',
      unit_price_raw: '42.00',
      unit_price: 42,
      amount_raw: '1260.00',
      amount: 1260,
      remark: null,
    },
    {
      seq: 2,
      box_code: '6907992512761',
      unit_code: '6907992512570',
      name: '安慕希(原味)205g*12',
      spec_hint: '205g*12',
      qty_raw: '24箱',
      qty: 24,
      unit: '箱',
      unit_price_raw: '46.00',
      unit_price: 46,
      amount_raw: '1104.00',
      amount: 1104,
      remark: null,
    },
  ],
}

const router = new Hono<AppEnv>()

router.post('/purchase', async (c) => {
  const { image_key } = await parseBody(c, ocrRequestSchema)
  const pageIndex = Number(c.req.query('page_index') ?? '0') || 0
  const storage = createStorage(c.env.BUCKET)
  const object = await storage.get(image_key)
  if (!object?.body) throw new ApiError(404, 'FILE_NOT_FOUND', '图片不存在')
  const buffer = await new Response(object.body).arrayBuffer()
  if (buffer.byteLength > 8 * 1024 * 1024) {
    throw new ApiError(400, 'FILE_TOO_LARGE', '图片过大，请压缩后重试')
  }

  if (c.env.OCR_MOCK === '1') {
    const raw = JSON.stringify(MOCK_PAYLOAD)
    const draft = buildOcrDraft(MOCK_PAYLOAD, {
      image_key,
      page_index: pageIndex,
      model: 'mock',
      raw,
    })
    return ok(c, {
      rows: draftToLegacyRows(draft),
      draft,
      headers: draft.headers,
      model: 'mock',
      raw,
    })
  }

  // 仅智谱 glm-ocr（layout_parsing + 本地 HTML 表解析）
  const zhipuKey = await resolveZhipuKey(c.env)
  if (zhipuKey) {
    const result = await recognizeWithZhipuOcr({
      apiKey: zhipuKey,
      baseUrl: c.env.ZHIPU_BASE_URL,
      model: c.env.ZHIPU_OCR_MODEL,
      image: buffer,
      contentType: object.contentType ?? 'image/jpeg',
      imageKey: image_key,
      pageIndex,
    })
    return ok(c, {
      rows: result.rows,
      draft: result.draft,
      headers: result.draft.headers,
      model: result.model,
      raw: result.raw,
    })
  }

  // 未配置智谱 Key：拒绝而非静默返回假数据，避免假单据混进真实入库
  throw new ApiError(503, 'OCR_NOT_CONFIGURED', 'OCR 未配置：请配置 ZHIPU_API_KEY 后重试')
})

export default router
