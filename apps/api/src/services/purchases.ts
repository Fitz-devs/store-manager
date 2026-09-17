import type { Kysely } from 'kysely'
import type {
  Paginated,
  PriceChangeResult,
  Purchase,
  PurchaseCreateInput,
  PurchaseItem,
  PurchaseWithItems,
} from '@sm/shared'
import { calcAmount, normalizeUnitPrice, priceChangeRatio } from '@sm/shared'
import type { DB } from '../db/schema'
import type { StorageAdapter } from '../adapters/storage'
import { batchCompiled } from '../db/batch'
import { ApiError } from '../lib/errors'
import { parseStoredImageKeys } from '../lib/images'
import { nextPurchaseNo, nowIso } from '../lib/ids'

export interface CheckPriceItem {
  sku_id: number
  unit_name: string
  conversion: number
  unit_price: number
}

export interface SkuMeta {
  sku_id: number
  product_id: number
  product_name: string
  spec_name: string | null
  sale_unit: string
  latest_purchase_price: number | null
  retail_price: number
  friend_price: number | null
}

export async function loadSkuMeta(db: Kysely<DB>, skuIds: number[]): Promise<Map<number, SkuMeta>> {
  if (!skuIds.length) return new Map()
  const rows = await db
    .selectFrom('skus')
    .innerJoin('products', 'products.id', 'skus.product_id')
    .select([
      'skus.id as sku_id',
      'skus.product_id',
      'products.name as product_name',
      'skus.spec_name',
      'skus.sale_unit',
      'skus.latest_purchase_price',
      'skus.retail_price',
      'skus.friend_price',
    ])
    .where('skus.id', 'in', skuIds)
    .execute()
  return new Map(rows.map((row) => [row.sku_id, row]))
}

export async function checkPurchasePrices(
  db: Kysely<DB>,
  items: CheckPriceItem[],
): Promise<PriceChangeResult[]> {
  const meta = await loadSkuMeta(db, [...new Set(items.map((item) => item.sku_id))])
  return items.map((item) => {
    const sku = meta.get(item.sku_id)
    if (!sku) throw new ApiError(400, 'SKU_NOT_FOUND', `商品不存在: ${item.sku_id}`)
    const newPrice = normalizeUnitPrice(item.unit_price, item.conversion)
    const oldPrice = sku.latest_purchase_price
    return {
      sku_id: item.sku_id,
      product_name: sku.product_name,
      spec_name: sku.spec_name,
      unit_name: item.unit_name,
      conversion: item.conversion,
      unit_price: item.unit_price,
      old_price: oldPrice,
      new_price: newPrice,
      ratio: priceChangeRatio(oldPrice, newPrice),
      changed: oldPrice !== null && oldPrice !== newPrice,
    }
  })
}

export interface CreatePurchaseOptions {
  operatorId: number
}

export async function createPurchase(
  d1: D1Database,
  db: Kysely<DB>,
  input: PurchaseCreateInput,
  options: CreatePurchaseOptions,
): Promise<PurchaseWithItems> {
  const skuIds = [...new Set(input.items.map((item) => item.sku_id))]
  const meta = await loadSkuMeta(db, skuIds)
  const now = nowIso()
  const purchaseNo = await nextPurchaseNo(db)

  const computedItems = input.items.map((item) => {
    const sku = meta.get(item.sku_id)
    if (!sku) throw new ApiError(400, 'SKU_NOT_FOUND', `商品不存在: ${item.sku_id}`)
    const baseQty = item.qty * item.conversion
    const amount = calcAmount(item.unit_price, item.qty)
    return { item, sku, baseQty, amount }
  })

  const totalAmount = computedItems.reduce((sum, row) => sum + row.amount, 0)

  const purchase = await db
    .insertInto('purchases')
    .values({
      purchase_no: purchaseNo,
      supplier_name: input.supplier_name ?? null,
      kind: 'purchase',
      total_amount: totalAmount,
      note: input.note ?? null,
      image_keys: input.image_keys?.length ? JSON.stringify(input.image_keys) : null,
      ocr_raw: input.ocr_raw ?? null,
      operator_id: options.operatorId,
      ordered_at: input.ordered_at,
      created_at: now,
    })
    .returningAll()
    .executeTakeFirstOrThrow()

  // 价格在「完善商品」阶段已定，入库只记流水，不再改 SKU / 价格历史
  const statements = computedItems.map((row) =>
    db
      .insertInto('purchase_items')
      .values({
        purchase_id: purchase.id,
        sku_id: row.sku.sku_id,
        product_name: row.sku.product_name,
        spec_name: row.sku.spec_name,
        unit_name: row.item.unit_name,
        conversion: row.item.conversion,
        qty: row.item.qty,
        base_qty: row.baseQty,
        unit_price: row.item.unit_price,
        amount: row.amount,
        price_changed: 0,
        retail_updated: 0,
      })
      .compile(),
  )

  await batchCompiled(d1, statements)

  const detail = await getPurchase(db, purchase.id)
  if (!detail) throw new ApiError(500, 'CREATE_FAILED', '入库单创建失败')
  return detail
}

