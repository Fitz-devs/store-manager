import { sql } from 'kysely'
import type { CompiledQuery, Kysely } from 'kysely'
import type { DB } from '../db/schema'
import { batchCompiled } from '../db/batch'
import { nowIso, shanghaiDateString } from '../lib/ids'

export interface DailyStatsDelta {
  sales_amount?: number
  order_count?: number
  purchase_amount?: number
}

export interface DailyStatsRow {
  date: string
  sales_amount: number
  order_count: number
  purchase_amount: number
}

// 统计行日期一律按上海日历日；历史记录按其 created_at 换算归属日
export function statsDateFromCreatedAt(createdAtIso: string): string {
  return shanghaiDateString(new Date(createdAtIso))
}

export function openOrderStatsDelta(order: {
  status: string
  total: number
  created_at: string
}): { date: string; delta: DailyStatsDelta } | null {
  if (order.status !== 'open') return null
  return {
    date: statsDateFromCreatedAt(order.created_at),
    delta: { sales_amount: -order.total, order_count: -1 },
  }
}

// UPDATE 命中则累加，未命中则由同 batch 的 INSERT OR CONFLICT DO NOTHING 落行
export function buildStatsUpsert(
  db: Kysely<DB>,
  date: string,
  delta: DailyStatsDelta,
): CompiledQuery[] {
  const updatedAt = nowIso()
  const update = db
    .updateTable('daily_stats')
    .set((eb) => ({
      ...(delta.sales_amount
        ? { sales_amount: sql<number>`${eb.ref('sales_amount')} + ${delta.sales_amount}` }
        : {}),
      ...(delta.order_count
        ? { order_count: sql<number>`${eb.ref('order_count')} + ${delta.order_count}` }
        : {}),
      ...(delta.purchase_amount
        ? { purchase_amount: sql<number>`${eb.ref('purchase_amount')} + ${delta.purchase_amount}` }
        : {}),
      updated_at: updatedAt,
    }))
    .where('date', '=', date)
    .compile()
  const insert = db
    .insertInto('daily_stats')
    .values({
      date,
      sales_amount: delta.sales_amount ?? 0,
      order_count: delta.order_count ?? 0,
      purchase_amount: delta.purchase_amount ?? 0,
      updated_at: updatedAt,
    })
    .onConflict((oc) => oc.column('date').doNothing())
    .compile()
  return [update, insert]
}

export function groupDailyStats(
  orders: Array<{ total: number; status: string; created_at: string }>,
  purchases: Array<{ total_amount: number; created_at: string }>,
): DailyStatsRow[] {
  const map = new Map<string, DailyStatsRow>()
  const rowOf = (date: string): DailyStatsRow => {
    const existing = map.get(date)
    if (existing) return existing
    const row: DailyStatsRow = { date, sales_amount: 0, order_count: 0, purchase_amount: 0 }
    map.set(date, row)
    return row
  }
  for (const order of orders) {
    if (order.status !== 'open') continue
    const row = rowOf(statsDateFromCreatedAt(order.created_at))
    row.sales_amount += order.total
    row.order_count += 1
  }
  for (const purchase of purchases) {
    const row = rowOf(statsDateFromCreatedAt(purchase.created_at))
    row.purchase_amount += purchase.total_amount
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date))
}

// 从明细全量重算并覆盖统计行；分批插入，若中断重跑即可补齐（幂等）
export async function rebuildDailyStats(
  db: Kysely<DB>,
  d1: D1Database,
): Promise<{ dates: number }> {
  const [orders, purchases] = await Promise.all([
    db.selectFrom('orders').select(['total', 'status', 'created_at']).execute(),
    db.selectFrom('purchases').select(['total_amount', 'created_at']).execute(),
  ])
  const rows = groupDailyStats(orders, purchases)
  await batchCompiled(d1, [db.deleteFrom('daily_stats').compile()])
  const chunkSize = 100
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize)
    await batchCompiled(
      d1,
      chunk.map((row) =>
        db.insertInto('daily_stats').values({ ...row, updated_at: nowIso() }).compile(),
      ),
    )
  }
  return { dates: rows.length }
}
