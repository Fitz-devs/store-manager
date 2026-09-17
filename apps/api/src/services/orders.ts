import type { Kysely } from 'kysely'
import type {
  Order,
  OrderCreateInput,
  OrderItem,
  OrderWithItems,
  Paginated,
  Payment,
} from '@sm/shared'
import { calcAmount } from '@sm/shared'
import type { DB } from '../db/schema'
import type { StorageAdapter } from '../adapters/storage'
import { batchCompiled } from '../db/batch'
import { ApiError } from '../lib/errors'
import { nextOrderNo, nextPaymentNo, nowIso } from '../lib/ids'
import { applyOrderListFilters } from '../lib/list-filters'
import { loadSkuMeta } from './purchases'

export async function createOrder(
  d1: D1Database,
  db: Kysely<DB>,
  input: OrderCreateInput,
  operatorId: number,
): Promise<OrderWithItems> {
  const skuIds = [...new Set(input.items.map((item) => item.sku_id))]
  const meta = await loadSkuMeta(db, skuIds)
  const now = nowIso()
  const orderNo = await nextOrderNo(db)

  const computed = input.items.map((item) => {
    const sku = meta.get(item.sku_id)
    if (!sku) throw new ApiError(400, 'SKU_NOT_FOUND', `商品不存在: ${item.sku_id}`)
    return {
      item,
      sku,
      baseQty: item.qty * item.conversion,
      amount: calcAmount(item.unit_price, item.qty),
    }
  })

  const subtotal = computed.reduce((sum, row) => sum + row.amount, 0)
  const discount = Math.min(input.discount ?? 0, subtotal)
  const total = Math.max(0, subtotal - discount)
  const payments = [...(input.payments ?? []), ...(input.payment ? [input.payment] : [])]
  const paymentsTotal = payments.reduce((sum, p) => sum + p.amount, 0)
  if (paymentsTotal > total) {
    throw new ApiError(400, 'VALIDATION', '实收金额不能大于订单金额')
  }
  const delivery = input.delivery
  const deliveryRequired = delivery?.required ? 1 : 0

  let customerName = input.customer_name ?? null
  if (input.customer_id) {
    const customer = await db
      .selectFrom('customers')
      .selectAll()
      .where('id', '=', input.customer_id)
      .executeTakeFirst()
    if (!customer) throw new ApiError(404, 'CUSTOMER_NOT_FOUND', '客户不存在')
    customerName = customer.name
  }

  const order = await db
    .insertInto('orders')
    .values({
      order_no: orderNo,
      customer_id: input.customer_id ?? null,
      customer_name: customerName,
      delivery_required: deliveryRequired,
      delivery_address: delivery?.address ?? null,
      delivery_contact: delivery?.contact ?? null,
      delivery_phone: delivery?.phone ?? null,
      delivery_at: delivery?.at ?? null,
      delivery_lat: delivery?.lat ?? null,
      delivery_lng: delivery?.lng ?? null,
      subtotal,
      discount,
      total,
      paid_amount: paymentsTotal,
      is_credit: input.is_credit ? 1 : 0,
      status: 'open',
      delivery_status: deliveryRequired ? 'pending' : 'none',
      note: input.note ?? null,
      operator_id: operatorId,
      created_at: now,
      updated_at: now,
    })
    .returningAll()
    .executeTakeFirstOrThrow()

  const statements = computed.map((row) =>
    db
      .insertInto('order_items')
      .values({
        order_id: order.id,
        sku_id: row.sku.sku_id,
        product_name: row.sku.product_name,
        spec_name: row.sku.spec_name,
        unit_name: row.item.unit_name,
        conversion: row.item.conversion,
        qty: row.item.qty,
        base_qty: row.baseQty,
        unit_price: row.item.unit_price,
        amount: row.amount,
        promotion_text: row.item.promotion_text ?? null,
      })
      .compile(),
  )

  for (let index = 0; index < payments.length; index += 1) {
    const payment = payments[index]!
    if (payment.amount <= 0) continue
    const paymentNo = await nextPaymentNo(db)
    statements.push(
      db
        .insertInto('payments')
        .values({
          payment_no: paymentNo,
          order_id: order.id,
          customer_id: order.customer_id,
          method: payment.method,
          amount: payment.amount,
          photo_key: payment.photo_key ?? null,
          note: payment.note ?? null,
          operator_id: operatorId,
          received_at: now,
          created_at: now,
        })
        .compile(),
    )
  }

  await batchCompiled(d1, statements)
  const detail = await getOrder(db, order.id)
  if (!detail) throw new ApiError(500, 'CREATE_FAILED', '订单创建失败')
  return detail
}

