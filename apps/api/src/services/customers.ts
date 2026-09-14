import { sql, type Kysely } from 'kysely'
import type {
  Customer,
  CustomerAddress,
  CustomerDetail,
  Order,
  OrderItem,
  OrderWithItems,
  Paginated,
  Payment,
} from '@sm/shared'
import type { DB } from '../db/schema'
import { ApiError } from '../lib/errors'
import { nowIso } from '../lib/ids'

export interface CustomerListItem extends Customer {
  unpaid_amount: number
  order_count: number
  last_order_at: string | null
}

export interface CustomerAddressInput {
  label?: string | null | undefined
  contact_name?: string | null | undefined
  phone?: string | null | undefined
  address: string
  is_default?: boolean | undefined
}

const toAddress = (row: {
  id: number
  customer_id: number
  label: string | null
  contact_name: string | null
  phone: string | null
  address: string
  is_default: number
  created_at: string
  updated_at: string | null
}): CustomerAddress => ({ ...row })

export async function listCustomerAddresses(
  db: Kysely<DB>,
  customerId: number,
): Promise<CustomerAddress[]> {
  const rows = await db
    .selectFrom('customer_addresses')
    .selectAll()
    .where('customer_id', '=', customerId)
    .orderBy('is_default', 'desc')
    .orderBy('id', 'desc')
    .execute()
  return rows.map(toAddress)
}

async function syncCustomerPrimary(db: Kysely<DB>, customerId: number): Promise<void> {
  const primary = await db
    .selectFrom('customer_addresses')
    .selectAll()
    .where('customer_id', '=', customerId)
    .orderBy('is_default', 'desc')
    .orderBy('id', 'desc')
    .executeTakeFirst()
  if (!primary) return
  await db
    .updateTable('customers')
    .set({ address: primary.address, phone: primary.phone, updated_at: nowIso() })
    .where('id', '=', customerId)
    .execute()
}

export async function addCustomerAddress(
  db: Kysely<DB>,
  customerId: number,
  input: CustomerAddressInput,
): Promise<CustomerAddress> {
  const customer = await db
    .selectFrom('customers')
    .select('id')
    .where('id', '=', customerId)
    .executeTakeFirst()
  if (!customer) throw new ApiError(404, 'CUSTOMER_NOT_FOUND', '客户不存在')

  const countRow = await db
    .selectFrom('customer_addresses')
    .select((eb) => eb.fn.count('customer_addresses.id').as('count'))
    .where('customer_id', '=', customerId)
    .executeTakeFirst()
  const isFirst = Number(countRow?.count ?? 0) === 0
  const makeDefault = input.is_default === true || isFirst
  const now = nowIso()

  if (makeDefault) {
    await db
      .updateTable('customer_addresses')
      .set({ is_default: 0, updated_at: now })
      .where('customer_id', '=', customerId)
      .execute()
  }

  const row = await db
    .insertInto('customer_addresses')
    .values({
      customer_id: customerId,
      label: input.label ?? null,
      contact_name: input.contact_name ?? null,
      phone: input.phone ?? null,
      address: input.address,
      is_default: makeDefault ? 1 : 0,
      created_at: now,
      updated_at: now,
    })
    .returningAll()
    .executeTakeFirstOrThrow()

  if (makeDefault) await syncCustomerPrimary(db, customerId)
  return toAddress(row)
}

export async function deleteCustomerAddress(
  db: Kysely<DB>,
  customerId: number,
  addressId: number,
): Promise<void> {
  await db
    .deleteFrom('customer_addresses')
    .where('id', '=', addressId)
    .where('customer_id', '=', customerId)
    .execute()
}

