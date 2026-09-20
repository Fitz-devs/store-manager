import { describe, expect, it } from 'vitest'
import { resolvePurchasePriceCompare } from '@sm/shared'

describe('resolvePurchasePriceCompare（忽略单位描述，同商品直接比单价）', () => {
  it('单据价与库内价相同不报差异（即使单位文案不同）', () => {
    const r = resolvePurchasePriceCompare({
      docUnitPriceFen: 4200,
      conversion: 12,
      rowUnit: '提',
      skuSaleUnit: '箱',
      latestPurchaseFen: 4200,
    })
    expect(r?.warn).toBe(false)
  })

  it('单价真的变了才报差异（不按 conversion 折算）', () => {
    const r = resolvePurchasePriceCompare({
      docUnitPriceFen: 4500,
      conversion: 12,
      rowUnit: '箱',
      skuSaleUnit: '箱',
      latestPurchaseFen: 4200,
    })
    expect(r?.warn).toBe(true)
  })

  it('件价直接比', () => {
    const r = resolvePurchasePriceCompare({
      docUnitPriceFen: 280,
      conversion: 1,
      rowUnit: '件',
      skuSaleUnit: '件',
      latestPurchaseFen: 280,
    })
    expect(r?.warn).toBe(false)
  })

  it('缺库内价返回 null', () => {
    expect(
      resolvePurchasePriceCompare({
        docUnitPriceFen: 4200,
        latestPurchaseFen: null,
      }),
    ).toBeNull()
  })
})
