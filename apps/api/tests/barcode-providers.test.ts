import { describe, expect, it } from 'vitest'
import { parseAliMarketResponse, parseApiZeroResponse } from '../src/services/barcodes'

describe('parseAliMarketResponse', () => {
  it('解析通用云市场返回（goodsName/trademark/spec/img）', () => {
    const parsed = parseAliMarketResponse({
      code: 200,
      msg: '成功',
      data: {
        code: '6922266457432',
        goodsName: '可乐 330ml',
        trademark: '可口可乐',
        spec: '330ml*24',
        img: 'https://example.com/coke.jpg',
      },
    })
    expect(parsed).toEqual({
      name: '可乐 330ml',
      brand: '可口可乐',
      spec: '330ml*24',
      imageUrl: 'https://example.com/coke.jpg',
    })
  })

  it('解析物品编码中心风格返回（ItemName/BrandName/Image[]）', () => {
    const parsed = parseAliMarketResponse({
      status: '200',
      message: '查询成功！',
      ItemName: '5 激无糖口香糖',
      BrandName: '5',
      ItemSpecification: '12 片/包',
      Image: ['https://example.com/gum.jpg'],
    })
    expect(parsed?.name).toBe('5 激无糖口香糖')
    expect(parsed?.brand).toBe('5')
    expect(parsed?.spec).toBe('12 片/包')
    expect(parsed?.imageUrl).toBe('https://example.com/gum.jpg')
  })

  it('解析万维易源 showapi 返回结构', () => {
    const parsed = parseAliMarketResponse({
      showapi_res_code: 0,
      showapi_res_body: {
        name: '5 无糖口香糖',
        brand: '5',
        spec: '12片/包',
        img: 'https://example.com/gum.jpg',
      },
    })
    expect(parsed?.name).toBe('5 无糖口香糖')
    expect(parsed?.brand).toBe('5')
    expect(parsed?.imageUrl).toBe('https://example.com/gum.jpg')
  })

  it('失败状态或缺少名称时返回 null', () => {
    expect(parseAliMarketResponse({ code: 400, msg: '失败' })).toBeNull()
    expect(parseAliMarketResponse({ code: 200, data: {} })).toBeNull()
    expect(parseAliMarketResponse({ showapi_res_code: 1 })).toBeNull()
    expect(parseAliMarketResponse(null)).toBeNull()
  })
})

describe('parseApiZeroResponse', () => {
  it('解析成功返回（code=0 且 found=true）', () => {
    const parsed = parseApiZeroResponse({
      code: 0,
      msg: '成功',
      data: {
        barcode: '6921168509256',
        found: true,
        name: '农夫山泉 饮用天然水550ml',
        brand: '农夫山泉',
        manufacturer: '农夫山泉股份有限公司',
        spec: '550ml',
        price: 1.5,
      },
    })
    expect(parsed).toEqual({
      name: '农夫山泉 饮用天然水550ml',
      brand: '农夫山泉',
      spec: '550ml',
    })
  })

  it('未收录（found=false）或失败码返回 null', () => {
    expect(
      parseApiZeroResponse({ code: 0, data: { found: false, name: null } }),
    ).toBeNull()
    expect(parseApiZeroResponse({ code: 4022, msg: '余额不足' })).toBeNull()
    expect(parseApiZeroResponse(null)).toBeNull()
  })
})
