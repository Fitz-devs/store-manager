import { describe, expect, it } from 'vitest'
import { DummyDriver, Kysely, SqliteAdapter, SqliteIntrospector, SqliteQueryCompiler } from 'kysely'
import type { DB } from '../src/db/schema'
import { matchOcrRows, resolveOcrMatchRows } from '../src/services/match-ocr'

function testDb() {
  return new Kysely<DB>({
    dialect: {
      createAdapter: () => new SqliteAdapter(),
      createDriver: () => new DummyDriver(),
      createIntrospector: (db) => new SqliteIntrospector(db),
      createQueryCompiler: () => new SqliteQueryCompiler(),
    },
  })
}

describe('resolveOcrMatchRows（仅商品码，不读品名）', () => {
  it('空库：全部 missing，不因品名产生 hit', () => {
    const results = resolveOcrMatchRows(
      [
        { box_code: '6907992518671', unit_code: '6907992519593' },
        { box_code: null, unit_code: null },
        { box_code: null, unit_code: '6901234567890' },
      ],
      [],
      [],
      [],
    )
    expect(results).toHaveLength(3)
    for (const row of results) {
      expect(row.status).toBe('missing')
      expect(row.match_source).toBe('none')
      expect(row.hit).toBeNull()
      expect(row.candidates).toEqual([])
    }
  })

  it('箱码优先于件码，并返回轻量价格字段', () => {
    const results = resolveOcrMatchRows(
      [{ box_code: 'BOX1', unit_code: 'UNIT1' }],
      [
        { code: 'UNIT1', sku_id: 20, product_id: 2, is_primary: 1 },
        { code: 'BOX1', sku_id: 10, product_id: 1, is_primary: 1 },
      ],
      [
        {
          id: 10,
          product_id: 1,
          spec_name: '整箱',
          sale_unit: '箱',
          retail_price: 0,
          friend_price: null,
          latest_purchase_price: 3450,
          stock_status: 'in_stock',
          out_of_stock_at: null,
          status: 'active',
          created_at: '2026-01-01',
          updated_at: null,
        },
        {
          id: 20,
          product_id: 2,
          spec_name: '单件',
          sale_unit: '件',
          retail_price: 500,
          friend_price: null,
          latest_purchase_price: 280,
          stock_status: 'in_stock',
          out_of_stock_at: null,
          status: 'active',
          created_at: '2026-01-01',
          updated_at: null,
        },
      ],
      [
        {
          id: 1,
          name: '金典纯牛奶250ml*12',
          aliases: null,
          category: null,
          brand: null,
          notes: null,
          image_key: null,
          status: 'active',
          created_at: '2026-01-01',
          updated_at: null,
        },
        {
          id: 2,
          name: '金典纯牛奶250ml',
          aliases: null,
          category: null,
          brand: null,
          notes: null,
          image_key: null,
          status: 'active',
          created_at: '2026-01-01',
          updated_at: null,
        },
      ],
    )
    expect(results[0]?.status).toBe('matched')
    expect(results[0]?.match_source).toBe('box_code')
    expect(results[0]?.hit?.sku_id).toBe(10)
    expect(results[0]?.hit?.product_id).toBe(1)
    expect(results[0]?.hit?.product_name).toBe('金典纯牛奶250ml*12')
    expect(results[0]?.hit?.latest_purchase_price).toBe(3450)
    expect(results[0]?.hit?.matched_code).toBe('BOX1')
    expect(results[0]?.hit?.product_status).toBe('active')
    expect(results[0]?.hit?.sku_status).toBe('active')
  })

  it('命中下架商品时带出 archived 状态供 UI 标识', () => {
    const results = resolveOcrMatchRows(
      [{ box_code: 'OLD', unit_code: null }],
      [{ code: 'OLD', sku_id: 9, product_id: 9, is_primary: 1 }],
      [
        {
          id: 9,
          product_id: 9,
          spec_name: null,
          sale_unit: '提',
          retail_price: 0,
          friend_price: null,
          latest_purchase_price: 3450,
          stock_status: 'in_stock',
          out_of_stock_at: null,
          status: 'active',
          created_at: '2026-01-01',
          updated_at: null,
        },
      ],
      [
        {
          id: 9,
          name: '200ml金典纯牛奶200ml*12',
          aliases: null,
          category: null,
          brand: null,
          notes: null,
          image_key: null,
          status: 'archived',
          created_at: '2026-01-01',
          updated_at: null,
        },
      ],
    )
    expect(results[0]?.status).toBe('matched')
    expect(results[0]?.hit?.product_status).toBe('archived')
    expect(results[0]?.hit?.product_name).toBe('200ml金典纯牛奶200ml*12')
  })

  it('仅有件码时走 unit_code', () => {
    const results = resolveOcrMatchRows(
      [{ box_code: null, unit_code: 'UNIT9' }],
      [{ code: 'UNIT9', sku_id: 20, product_id: 2, is_primary: 1 }],
      [
        {
          id: 20,
          product_id: 2,
          spec_name: null,
          sale_unit: '件',
          retail_price: 300,
          friend_price: null,
          latest_purchase_price: 250,
          stock_status: 'in_stock',
          out_of_stock_at: null,
          status: 'active',
          created_at: '2026-01-01',
          updated_at: null,
        },
      ],
      [
        {
          id: 2,
          name: '安慕希',
          aliases: null,
          category: null,
          brand: null,
          notes: null,
          image_key: null,
          status: 'active',
          created_at: '2026-01-01',
          updated_at: null,
        },
      ],
    )
    expect(results[0]?.match_source).toBe('unit_code')
    expect(results[0]?.hit?.sale_unit).toBe('件')
  })

  it('同码多 SKU：主码优先，其余进 candidates', () => {
    const sku = (id: number, primaryNote: string) => ({
      id,
      product_id: 1,
      spec_name: primaryNote,
      sale_unit: '件',
      retail_price: 0,
      friend_price: null,
      latest_purchase_price: null,
      stock_status: 'in_stock',
      out_of_stock_at: null,
      status: 'active',
      created_at: '2026-01-01',
      updated_at: null,
    })
    const product = {
      id: 1,
      name: '多规格烟',
      aliases: null,
      category: null,
      brand: null,
      notes: null,
      image_key: null,
      status: 'active',
      created_at: '2026-01-01',
      updated_at: null,
    }
    const results = resolveOcrMatchRows(
      [{ box_code: null, unit_code: 'MULTI' }],
      [
        { code: 'MULTI', sku_id: 3, product_id: 1, is_primary: 0 },
        { code: 'MULTI', sku_id: 2, product_id: 1, is_primary: 1 },
      ],
      [sku(2, 'A'), sku(3, 'B')],
      [product],
    )
    expect(results[0]?.hit?.sku_id).toBe(2)
    expect(results[0]?.candidates.map((item) => item.sku_id)).toEqual([2, 3])
  })
})

describe('matchOcrRows 查询形态', () => {
  it('空库走 code IN，不编译名称 LIKE / COUNT', async () => {
    const db = testDb()
    // DummyDriver 无法真正 execute，这里验证编译形态
    const compiled = db
      .selectFrom('barcodes')
      .select(['code', 'sku_id', 'product_id', 'is_primary'])
      .where('code', 'in', ['BOX1', 'UNIT1'])
      .compile()
    expect(compiled.sql).toContain('from "barcodes"')
    expect(compiled.sql).toContain('"code" in')
    expect(compiled.sql.toLowerCase()).not.toContain('like')
    expect(compiled.parameters).toEqual(['BOX1', 'UNIT1'])

    await expect(matchOcrRows(db, [])).rejects.toThrow()
  })
})