export async function updateOrderDeliveryLocation(
  db: Kysely<DB>,
  id: number,
  lat: number,
  lng: number,
  address?: string,
): Promise<OrderWithItems> {
  const existing = await db
    .selectFrom('orders')
    .select(['id', 'delivery_required'])
    .where('id', '=', id)
    .executeTakeFirst()
  if (!existing) throw new ApiError(404, 'ORDER_NOT_FOUND', '订单不存在')
  if (!existing.delivery_required) {
    throw new ApiError(400, 'VALIDATION', '该订单不是送货单')
  }

  await db
    .updateTable('orders')
    .set({
      delivery_lat: lat,
      delivery_lng: lng,
      ...(address ? { delivery_address: address } : {}),
      updated_at: nowIso(),
    })
    .where('id', '=', id)
    .execute()

  const detail = await getOrder(db, id)
  if (!detail) throw new ApiError(404, 'ORDER_NOT_FOUND', '订单不存在')
  return detail
}

export async function purgeOrder(
  db: Kysely<DB>,
  d1: D1Database,
  id: number,
  storage: StorageAdapter,
): Promise<void> {
  const order = await db
    .selectFrom('orders')
    .select(['id', 'delivery_photo_key'])
    .where('id', '=', id)
    .executeTakeFirst()
  if (!order) throw new ApiError(404, 'ORDER_NOT_FOUND', '订单不存在')
  const paymentRows = await db
    .selectFrom('payments')
    .select(['photo_key'])
    .where('order_id', '=', id)
    .execute()
  const statements = [
    db.deleteFrom('payments').where('order_id', '=', id).compile(),
    db.deleteFrom('order_items').where('order_id', '=', id).compile(),
    db.deleteFrom('orders').where('id', '=', id).compile(),
  ]
  await batchCompiled(d1, statements)
  const photoKeys = [
    order.delivery_photo_key,
    ...paymentRows.map((row) => row.photo_key),
  ].filter((key): key is string => Boolean(key))
  for (const key of photoKeys) {
    await storage.delete(key).catch(() => undefined)
  }
}

export async function getOrder(db: Kysely<DB>, id: number): Promise<OrderWithItems | null> {
  const row = await db
    .selectFrom('orders')
    .leftJoin('users', 'users.id', 'orders.operator_id')
    .selectAll('orders')
    .select('users.nickname as operator_name')
    .where('orders.id', '=', id)
    .executeTakeFirst()
  if (!row) return null

  const itemRows = await db
    .selectFrom('order_items')
    .leftJoin('skus', 'skus.id', 'order_items.sku_id')
    .selectAll('order_items')
    .select('skus.product_id as product_id')
    .where('order_items.order_id', '=', id)
    .orderBy('order_items.id', 'asc')
    .execute()

  const paymentRows = await db
    .selectFrom('payments')
    .leftJoin('users', 'users.id', 'payments.operator_id')
    .selectAll('payments')
    .select('users.nickname as operator_name')
    .where('payments.order_id', '=', id)
    .orderBy('payments.id', 'asc')
    .execute()

  const items: OrderItem[] = itemRows.map((item) => ({ ...item, product_id: item.product_id ?? null }))
  const payments: Payment[] = paymentRows.map((payment) => ({
    id: payment.id,
    payment_no: payment.payment_no,
    order_id: payment.order_id,
    customer_id: payment.customer_id,
    method: payment.method as Payment['method'],
    amount: payment.amount,
    photo_key: payment.photo_key,
    note: payment.note,
    operator_id: payment.operator_id,
    operator_name: payment.operator_name,
    received_at: payment.received_at,
    created_at: payment.created_at,
  }))

  return {
    id: row.id,
    order_no: row.order_no,
    customer_id: row.customer_id,
    customer_name: row.customer_name,
    delivery_required: row.delivery_required,
    delivery_address: row.delivery_address,
    delivery_contact: row.delivery_contact,
    delivery_phone: row.delivery_phone,
    delivery_at: row.delivery_at,
    delivered_at: row.delivered_at,
    delivery_photo_key: row.delivery_photo_key,
    delivery_lat: row.delivery_lat,
    delivery_lng: row.delivery_lng,
    subtotal: row.subtotal,
    discount: row.discount,
    total: row.total,
    paid_amount: row.paid_amount,
    is_credit: row.is_credit,
    status: row.status as Order['status'],
    delivery_status: row.delivery_status as Order['delivery_status'],
    note: row.note,
    operator_id: row.operator_id,
    operator_name: row.operator_name,
    created_at: row.created_at,
    updated_at: row.updated_at,
    items,
    payments,
    remaining: Math.max(0, row.total - row.paid_amount),
  }
}

