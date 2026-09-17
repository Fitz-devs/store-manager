const DAY_PREFIX = /^\d{4}-\d{2}-\d{2}/

function isCalendarDay(day: string): boolean {
  if (!DAY_PREFIX.test(day)) return false
  const [y, m, d] = day.split('-').map(Number)
  const utc = new Date(Date.UTC(y, m - 1, d))
  return utc.getUTCFullYear() === y && utc.getUTCMonth() === m - 1 && utc.getUTCDate() === d
}

/** 解析为 YYYY-MM-DD；非法日期（如 2026-02-30）返回 undefined，调用方应跳过该条件 */
export function asDateString(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed) return undefined
  const day = trimmed.slice(0, 10)
  return isCalendarDay(day) ? day : undefined
}

/** 上海自然日起点 → UTC ISO；非法日期返回 undefined */
export function isoDayFromShanghai(value: string): string | undefined {
  const day = asDateString(value)
  if (!day) return undefined
  return new Date(`${day}T00:00:00+08:00`).toISOString()
}

/** 上海自然日终点 → UTC ISO；非法日期返回 undefined */
export function isoDayToShanghai(value: string): string | undefined {
  const day = asDateString(value)
  if (!day) return undefined
  return new Date(`${day}T23:59:59.999+08:00`).toISOString()
}

/** 入库 ordered_at 多为 YYYY-MM-DD；from 用日字符串即可比较；非法日期返回 undefined */
export function purchaseDayFrom(value: string): string | undefined {
  return asDateString(value)
}

/** 入库 to 统一到当日末；非法日期返回 undefined */
export function purchaseDayTo(value: string): string | undefined {
  const day = asDateString(value)
  if (!day) return undefined
  return `${day}T23:59:59.999`
}