export async function setDefaultCustomerAddress(
  db: Kysely<DB>,
  customerId: number,
  addressId: number,
): Promise<CustomerAddress> {
  const now = nowIso()
  await db
    .updateTable('customer_addresses')
    .set({ is_default: 0, updated_at: now })
    .where('customer_id', '=', customerId)
    .execute()
  await db
    .updateTable('customer_addresses')
    .set({ is_default: 1, updated_at: now })
    .where('id', '=', addressId)
    .where('customer_id', '=', customerId)
    .execute()
  await syncCustomerPrimary(db, customerId)
  const row = await db
    .selectFrom('customer_addresses')
    .selectAll()
    .where('id', '=', addressId)
    .executeTakeFirst()
  if (!row) throw new ApiError(404, 'ADDRESS_NOT_FOUND', '地址不存在')
  return toAddress(row)
}

export async function listCustomers(
  db: Kysely<DB>,
  params: { q?: string | undefined; page: number; page_size: number },
): Promise<Paginated<CustomerListItem>> {
  const base = () => {
    let query = db.selectFrom('customers').where('customers.status', '=', 'active')
    if (params.q) {
      const keyword = `%${params.q}%`
      query = query.where((eb) =>
        eb.or([
          eb('customers.name', 'like', keyword),
          eb('customers.phone', 'like', keyword),
          eb('customers.address', 'like', keyword),
          eb.exists(
            eb
              .selectFrom('customer_addresses')
              .select('customer_addresses.id')
              .whereRef('customer_addresses.customer_id', '=', 'customers.id')
              .where((inner) =>
                inner.or([
                  inner('customer_addresses.address', 'like', keyword),
                  inner('customer_addresses.phone', 'like', keyword),
                  inner('customer_addresses.contact_name', 'like', keyword),
                ]),
              ),
          ),
        ]),
      )
    }
    return query
  }

  const totalRow = await base()
    .select((eb) => eb.fn.count('customers.id').as('count'))
    .executeTakeFirst()
  const total = Number(totalRow?.count ?? 0)

  const rows = await base()
    .selectAll()
    .orderBy('customers.updated_at', 'desc')
    .orderBy('customers.id', 'desc')
    .limit(params.page_size)
    .offset((params.page - 1) * params.page_size)
    .execute()

  if (!rows.length) return { items: [], total, page: params.page, page_size: params.page_size }
  const ids = rows.map((row) => row.id)
  const stats = await db
    .selectFrom('orders')
    .select([
      'customer_id',
      sql<number>`COALESCE(SUM(CASE WHEN status = 'open' THEN total - paid_amount ELSE 0 END), 0)`.as('unpaid'),
      sql<number>`COUNT(*)`.as('order_count'),
      sql<string | null>`MAX(created_at)`.as('last_order_at'),
    ])
    .where('customer_id', 'in', ids)
    .groupBy('customer_id')
    .execute()
  const statMap = new Map(stats.map((stat) => [stat.customer_id, stat]))

  const items: CustomerListItem[] = rows.map((row) => {
    const stat = statMap.get(row.id)
    return {
      id: row.id,
      name: row.name,
      phone: row.phone,
      address: row.address,
      notes: row.notes,
      status: row.status,
      created_at: row.created_at,
      updated_at: row.updated_at,
      unpaid_amount: Number(stat?.unpaid ?? 0),
      order_count: Number(stat?.order_count ?? 0),
      last_order_at: stat?.last_order_at ?? null,
    }
  })

  return { items, total, page: params.page, page_size: params.page_size }
}

