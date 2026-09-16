import { describe, expect, it } from 'vitest'
import { buildOcrDraft, draftToLegacyRows, extractJsonPayload, parseConversionFromName } from '../src/adapters/ai'

describe('ocr draft parsing', () => {
  it('parseConversionFromName 从 *12 / ×12 解析', () => {
    expect(parseConversionFromName('金典纯牛奶250ml*12')).toBe(12)
    expect(parseConversionFromName('安慕希', '205g×12')).toBe(12)
    expect(parseConversionFromName('散装饼干')).toBe(1)
  })

  it('extractJsonPayload 剥离 markdown 围栏', () => {
    const text = '```json\n{"rows":[]}\n```'
    expect(extractJsonPayload(text)).toEqual({ rows: [] })
  })

  it('buildOcrDraft 生成表头与明细并换算分', () => {
    const payload = {
      header: {
        order_no: 'XD2609090000219',
        date: '2026-09-12',
        customer_name: '小余 伟记购销部',
        total_raw: '5614.00',
      },
      rows: [
        {
          seq: 1,
          box_code: '6907992507385',
          unit_code: '6907992507095',
          name: '金典纯牛奶250ml*12',
          qty_raw: '30箱',
          qty: 30,
          unit: '箱',
          unit_price_raw: '42.00',
          unit_price: 42,
          amount_raw: '1260.00',
          amount: 1260,
        },
      ],
    }
    const draft = buildOcrDraft(payload, {
      image_key: 'purchases/a.jpg',
      page_index: 0,
      model: 'mock',
      raw: JSON.stringify(payload),
    })
    expect(draft.headers[0]?.customer_name).toBe('小余 伟记购销部')
    expect(draft.headers[0]?.order_no).toBe('XD2609090000219')
    expect(draft.rows).toHaveLength(1)
    expect(draft.rows[0]?.box_code).toBe('6907992507385')
    expect(draft.rows[0]?.unit_price_fen).toBe(4200)
    expect(draft.rows[0]?.conversion_guess).toBe(12)
    const legacy = draftToLegacyRows(draft)
    expect(legacy[0]?.unit_price).toBe(42)
  })
})
