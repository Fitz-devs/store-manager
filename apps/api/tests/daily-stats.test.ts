import { describe, expect, it } from 'vitest'
import { DummyDriver, Kysely, SqliteAdapter, SqliteIntrospector, SqliteQueryCompiler } from 'kysely'
import type { DB } from '../src/db/schema'
import {
  buildStatsUpsert,
  groupDailyStats,
  openOrderStatsDelta,
  statsDateFromCreatedAt,
} from '../src/services/stats'

function testDb(): Kysely<DB> {
  return new Kysely<DB>({
    dialect: {
      createAdapter: () => new SqliteAdapter(),
      createDriver: () => new DummyDriver(),
      createIntrospector: (db) => new SqliteIntrospector(db),
      createQueryCompiler: () => new SqliteQueryCompiler(),
    },
  })
}

describe('statsDateFromCreatedAt', () => {
  it('UTC 时间落在上海日界附近时归属正确的日历日', () => {
    // 16:30Z + 8h = 次日 00:30
    expect(statsDateFromCreatedAt('2025-09-17T16:30:00.000Z')).toBe('2025-09-18')
    // 15:59Z 仍属当天
    expect(statsDateFromCreatedAt('2025-09-17T15:59:00.000Z')).toBe('2025-09-17')
  })
})

describe('openOrderStatsDelta', () => {
  it('open 订单返回负增量并归属创建日', () => {
    const delta = openOrderStatsDelta({ status: 'open', total: 1250, created_at: '2025-09-17T02:00:00.000Z' })
    expect(delta).toEqual({ date: '2025-09-17', delta: { sales_amount: -1250, order_count: -1 } })
  })

  it('void 订单不产生增量（作废时已扣减）', () => {
    expect(openOrderStatsDelta({ status: 'void', total: 1250, created_at: '2025-09-17T02:00:00.000Z' })).toBeNull()
  })
})

describe('buildStatsUpsert', () => {
  it('先 UPDATE 累加再 INSERT OR CONFLICT DO NOTHING', () => {
    const [update, insert] = buildStatsUpsert(testDb(), '2025-09-18', { sales_amount: 500, order_count: 1 })
    expect(update.sql).toContain('update "daily_stats" set')
    expect(update.sql).toContain('"sales_amount" = "sales_amount" + ?')
    expect(update.sql).toContain('"order_count" = "order_count" + ?')
    expect(update.parameters).toEqual([500, 1, expect.any(String), '2025-09-18'])
    expect(insert.sql).toContain('insert into "daily_stats"')
    expect(insert.sql).toContain('on conflict ("date") do nothing')
    expect(insert.parameters.slice(0, 4)).toEqual(['2025-09-18', 500, 1, 0])
  })

  it('负增量原样传入（作废/清除场景）', () => {
    const [update] = buildStatsUpsert(testDb(), '2025-09-18', { sales_amount: -990, order_count: -1 })
    expect(update.parameters).toEqual([-990, -1, expect.any(String), '2025-09-18'])
  })

  it('采购增量只更新 purchase_amount', () => {
    const [update, insert] = buildStatsUpsert(testDb(), '2025-09-18', { purchase_amount: 3600 })
    expect(update.sql).toContain('"purchase_amount" = "purchase_amount" + ?')
    expect(update.sql).not.toContain('sales_amount')
    expect(insert.parameters.slice(0, 4)).toEqual(['2025-09-18', 0, 0, 3600])
  })
})

describe('groupDailyStats', () => {
  it('仅计 open 订单，入库全部计入，按上海日分组并排序', () => {
    const rows = groupDailyStats(
      [
        { total: 1000, status: 'open', created_at: '2025-09-17T02:00:00.000Z' },
        { total: 500, status: 'void', created_at: '2025-09-17T03:00:00.000Z' },
        { total: 2000, status: 'open', created_at: '2025-09-17T16:30:00.000Z' }, // 上海 09-18
      ],
      [
        { total_amount: 3000, created_at: '2025-09-16T20:00:00.000Z' }, // 上海 09-17
        { total_amount: 700, created_at: '2025-09-17T01:00:00.000Z' },
      ],
    )
    expect(rows).toEqual([
      { date: '2025-09-17', sales_amount: 1000, order_count: 1, purchase_amount: 3700 },
      { date: '2025-09-18', sales_amount: 2000, order_count: 1, purchase_amount: 0 },
    ])
  })
})
