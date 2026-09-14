import { Hono } from 'hono'
import { sql } from 'kysely'
import type { HomeReport } from '@sm/shared'
import type { AppEnv } from '../env'
import { ok } from '../lib/errors'
import { shanghaiDayStartUtc } from '../lib/ids'
import { listOrders } from '../services/orders'
import { exportAll } from '../services/backup'

const router = new Hono<AppEnv>()

router.get('/home', async (c) => {
  const { db } = c.get('database')
  const dayStart = shanghaiDayStartUtc()

  const [salesRow, purchaseRow, unpaidRow, deliveryRow, stockRow, recent] = await Promise.all([
    db
      .selectFrom('orders')
      .select([
        sql<number>`COALESCE(SUM(total), 0)`.as('amount'),
        sql<number>`COUNT(*)`.as('count'),
      ])
      .where('status', '=', 'open')
      .where('created_at', '>=', dayStart)
      .executeTakeFirst(),
    db
      .selectFrom('purchases')
      .select([sql<number>`COALESCE(SUM(total_amount), 0)`.as('amount')])
      .where('created_at', '>=', dayStart)
      .executeTakeFirst(),
    db
      .selectFrom('orders')
      .select([
        sql<number>`COALESCE(SUM(total - paid_amount), 0)`.as('amount'),
        sql<number>`COUNT(*)`.as('count'),
      ])
      .where('status', '=', 'open')
      .whereRef('paid_amount', '<', 'total')
      .executeTakeFirst(),
    db
      .selectFrom('orders')
      .select(sql<number>`COUNT(*)`.as('count'))
      .where('status', '=', 'open')
      .where('delivery_status', '=', 'pending')
      .executeTakeFirst(),
    db
      .selectFrom('skus')
      .select(sql<number>`COUNT(*)`.as('count'))
      .where('status', '=', 'active')
      .where('stock_status', '=', 'out_of_stock')
      .executeTakeFirst(),
    listOrders(db, { page: 1, page_size: 8 }),
  ])

  const report: HomeReport = {
    today_sales: Number(salesRow?.amount ?? 0),
    today_order_count: Number(salesRow?.count ?? 0),
    today_purchase_amount: Number(purchaseRow?.amount ?? 0),
    unpaid_total: Number(unpaidRow?.amount ?? 0),
    unpaid_order_count: Number(unpaidRow?.count ?? 0),
    pending_delivery_count: Number(deliveryRow?.count ?? 0),
    out_of_stock_count: Number(stockRow?.count ?? 0),
    recent_orders: recent.items,
  }
  return ok(c, report)
})

router.get('/export', async (c) => {
  const data = await exportAll(c.get('database').db)
  return c.json(data, 200, {
    'Content-Disposition': 'attachment; filename="store-export.json"',
  })
})

export default router
