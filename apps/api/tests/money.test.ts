import { describe, expect, it } from 'vitest'
import { calcAmount, fenToYuan, formatFen, normalizeUnitPrice, priceChangeRatio, yuanToFen } from '@sm/shared'

describe('money', () => {
  it('yuanToFen 处理字符串与脏字符', () => {
    expect(yuanToFen('12.34')).toBe(1234)
    expect(yuanToFen('￥12.34')).toBe(1234)
    expect(yuanToFen(12.345)).toBe(1235)
    expect(yuanToFen('abc')).toBe(0)
  })

  it('fenToYuan/formatFen 格式化', () => {
    expect(fenToYuan(1234)).toBe('12.34')
    expect(formatFen(0)).toBe('¥0.00')
    expect(formatFen(null)).toBe('-')
  })

  it('calcAmount 按数量取整', () => {
    expect(calcAmount(350, 3)).toBe(1050)
    expect(calcAmount(333, 3)).toBe(999)
    expect(calcAmount(100, 0.5)).toBe(50)
  })

  it('normalizeUnitPrice 换算基本单位价', () => {
    expect(normalizeUnitPrice(6720, 24)).toBe(280)
    expect(normalizeUnitPrice(280, 1)).toBe(280)
    expect(normalizeUnitPrice(100, 0)).toBe(100)
  })

  it('priceChangeRatio 计算涨跌幅度', () => {
    expect(priceChangeRatio(250, 280)).toBe(0.12)
    expect(priceChangeRatio(400, 350)).toBe(-0.125)
    expect(priceChangeRatio(null, 350)).toBeNull()
    expect(priceChangeRatio(0, 350)).toBeNull()
  })
})