export interface ListOrdersParams {
  q?: string | undefined
  status?: string | undefined
  delivery_status?: string | undefined
  customer_id?: number | undefined
  from?: string | undefined
  to?: string | undefined
  only_unpaid?: boolean | undefined
  page: number
  page_size: number
}

export async function listOrders(
  db: Kysely<DB>,
  params: ListOrdersParams,
): Promise<Paginated<Order>> {
  const base = () => applyOrderListFilters(db.selectFrom('orders'), params)

  const totalRow = await base()
    .select((eb) => eb.fn.count('orders.id').as('count'))
    .executeTakeFirst()
  const total = Number(totalRow?.count ?? 0)

  const rows = await base()
    .leftJoin('users', 'users.id', 'orders.operator_id')
    .selectAll('orders')
    .select('users.nickname as operator_name')
    .orderBy('orders.created_at', 'desc')
    .orderBy('orders.id', 'desc')
    .limit(params.page_size)
    .offset((params.page - 1) * params.page_size)
    .execute()

  const items: Order[] = rows.map((row) => ({
    id: row.id,
    order_no: row.order_no,
    customer_id: row.customer_id,
    customer_name: row.customer_name,
    delivery_required: row.delivery_required,
    delivery_address: row.delivery_address,
    delivery_contact: row.delivery_contact,
    delivery_phone: row.delivery_phone,
    delivery_at: row.delivery_at,
    delivered_at: row.delivered_at,
    delivery_photo_key: row.delivery_photo_key,
    delivery_lat: row.delivery_lat,
    delivery_lng: row.delivery_lng,
    subtotal: row.subtotal,
    discount: row.discount,
    total: row.total,
    paid_amount: row.paid_amount,
    is_credit: row.is_credit,
    status: row.status as Order['status'],
    delivery_status: row.delivery_status as Order['delivery_status'],
    note: row.note,
    operator_id: row.operator_id,
    operator_name: row.operator_name,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }))

  return { items, total, page: params.page, page_size: params.page_size }
}

export async function deliverOrder(
  db: Kysely<DB>,
  id: number,
  input: { photo_key?: string | null | undefined; delivered_at?: string | undefined; note?: string | null | undefined },
): Promise<OrderWithItems> {
  const order = await db.selectFrom('orders').selectAll().where('id', '=', id).executeTakeFirst()
  if (!order) throw new ApiError(404, 'ORDER_NOT_FOUND', '订单不存在')
  if (order.status === 'void') throw new ApiError(400, 'ORDER_VOID', '订单已作废')
  const now = nowIso()
  await db
    .updateTable('orders')
    .set({
      delivery_status: 'delivered',
      delivered_at: input.delivered_at ?? now,
      delivery_photo_key: input.photo_key ?? order.delivery_photo_key,
      updated_at: now,
    })
    .where('id', '=', id)
    .execute()
  const detail = await getOrder(db, id)
  if (!detail) throw new ApiError(500, 'UPDATE_FAILED', '更新失败')
  return detail
}

export async function voidOrder(db: Kysely<DB>, id: number): Promise<OrderWithItems> {
  const order = await db.selectFrom('orders').selectAll().where('id', '=', id).executeTakeFirst()
  if (!order) throw new ApiError(404, 'ORDER_NOT_FOUND', '订单不存在')
  if (order.status === 'void') throw new ApiError(400, 'ORDER_VOID', '订单已作废')
  await db
    .updateTable('orders')
    .set({ status: 'void', updated_at: nowIso() })
    .where('id', '=', id)
    .execute()
  const detail = await getOrder(db, id)
  if (!detail) throw new ApiError(500, 'UPDATE_FAILED', '更新失败')
  return detail
}