export async function getCustomerDetail(db: Kysely<DB>, id: number): Promise<CustomerDetail | null> {
  const customer = await db.selectFrom('customers').selectAll().where('id', '=', id).executeTakeFirst()
  if (!customer) return null

  const addresses = await listCustomerAddresses(db, id)

  const orderRows = await db
    .selectFrom('orders')
    .leftJoin('users', 'users.id', 'orders.operator_id')
    .selectAll('orders')
    .select('users.nickname as operator_name')
    .where('orders.customer_id', '=', id)
    .orderBy('orders.created_at', 'desc')
    .orderBy('orders.id', 'desc')
    .limit(20)
    .execute()
  const orderIds = orderRows.map((row) => row.id)

  const itemRows = orderIds.length
    ? await db.selectFrom('order_items').selectAll().where('order_id', 'in', orderIds).execute()
    : []
  const paymentRows = orderIds.length
    ? await db
        .selectFrom('payments')
        .leftJoin('users', 'users.id', 'payments.operator_id')
        .selectAll('payments')
        .select('users.nickname as operator_name')
        .where('payments.order_id', 'in', orderIds)
        .orderBy('payments.id', 'asc')
        .execute()
    : []

  let totalUnpaid = 0
  const orders: OrderWithItems[] = orderRows.map((row) => {
    const remaining = Math.max(0, row.total - row.paid_amount)
    if (row.status === 'open') totalUnpaid += remaining
    const items: OrderItem[] = itemRows
      .filter((item) => item.order_id === row.id)
      .map((item) => ({ ...item }))
    const payments: Payment[] = paymentRows
      .filter((payment) => payment.order_id === row.id)
      .map((payment) => ({
        id: payment.id,
        payment_no: payment.payment_no,
        order_id: payment.order_id,
        customer_id: payment.customer_id,
        method: payment.method as Payment['method'],
        amount: payment.amount,
        purchase_id: payment.purchase_id,
        note: payment.note,
        operator_id: payment.operator_id,
        operator_name: payment.operator_name,
        received_at: payment.received_at,
        created_at: payment.created_at,
      }))
    const order: Order = {
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
    }
    return { ...order, items, payments, remaining }
  })

  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    address: customer.address,
    notes: customer.notes,
    status: customer.status,
    created_at: customer.created_at,
    updated_at: customer.updated_at,
    addresses,
    orders,
    total_unpaid: totalUnpaid,
    last_order_at: orderRows[0]?.created_at ?? null,
  }
}

export async function createCustomer(
  db: Kysely<DB>,
  input: {
    name: string
    phone?: string | null
    address?: string | null
    notes?: string | null
    addresses?: CustomerAddressInput[]
  },
): Promise<Customer> {
  const now = nowIso()
  const row = await db
    .insertInto('customers')
    .values({
      name: input.name,
      phone: input.phone ?? null,
      address: input.address ?? null,
      notes: input.notes ?? null,
      status: 'active',
      created_at: now,
      updated_at: now,
    })
    .returningAll()
    .executeTakeFirstOrThrow()

  const addresses = [...(input.addresses ?? [])]
  if (!addresses.length && input.address) {
    addresses.push({ address: input.address, phone: input.phone ?? null, is_default: true })
  }
  for (const [index, address] of addresses.entries()) {
    await addCustomerAddress(db, row.id, { ...address, is_default: address.is_default || index === 0 })
  }

  const fresh = await db.selectFrom('customers').selectAll().where('id', '=', row.id).executeTakeFirst()
  return fresh ?? row
}

export async function updateCustomer(
  db: Kysely<DB>,
  id: number,
  patch: Partial<{
    name: string
    phone: string | null
    address: string | null
    notes: string | null
    status: string
    addresses: CustomerAddressInput[]
  }>,
): Promise<Customer> {
  const values: Record<string, unknown> = { updated_at: nowIso() }
  if (patch.name !== undefined) values.name = patch.name
  if (patch.phone !== undefined) values.phone = patch.phone
  if (patch.address !== undefined) values.address = patch.address
  if (patch.notes !== undefined) values.notes = patch.notes
  if (patch.status !== undefined) values.status = patch.status
  await db.updateTable('customers').set(values as never).where('id', '=', id).execute()

  if (patch.addresses !== undefined) {
    await db.deleteFrom('customer_addresses').where('customer_id', '=', id).execute()
    for (const [index, address] of patch.addresses.entries()) {
      await addCustomerAddress(db, id, { ...address, is_default: address.is_default || index === 0 })
    }
  }

  const row = await db.selectFrom('customers').selectAll().where('id', '=', id).executeTakeFirst()
  if (!row) throw new ApiError(404, 'CUSTOMER_NOT_FOUND', '客户不存在')
  return row
}
