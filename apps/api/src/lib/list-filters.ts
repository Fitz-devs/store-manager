import type { SelectQueryBuilder } from 'kysely'
import type { DB } from '../db/schema'
import { isoDayFromShanghai, isoDayToShanghai, purchaseDayFrom, purchaseDayTo } from './date-range'

export interface OrderListFilterParams {
  q?: string | undefined
  status?: string | undefined
  delivery_status?: string | undefined
  customer_id?: number | undefined
  from?: string | undefined
  to?: string | undefined
  only_unpaid?: boolean | undefined
}

export interface PurchaseListFilterParams {
  q?: string | undefined
  from?: string | undefined
  to?: string | undefined
}

/** 订单单据字段模糊搜索：单号/客户名/送货地址电话/联系人/备注 */
export function applyOrderListFilters<Q>(
  query: SelectQueryBuilder<DB, 'orders', Q>,
  params: OrderListFilterParams,
): SelectQueryBuilder<DB, 'orders', Q> {
  if (params.q) {
    const keyword = `%${params.q}%`
    query = query.where((eb) =>
      eb.or([
        eb('orders.order_no', 'like', keyword),
        eb('orders.customer_name', 'like', keyword),
        eb('orders.delivery_address', 'like', keyword),
        eb('orders.delivery_phone', 'like', keyword),
        eb('orders.delivery_contact', 'like', keyword),
        eb('orders.note', 'like', keyword),
      ]),
    )
  }
  if (params.status) query = query.where('orders.status', '=', params.status)
  if (params.delivery_status) query = query.where('orders.delivery_status', '=', params.delivery_status)
  if (params.customer_id) query = query.where('orders.customer_id', '=', params.customer_id)
  const from = params.from ? isoDayFromShanghai(params.from) : undefined
  const to = params.to ? isoDayToShanghai(params.to) : undefined
  if (from) query = query.where('orders.created_at', '>=', from)
  if (to) query = query.where('orders.created_at', '<=', to)
  if (params.only_unpaid) {
    query = query.where('orders.status', '=', 'open').whereRef('orders.paid_amount', '<', 'orders.total')
  }
  return query
}

/** 入库模糊搜索：单号 / 供应商 / 明细商品名快照 */
export function applyPurchaseListFilters<Q>(
  query: SelectQueryBuilder<DB, 'purchases', Q>,
  params: PurchaseListFilterParams,
): SelectQueryBuilder<DB, 'purchases', Q> {
  if (params.q) {
    const keyword = `%${params.q}%`
    query = query.where((eb) =>
      eb.or([
        eb('purchases.purchase_no', 'like', keyword),
        eb('purchases.supplier_name', 'like', keyword),
        eb.exists(
          eb
            .selectFrom('purchase_items')
            .select('purchase_items.id')
            .whereRef('purchase_items.purchase_id', '=', 'purchases.id')
            .where('purchase_items.product_name', 'like', keyword),
        ),
      ]),
    )
  }
  const from = params.from ? purchaseDayFrom(params.from) : undefined
  const to = params.to ? purchaseDayTo(params.to) : undefined
  if (from) query = query.where('purchases.ordered_at', '>=', from)
  if (to) query = query.where('purchases.ordered_at', '<=', to)
  return query
}
