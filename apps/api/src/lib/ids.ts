import type { Kysely } from 'kysely'
import type { DB } from '../db/schema'

export function nowIso(): string {
  return new Date().toISOString()
}

export function shanghaiDateString(now = new Date()): string {
  return new Date(now.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10)
}

export function shanghaiDayStartUtc(now = new Date()): string {
  return new Date(`${shanghaiDateString(now)}T00:00:00+08:00`).toISOString()
}

export function uuid(): string {
  return crypto.randomUUID()
}

function compact(dateStr: string): string {
  return dateStr.slice(2).replace(/-/g, '')
}

function pad(seq: number): string {
  return String(seq).padStart(4, '0')
}

export async function nextPurchaseNo(db: Kysely<DB>, date = shanghaiDateString()): Promise<string> {
  const prefix = compact(date)
  const row = await db
    .selectFrom('purchases')
    .select('purchase_no')
    .where('purchase_no', 'like', `${prefix}-%`)
    .orderBy('purchase_no', 'desc')
    .limit(1)
    .executeTakeFirst()
  const seq = row ? Number(row.purchase_no.split('-')[1]) + 1 : 1
  return `${prefix}-${pad(seq)}`
}

export async function nextOrderNo(db: Kysely<DB>, date = shanghaiDateString()): Promise<string> {
  const prefix = `O${compact(date)}`
  const row = await db
    .selectFrom('orders')
    .select('order_no')
    .where('order_no', 'like', `${prefix}-%`)
    .orderBy('order_no', 'desc')
    .limit(1)
    .executeTakeFirst()
  const seq = row ? Number(row.order_no.split('-')[1]) + 1 : 1
  return `${prefix}-${pad(seq)}`
}

export async function nextPaymentNo(db: Kysely<DB>, date = shanghaiDateString()): Promise<string> {
  const prefix = `P${compact(date)}`
  const row = await db
    .selectFrom('payments')
    .select('payment_no')
    .where('payment_no', 'like', `${prefix}-%`)
    .orderBy('payment_no', 'desc')
    .limit(1)
    .executeTakeFirst()
  const seq = row ? Number(row.payment_no.split('-')[1]) + 1 : 1
  return `${prefix}-${pad(seq)}`
}
