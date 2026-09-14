import type { Kysely } from 'kysely'
import type { OrderWithItems, Payment, PaymentCreateInput } from '@sm/shared'
import type { DB } from '../db/schema'
import { ApiError } from '../lib/errors'
import { nextPaymentNo, nowIso } from '../lib/ids'
import { createPurchase } from './purchases'
import { getOrder } from './orders'

export async function addPayment(
  d1: D1Database,
  db: Kysely<DB>,
  input: PaymentCreateInput,
  operatorId: number,
): Promise<{ order: OrderWithItems; payment: Payment }> {
  const order = await db
    .selectFrom('orders')
    .selectAll()
    .where('id', '=', input.order_id)
    .executeTakeFirst()
  if (!order) throw new ApiError(404, 'ORDER_NOT_FOUND', '订单不存在')
  if (order.status === 'void') throw new ApiError(400, 'ORDER_VOID', '订单已作废')
  if (input.amount <= 0) throw new ApiError(400, 'VALIDATION', '回款金额必须大于 0')

  const now = nowIso()
  let purchaseId: number | null = null

  if (input.method === 'goods') {
    if (!input.goods_items?.length) {
      throw new ApiError(400, 'VALIDATION', '商品抵扣需要录入抵扣商品')
    }
    const purchase = await createPurchase(
      d1,
      db,
      {
        supplier_name: null,
        ordered_at: now,
        note: `订单 ${order.order_no} 商品抵扣`,
        items: input.goods_items,
        price_updates: [],
      },
      { applyPurchasePrice: false, operatorId },
    )
    purchaseId = purchase.id
  }

  const paymentNo = await nextPaymentNo(db)
  const paymentRow = await db
    .insertInto('payments')
    .values({
      payment_no: paymentNo,
      order_id: order.id,
      customer_id: order.customer_id,
      method: input.method,
      amount: input.amount,
      purchase_id: purchaseId,
      note: input.note ?? null,
      operator_id: operatorId,
      received_at: input.received_at ?? now,
      created_at: now,
    })
    .returningAll()
    .executeTakeFirstOrThrow()

  await db
    .updateTable('orders')
    .set({ paid_amount: order.paid_amount + input.amount, updated_at: now })
    .where('id', '=', order.id)
    .execute()

  const detail = await getOrder(db, order.id)
  if (!detail) throw new ApiError(500, 'CREATE_FAILED', '回款记录失败')
  return {
    order: detail,
    payment: {
      id: paymentRow.id,
      payment_no: paymentRow.payment_no,
      order_id: paymentRow.order_id,
      customer_id: paymentRow.customer_id,
      method: paymentRow.method as Payment['method'],
      amount: paymentRow.amount,
      purchase_id: paymentRow.purchase_id,
      note: paymentRow.note,
      operator_id: paymentRow.operator_id,
      received_at: paymentRow.received_at,
      created_at: paymentRow.created_at,
    },
  }
}
