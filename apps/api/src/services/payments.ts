import type { Kysely } from 'kysely'
import type {
  OrderWithItems,
  Payment,
  PaymentCreateInput,
  PaymentUpdateInput,
} from '@sm/shared'
import { fenToYuan } from '@sm/shared'
import type { DB } from '../db/schema'
import type { StorageAdapter } from '../adapters/storage'
import { ApiError } from '../lib/errors'
import { nextPaymentNo, nowIso } from '../lib/ids'
import { getOrder } from './orders'

export async function addPayment(
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
  const remaining = Math.max(0, order.total - order.paid_amount)
  if (input.amount > remaining) {
    throw new ApiError(400, 'VALIDATION', `回款金额不能超过未收余款 ${fenToYuan(remaining)} 元`)
  }

  const now = nowIso()
  const paymentNo = await nextPaymentNo(db)
  const paymentRow = await db
    .insertInto('payments')
    .values({
      payment_no: paymentNo,
      order_id: order.id,
      customer_id: order.customer_id,
      method: input.method,
      amount: input.amount,
      photo_key: input.photo_key ?? null,
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
      photo_key: paymentRow.photo_key,
      note: paymentRow.note,
      operator_id: paymentRow.operator_id,
      received_at: paymentRow.received_at,
      created_at: paymentRow.created_at,
    },
  }
}

export async function updatePayment(
  db: Kysely<DB>,
  id: number,
  patch: PaymentUpdateInput,
  storage?: StorageAdapter,
): Promise<{ order: OrderWithItems; payment: Payment }> {
  const existing = await db
    .selectFrom('payments')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst()
  if (!existing) throw new ApiError(404, 'PAYMENT_NOT_FOUND', '付款记录不存在')
  const order = await db
    .selectFrom('orders')
    .selectAll()
    .where('id', '=', existing.order_id)
    .executeTakeFirst()
  if (!order) throw new ApiError(404, 'ORDER_NOT_FOUND', '订单不存在')
  if (order.status === 'void') throw new ApiError(400, 'ORDER_VOID', '订单已作废')

  const values: Record<string, unknown> = {}
  if (patch.method !== undefined) values.method = patch.method
  if (patch.note !== undefined) values.note = patch.note
  if (patch.photo_key !== undefined) values.photo_key = patch.photo_key
  if (patch.received_at !== undefined) values.received_at = patch.received_at
  const amountChanged = patch.amount !== undefined && patch.amount !== existing.amount
  if (amountChanged) {
    if (patch.amount! <= 0) throw new ApiError(400, 'VALIDATION', '回款金额必须大于 0')
    const otherPaid = order.paid_amount - existing.amount
    if (otherPaid + patch.amount! > order.total) {
      throw new ApiError(
        400,
        'VALIDATION',
        `回款金额不能超过未收余款 ${fenToYuan(order.total - otherPaid)} 元`,
      )
    }
    values.amount = patch.amount
  }

  await db.updateTable('payments').set(values as never).where('id', '=', id).execute()
  if (amountChanged) {
    await db
      .updateTable('orders')
      .set({ paid_amount: order.paid_amount - existing.amount + (patch.amount as number), updated_at: nowIso() })
      .where('id', '=', order.id)
      .execute()
  }

  const previousPhotoKey = existing.photo_key ?? null
  if (
    storage &&
    previousPhotoKey &&
    patch.photo_key !== undefined &&
    previousPhotoKey !== patch.photo_key
  ) {
    await storage.delete(previousPhotoKey).catch(() => undefined)
  }

  const detail = await getOrder(db, order.id)
  if (!detail) throw new ApiError(500, 'UPDATE_FAILED', '更新失败')
  const paymentsRow = detail.payments.find((row) => row.id === id)
  if (!paymentsRow) throw new ApiError(500, 'UPDATE_FAILED', '更新失败')
  return { order: detail, payment: paymentsRow }
}
