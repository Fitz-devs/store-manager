import { DummyDriver, Kysely, SqliteAdapter, SqliteIntrospector, SqliteQueryCompiler } from 'kysely'
import { describe, expect, it } from 'vitest'
import type { DB } from '../src/db/schema'
import { applyOrderListFilters, applyPurchaseListFilters } from '../src/lib/list-filters'

function createTestDb() {
  return new Kysely<DB>({
    dialect: {
      createAdapter: () => new SqliteAdapter(),
      createDriver: () => new DummyDriver(),
      createIntrospector: (db) => new SqliteIntrospector(db),
      createQueryCompiler: () => new SqliteQueryCompiler(),
    },
  })
}

describe('order list filters', () => {
  const db = createTestDb()

  it('q expands to delivery address/phone/contact/note among document fields', () => {
    const { sql, parameters } = applyOrderListFilters(
      db.selectFrom('orders').selectAll('orders'),
      { q: '朝阳' },
    ).compile()

    expect(sql).toContain('"orders"."delivery_address" like ?')
    expect(sql).toContain('"orders"."delivery_phone" like ?')
    expect(sql).toContain('"orders"."delivery_contact" like ?')
    expect(sql).toContain('"orders"."note" like ?')
    expect(sql).toContain('"orders"."order_no" like ?')
    expect(sql).toContain('"orders"."customer_name" like ?')
    expect(parameters).toContain('%朝阳%')
  })

  it('from/to normalize to Shanghai day UTC ISO boundaries', () => {
    const { sql, parameters } = applyOrderListFilters(
      db.selectFrom('orders').selectAll('orders'),
      { from: '2026-09-01', to: '2026-09-18' },
    ).compile()

    expect(sql).toContain('"orders"."created_at" >= ?')
    expect(sql).toContain('"orders"."created_at" <= ?')
    expect(parameters).toContain('2026-08-31T16:00:00.000Z')
    expect(parameters).toContain('2026-09-18T15:59:59.999Z')
  })

  it('supports single-sided from only', () => {
    const { sql, parameters } = applyOrderListFilters(
      db.selectFrom('orders').selectAll('orders'),
      { from: '2026-09-01' },
    ).compile()

    expect(sql).toContain('"orders"."created_at" >= ?')
    expect(sql).not.toContain('"orders"."created_at" <= ?')
    expect(parameters).toContain('2026-08-31T16:00:00.000Z')
  })

  it('supports single-sided to only', () => {
    const { sql, parameters } = applyOrderListFilters(
      db.selectFrom('orders').selectAll('orders'),
      { to: '2026-09-18' },
    ).compile()

    expect(sql).toContain('"orders"."created_at" <= ?')
    expect(sql).not.toContain('"orders"."created_at" >= ?')
    expect(parameters).toContain('2026-09-18T15:59:59.999Z')
  })

  it('skips invalid date bounds instead of throwing', () => {
    const { sql } = applyOrderListFilters(db.selectFrom('orders').selectAll('orders'), {
      from: '2026-02-30',
      to: 'not-a-date',
    }).compile()

    expect(sql).not.toContain('"orders"."created_at" >= ?')
    expect(sql).not.toContain('"orders"."created_at" <= ?')
  })
})

describe('purchase list filters', () => {
  const db = createTestDb()

  it('q matches purchase_no, supplier_name and product_name snapshot via EXISTS', () => {
    const { sql, parameters } = applyPurchaseListFilters(
      db.selectFrom('purchases').selectAll('purchases'),
      { q: '可乐' },
    ).compile()

    expect(sql).toContain('"purchases"."purchase_no" like ?')
    expect(sql).toContain('"purchases"."supplier_name" like ?')
    expect(sql).toContain('exists')
    expect(sql.toLowerCase()).toContain('"purchase_items"."product_name" like ?')
    expect(sql).toContain('"purchase_items"."purchase_id"')
    expect(sql).toContain('"purchases"."id"')
    expect(parameters).toContain('%可乐%')
  })

  it('from/to bound ordered_at to full local day range', () => {
    const { sql, parameters } = applyPurchaseListFilters(
      db.selectFrom('purchases').selectAll('purchases'),
      { from: '2026-09-01', to: '2026-09-18' },
    ).compile()

    expect(sql).toContain('"purchases"."ordered_at" >= ?')
    expect(sql).toContain('"purchases"."ordered_at" <= ?')
    expect(parameters).toContain('2026-09-01')
    expect(parameters).toContain('2026-09-18T23:59:59.999')
  })

  it('supports single-sided to only', () => {
    const { sql, parameters } = applyPurchaseListFilters(
      db.selectFrom('purchases').selectAll('purchases'),
      { to: '2026-09-18' },
    ).compile()

    expect(sql).toContain('"purchases"."ordered_at" <= ?')
    expect(sql).not.toContain('"purchases"."ordered_at" >= ?')
    expect(parameters).toContain('2026-09-18T23:59:59.999')
  })

  it('supports single-sided from only', () => {
    const { sql, parameters } = applyPurchaseListFilters(
      db.selectFrom('purchases').selectAll('purchases'),
      { from: '2026-09-01' },
    ).compile()

    expect(sql).toContain('"purchases"."ordered_at" >= ?')
    expect(sql).not.toContain('"purchases"."ordered_at" <= ?')
    expect(parameters).toContain('2026-09-01')
  })

  it('skips invalid date bounds instead of throwing', () => {
    const { sql } = applyPurchaseListFilters(db.selectFrom('purchases').selectAll('purchases'), {
      from: '2026-02-30',
      to: 'not-a-date',
    }).compile()

    expect(sql).not.toContain('"purchases"."ordered_at" >= ?')
    expect(sql).not.toContain('"purchases"."ordered_at" <= ?')
  })
})