export async function getPurchase(db: Kysely<DB>, id: number): Promise<PurchaseWithItems | null> {
  const row = await db
    .selectFrom('purchases')
    .leftJoin('users', 'users.id', 'purchases.operator_id')
    .selectAll('purchases')
    .select('users.nickname as operator_name')
    .where('purchases.id', '=', id)
    .executeTakeFirst()
  if (!row) return null
  const items = await db
    .selectFrom('purchase_items')
    .leftJoin('skus', 'skus.id', 'purchase_items.sku_id')
    .selectAll('purchase_items')
    .select('skus.product_id as product_id')
    .where('purchase_id', '=', id)
    .orderBy('id', 'asc')
    .execute()
  return {
    id: row.id,
    purchase_no: row.purchase_no,
    supplier_name: row.supplier_name,
    kind: row.kind as Purchase['kind'],
    total_amount: row.total_amount,
    note: row.note,
    image_keys: row.image_keys,
    ocr_raw: row.ocr_raw,
    operator_id: row.operator_id,
    operator_name: row.operator_name,
    ordered_at: row.ordered_at,
    created_at: row.created_at,
    items: items.map(toPurchaseItem),
  }
}

function toPurchaseItem(row: {
  id: number
  purchase_id: number
  sku_id: number
  product_id?: number | null
  product_name: string | null
  spec_name: string | null
  unit_name: string
  conversion: number
  qty: number
  base_qty: number
  unit_price: number
  amount: number
  price_changed: number
  retail_updated: number
}): PurchaseItem {
  return {
    id: row.id,
    purchase_id: row.purchase_id,
    sku_id: row.sku_id,
    product_id: row.product_id ?? null,
    product_name: row.product_name,
    spec_name: row.spec_name,
    unit_name: row.unit_name,
    conversion: row.conversion,
    qty: row.qty,
    base_qty: row.base_qty,
    unit_price: row.unit_price,
    amount: row.amount,
    price_changed: row.price_changed,
    retail_updated: row.retail_updated,
  }
}

export interface ListPurchasesParams {
  q?: string | undefined
  from?: string | undefined
  to?: string | undefined
  page: number
  page_size: number
}

export async function listPurchases(
  db: Kysely<DB>,
  params: ListPurchasesParams,
): Promise<Paginated<Purchase>> {
  const base = () => {
    let query = db.selectFrom('purchases')
    if (params.q) {
      const keyword = `%${params.q}%`
      query = query.where((eb) =>
        eb.or([
          eb('purchases.purchase_no', 'like', keyword),
          eb('purchases.supplier_name', 'like', keyword),
        ]),
      )
    }
    if (params.from) query = query.where('purchases.ordered_at', '>=', params.from)
    if (params.to) query = query.where('purchases.ordered_at', '<=', params.to)
    return query
  }

  const totalRow = await base()
    .select((eb) => eb.fn.count('purchases.id').as('count'))
    .executeTakeFirst()
  const total = Number(totalRow?.count ?? 0)

  const rows = await base()
    .leftJoin('users', 'users.id', 'purchases.operator_id')
    .selectAll('purchases')
    .select('users.nickname as operator_name')
    .orderBy('purchases.ordered_at', 'desc')
    .orderBy('purchases.id', 'desc')
    .limit(params.page_size)
    .offset((params.page - 1) * params.page_size)
    .execute()

  const items: Purchase[] = rows.map((row) => ({
    id: row.id,
    purchase_no: row.purchase_no,
    supplier_name: row.supplier_name,
    kind: row.kind as Purchase['kind'],
    total_amount: row.total_amount,
    note: row.note,
    image_keys: row.image_keys,
    operator_id: row.operator_id,
    operator_name: row.operator_name,
    ordered_at: row.ordered_at,
    created_at: row.created_at,
  }))

  return { items, total, page: params.page, page_size: params.page_size }
}

export async function purgePurchase(
  db: Kysely<DB>,
  d1: D1Database,
  id: number,
  storage: StorageAdapter,
): Promise<void> {
  const purchase = await db
    .selectFrom('purchases')
    .select(['id', 'image_keys'])
    .where('id', '=', id)
    .executeTakeFirst()
  if (!purchase) throw new ApiError(404, 'PURCHASE_NOT_FOUND', '入库单不存在')
  // 因商品抵扣产生的回款记录保留，仅解除与该入库单的关联
  await batchCompiled(d1, [
    db.updateTable('payments').set({ purchase_id: null }).where('purchase_id', '=', id).compile(),
    db.deleteFrom('purchase_items').where('purchase_id', '=', id).compile(),
    db.deleteFrom('purchases').where('id', '=', id).compile(),
  ])
  for (const key of parseStoredImageKeys(purchase.image_keys)) {
    await storage.delete(key).catch(() => undefined)
  }
}
