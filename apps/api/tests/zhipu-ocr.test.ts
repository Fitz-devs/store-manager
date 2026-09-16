import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildPayloadFromGlmOcr,
  extractLayoutText,
  parseHtmlTableToRows,
  recognizeWithZhipuOcr,
  resolveZhipuKey,
} from '../src/adapters/zhipu-ocr'

const tinyPng = new Uint8Array([137, 80, 78, 71]).buffer

const HTML_TABLE = `<table class="table"><thead><tr><th></th><th>整箱码</th><th>单条码</th><th>商品名称</th><th>数量</th><th>件价</th><th>金额</th><th>备注</th></tr></thead><tbody>
<tr><td>1</td><td>6907992507385</td><td>6907992507095</td><td>金典纯牛奶250ml*12</td><td>30箱</td><td>42.00</td><td>1260.00</td><td></td></tr>
<tr><td>2</td><td>6907992512761</td><td>6907992512570</td><td>安慕希(原味)205g*12</td><td>24箱</td><td>46.00</td><td>1104.00</td><td></td></tr>
</tbody></table>`

describe('zhipu-ocr glm-ocr only', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('resolveZhipuKey 优先 env', async () => {
    expect(await resolveZhipuKey({ ZHIPU_API_KEY: ' zp ' })).toBe('zp')
    expect(await resolveZhipuKey({})).toBeNull()
  })

  it('extractLayoutText 优先 md_results', () => {
    expect(extractLayoutText({ md_results: '# 销售单\n表' })).toContain('销售单')
    expect(extractLayoutText({ layout_details: [{ content: '<table>x</table>' }] })).toContain(
      'table',
    )
  })

  it('parseHtmlTableToRows 解析箱码/件码/数量', () => {
    const rows = parseHtmlTableToRows(HTML_TABLE)
    expect(rows).toHaveLength(2)
    expect(rows[0]?.box_code).toBe('6907992507385')
    expect(rows[0]?.unit_code).toBe('6907992507095')
    expect(rows[0]?.qty).toBe(30)
    expect(rows[0]?.unit_price).toBe(42)
    expect(rows[1]?.amount).toBe(1104)
  })

  it('优先 chat JSON，失败才 layout', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('chat/completions')) {
        return new Response(
          JSON.stringify({
            model: 'glm-ocr',
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    header: {
                      supplier_name: '惠州市玉隆商贸有限公司',
                      supplier_phone: '15007527889',
                      order_no: 'XD1',
                      date: '2026-09-12',
                      customer_name: '伟记批发',
                    },
                    rows: [
                      {
                        box_code: '6907992507385',
                        unit_code: '6907992507095',
                        name: '金典纯牛奶250ml*12',
                        conversion: 12,
                        qty: 30,
                        unit: '件',
                        unit_price: 42,
                        amount: 1260,
                      },
                      {
                        box_code: '6907992512761',
                        unit_code: '6907992512570',
                        name: '安慕希(原味)205g*12',
                        conversion: 12,
                        qty: 24,
                        unit: '件',
                        unit_price: 46,
                        amount: 1104,
                      },
                    ],
                  }),
                },
              },
            ],
          }),
          { status: 200 },
        )
      }
      return new Response('{}', { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await recognizeWithZhipuOcr({
      apiKey: 'zp-test',
      image: tinyPng,
      contentType: 'image/png',
      imageKey: 'purchases/a.png',
      pageIndex: 0,
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.model).toBe('glm-ocr')
    expect(result.draft.rows).toHaveLength(2)
    expect(result.draft.headers[0]?.supplier_name).toBe('惠州市玉隆商贸有限公司')
    expect(result.draft.headers[0]?.customer_name).toBe('伟记批发')
    expect(result.draft.rows[0]?.qty).toBe(30)
    expect(result.draft.rows[0]?.conversion_guess).toBe(12)
  })

  it('buildPayloadFromGlmOcr 从文本表头取字段', () => {
    const payload = buildPayloadFromGlmOcr(
      `销售单\n客户名称：小金伟记\n单据编号：XD2\n${HTML_TABLE}`,
    )
    const header = payload.header as Record<string, string | null>
    expect(header.customer_name).toBe('小金伟记')
    expect(header.order_no).toBe('XD2')
    expect((payload.rows as unknown[]).length).toBe(2)
  })

  it('按表头名对齐列，不依赖固定列序', () => {
    const swapped = `<table><thead><tr>
      <th>商品名称</th><th>数量</th><th>整箱码</th><th>单条码</th><th>件价</th><th>金额</th>
    </tr></thead><tbody>
      <tr><td>金典纯牛奶250ml*12</td><td>30箱</td><td>6907992507385</td><td>6907992507095</td><td>42.00</td><td>1260.00</td></tr>
    </tbody></table>`
    const rows = parseHtmlTableToRows(swapped)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.box_code).toBe('6907992507385')
    expect(rows[0]?.unit_code).toBe('6907992507095')
    expect(rows[0]?.qty).toBe(30)
    expect(rows[0]?.unit_price).toBe(42)
    expect(rows[0]?.amount).toBe(1260)
  })

  it('仅箱码表格：条码列落到 box_code', () => {
    const boxOnly = `<table><thead><tr>
      <th>序号</th><th>箱码</th><th>商品名称</th><th>数量</th><th>件价</th><th>金额</th>
    </tr></thead><tbody>
      <tr><td>1</td><td>6907992507385</td><td>伊利纯牛奶250ml*16</td><td>50箱</td><td>38.00</td><td>1900.00</td></tr>
    </tbody></table>`
    const rows = parseHtmlTableToRows(boxOnly)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.box_code).toBe('6907992507385')
    expect(rows[0]?.unit_code).toBeNull()
    expect(rows[0]?.name).toBe('伊利纯牛奶250ml*16')
    expect(rows[0]?.qty).toBe(50)
  })

  it('玉隆单：件数/规格列，数量识别 30件 而非 1', () => {
    const html = `<table><thead><tr>
      <th>序</th><th>条码</th><th>品名</th><th>规格</th><th>件数</th><th>零数</th><th>单价</th><th>金额</th><th>备注</th>
    </tr></thead><tbody>
      <tr><td>1</td><td>6932496800946</td><td>贝奇菜仔奶330ML礼盒</td><td>1*10</td><td>30件</td><td></td><td>42.00</td><td>1260.00</td><td></td></tr>
      <tr><td>3</td><td>6932496805354</td><td>贝奇蔬菜牛乳155ml*16 礼盒</td><td>1*16</td><td>3件</td><td></td><td></td><td></td><td></td></tr>
    </tbody></table>`
    const rows = parseHtmlTableToRows(html)
    expect(rows).toHaveLength(2)
    expect(rows[0]?.qty).toBe(30)
    expect(rows[0]?.unit).toBe('件')
    expect(rows[0]?.box_code).toBe('6932496800946')
    expect(rows[0]?.spec_hint).toBe('1*10')
    expect(rows[0]?.conversion_hint).toBe(10)
    expect(rows[0]?.unit_price).toBe(42)
    expect(rows[1]?.qty).toBe(3)
    expect(rows[1]?.conversion_hint).toBe(16)
  })

  it('无表头时按箱码单列位置回退', () => {
    const noHead = `<table><tbody>
      <tr><td>1</td><td>6907992502199</td><td>安慕希</td><td>24箱</td><td>46</td><td>1104</td></tr>
    </tbody></table>`
    const rows = parseHtmlTableToRows(noHead)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.box_code).toBe('6907992502199')
    expect(rows[0]?.unit_code).toBeNull()
    expect(rows[0]?.name).toBe('安慕希')
  })
})
