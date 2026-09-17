import { describe, expect, it } from 'vitest'
import {
  asDateString,
  isoDayFromShanghai,
  isoDayToShanghai,
  purchaseDayFrom,
  purchaseDayTo,
} from '../src/lib/date-range'

describe('list date-range helpers', () => {
  it('asDateString 解析日期并拒绝空值/非法日历日', () => {
    expect(asDateString('2026-09-18')).toBe('2026-09-18')
    expect(asDateString('2026-09-18T10:00:00+08:00')).toBe('2026-09-18')
    expect(asDateString('')).toBeUndefined()
    expect(asDateString(undefined)).toBeUndefined()
    expect(asDateString('not-a-date')).toBeUndefined()
    expect(asDateString('2026-02-30')).toBeUndefined()
    expect(asDateString('2026-13-01')).toBeUndefined()
  })

  it('订单时间边界按上海自然日转 UTC ISO，非法日返回 undefined', () => {
    expect(isoDayFromShanghai('2026-09-18')).toBe('2026-09-17T16:00:00.000Z')
    expect(isoDayToShanghai('2026-09-18')).toBe('2026-09-18T15:59:59.999Z')
    expect(isoDayFromShanghai('2026-02-30')).toBeUndefined()
    expect(isoDayToShanghai('not-a-date')).toBeUndefined()
  })

  it('入库时间边界兼容 date-only 与 datetime 存储，非法日返回 undefined', () => {
    expect(purchaseDayFrom('2026-09-18')).toBe('2026-09-18')
    expect(purchaseDayTo('2026-09-18')).toBe('2026-09-18T23:59:59.999')
    expect(purchaseDayFrom('2026-09-18T09:00:00')).toBe('2026-09-18')
    expect(purchaseDayFrom('2026-02-30')).toBeUndefined()
    expect(purchaseDayTo('2026-13-01')).toBeUndefined()
  })
})
