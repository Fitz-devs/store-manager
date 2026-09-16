import type { Kysely, Selectable } from 'kysely'
import type {
  Barcode,
  LinkedProduct,
  OcrFromRowResult,
  Paginated,
  PriceHistoryEntry,
  Prize,
  Product,
  ProductDetail,
  ProductLink,
  ProductListItem,
  Promotion,
  PurchaseWithItems,
  SkuWithBarcodes,
  StockStatus,
} from '@sm/shared'
import type { DB } from '../db/schema'
import { batchCompiled } from '../db/batch'
import { nowIso } from '../lib/ids'
import { ApiError } from '../lib/errors'

type ProductRow = Selectable<DB['products']>
type SkuRow = Selectable<DB['skus']>
type BarcodeRow = Selectable<DB['barcodes']>

export interface ListProductsParams {
  q?: string | undefined
  category?: string | undefined
  stock: 'all' | 'in_stock' | 'out_of_stock'
  page: number
  page_size: number
}

export interface ProductCreateData {
  name: string
  aliases?: string[] | undefined
  category?: string | null | undefined
  category_ids?: number[] | undefined
  brand?: string | null | undefined
  notes?: string | null | undefined
  image_key?: string | null | undefined
  purchase_price?: number | null | undefined
  sku: {
    spec_name?: string | null | undefined
    sale_unit: string
    retail_price: number
    friend_price?: number | null | undefined
  }
  barcodes: Array<{
    code: string
    is_primary: boolean
  }>
  promotions?: Array<{
    content: string
    starts_at?: string | null | undefined
    ends_at?: string | null | undefined
  }>
  prizes?: Array<{
    description?: string | null | undefined
    extra_price: number
  }>
}

const toBarcode = (row: BarcodeRow): Barcode => ({
  id: row.id,
  code: row.code,
  sku_id: row.sku_id,
  product_id: row.product_id,
  is_primary: row.is_primary,
  created_at: row.created_at,
})

const toSku = (
  row: SkuRow,
  barcodes: Barcode[],
  promotions: Promotion[] = [],
  prizes: Prize[] = [],
): SkuWithBarcodes => ({
  id: row.id,
  product_id: row.product_id,
  spec_name: row.spec_name,
  sale_unit: row.sale_unit,
  retail_price: row.retail_price,
  friend_price: row.friend_price,
  latest_purchase_price: row.latest_purchase_price,
  stock_status: row.stock_status as SkuWithBarcodes['stock_status'],
  out_of_stock_at: row.out_of_stock_at,
  status: row.status,
  created_at: row.created_at,
  updated_at: row.updated_at,
  barcodes: barcodes.filter((barcode) => barcode.sku_id === row.id),
  promotions: promotions.filter((promotion) => promotion.sku_id === row.id),
  prizes: prizes.filter((prize) => prize.sku_id === row.id),
})

const parseAliases = (value: string | null): string[] => {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

const toProduct = (row: ProductRow, categoryIds: number[] = []): Product => ({
  id: row.id,
  name: row.name,
  aliases: parseAliases(row.aliases),
  category: row.category,
  category_ids: categoryIds,
  brand: row.brand,
  notes: row.notes,
  image_key: row.image_key,
  status: row.status,
  created_at: row.created_at,
  updated_at: row.updated_at,
})

async function loadCategoryIds(db: Kysely<DB>, productIds: number[]): Promise<Map<number, number[]>> {
  const map = new Map<number, number[]>()
  if (!productIds.length) return map
  const rows = await db
    .selectFrom('product_categories')
    .select(['product_id', 'category_id'])
    .where('product_id', 'in', productIds)
    .execute()
  for (const row of rows) {
    const list = map.get(row.product_id) ?? []
    list.push(row.category_id)
    map.set(row.product_id, list)
  }
  return map
}

export async function syncProductCategories(
  db: Kysely<DB>,
  productId: number,
  categoryIds: number[] | null | undefined,
): Promise<string | null> {
  if (categoryIds === undefined) return undefined as unknown as string | null
  const ids = [...new Set(categoryIds ?? [])]
  await db.deleteFrom('product_categories').where('product_id', '=', productId).execute()
  if (!ids.length) {
    await db.updateTable('products').set({ category: null, updated_at: nowIso() }).where('id', '=', productId).execute()
    return null
  }
  const names = (
    await db.selectFrom('categories').select(['id', 'name']).where('id', 'in', ids).execute()
  ).sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id))
  for (const name of names) {
    await db
      .insertInto('product_categories')
      .values({ product_id: productId, category_id: name.id })
      .execute()
  }
  const label = names.map((item) => item.name).join(' / ')
  await db.updateTable('products').set({ category: label, updated_at: nowIso() }).where('id', '=', productId).execute()
  return label
}

export async function listProducts(
  db: Kysely<DB>,
  params: ListProductsParams,
): Promise<Paginated<ProductListItem>> {
  const base = () => {
    let query = db.selectFrom('products').where('products.status', '=', 'active')
    if (params.q) {
      const keyword = `%${params.q}%`
      query = query.where((eb) =>
        eb.or([
          eb('products.name', 'like', keyword),
          eb('products.aliases', 'like', keyword),
          eb('products.brand', 'like', keyword),
          eb('products.category', 'like', keyword),
          eb.exists(
            eb
              .selectFrom('barcodes')
              .select('barcodes.id')
              .whereRef('barcodes.product_id', '=', 'products.id')
              .where('barcodes.code', '=', params.q!),
          ),
        ]),
      )
    }
    if (params.category) {
      query = query.where((eb) =>
        eb.or([
          eb('products.category', 'like', `%${params.category}%`),
          eb.exists(
            eb
              .selectFrom('product_categories')
              .innerJoin('categories', 'categories.id', 'product_categories.category_id')
              .select('product_categories.product_id')
              .whereRef('product_categories.product_id', '=', 'products.id')
              .where('categories.name', '=', params.category!),
          ),
        ]),
      )
    }
    if (params.stock === 'out_of_stock') {
      query = query.where((eb) =>
        eb.exists(
          eb
            .selectFrom('skus')
            .select('skus.id')
            .whereRef('skus.product_id', '=', 'products.id')
            .where('skus.status', '=', 'active')
            .where('skus.stock_status', '=', 'out_of_stock'),
        ),
      )
    }
    if (params.stock === 'in_stock') {
      query = query.where((eb) =>
        eb.not(
          eb.exists(
            eb
              .selectFrom('skus')
              .select('skus.id')
              .whereRef('skus.product_id', '=', 'products.id')
              .where('skus.status', '=', 'active')
              .where('skus.stock_status', '=', 'out_of_stock'),
          ),
        ),
      )
    }
    return query
  }

  const totalRow = await base()
    .select((eb) => eb.fn.count('products.id').as('count'))
    .executeTakeFirst()
  const total = Number(totalRow?.count ?? 0)

  const rows = await base()
    .selectAll()
    .orderBy('products.updated_at', 'desc')
    .orderBy('products.id', 'desc')
    .limit(params.page_size)
    .offset((params.page - 1) * params.page_size)
    .execute()

  if (!rows.length) return { items: [], total, page: params.page, page_size: params.page_size }

  const ids = rows.map((row) => row.id)
  const skus = await db
    .selectFrom('skus')
    .selectAll()
    .where('product_id', 'in', ids)
    .where('status', '=', 'active')
    .execute()
  const barcodes = await db.selectFrom('barcodes').selectAll().where('product_id', 'in', ids).execute()

  const categoryMap = await loadCategoryIds(db, ids)

  const items: ProductListItem[] = rows.map((row) => {
    const ownSkus = skus.filter((sku) => sku.product_id === row.id)
    const ownBarcodes = barcodes.filter((barcode) => barcode.product_id === row.id)
    const prices = ownSkus.map((sku) => sku.retail_price)
    const primary =
      ownBarcodes.find((barcode) => barcode.is_primary === 1) ?? ownBarcodes[0] ?? null
    return {
      ...toProduct(row, categoryMap.get(row.id) ?? []),
      sku_count: ownSkus.length,
      out_of_stock: ownSkus.some((sku) => sku.stock_status === 'out_of_stock'),
      min_retail_price: prices.length ? Math.min(...prices) : 0,
      max_retail_price: prices.length ? Math.max(...prices) : 0,
      primary_barcode: primary?.code ?? null,
    }
  })

  return { items, total, page: params.page, page_size: params.page_size }
}

export async function getProductDetail(db: Kysely<DB>, id: number): Promise<ProductDetail | null> {
  const productRow = await db
    .selectFrom('products')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst()
  if (!productRow) return null

  const skuRows = await db
    .selectFrom('skus')
    .selectAll()
    .where('product_id', '=', id)
    .where('status', '=', 'active')
    .orderBy('id', 'asc')
    .execute()
  const skuIds = skuRows.map((row) => row.id)
  const barcodeRows = skuIds.length
    ? await db.selectFrom('barcodes').selectAll().where('sku_id', 'in', skuIds).execute()
    : []
  const promotionRows = skuIds.length
    ? await db
        .selectFrom('promotions')
        .selectAll()
        .where('sku_id', 'in', skuIds)
        .orderBy('id', 'asc')
        .execute()
    : []
  const prizeRows = skuIds.length
    ? await db
        .selectFrom('prizes')
        .selectAll()
        .where('sku_id', 'in', skuIds)
        .orderBy('id', 'asc')
        .execute()
    : []
  const skus = skuRows.map((row) =>
    toSku(row, barcodeRows.map(toBarcode), promotionRows, prizeRows),
  )
  const linkedProducts = await getLinkedProducts(db, id)

  const historyRows = skuIds.length
    ? await db
        .selectFrom('price_history')
        .leftJoin('users', 'users.id', 'price_history.operator_id')
        .select([
          'price_history.id',
          'price_history.sku_id',
          'price_history.price_type',
          'price_history.old_value',
          'price_history.new_value',
          'price_history.source',
          'price_history.reason',
          'price_history.operator_id',
          'price_history.created_at',
          'users.nickname as operator_name',
        ])
        .where('price_history.sku_id', 'in', skuIds)
        .orderBy('price_history.created_at', 'desc')
        .limit(200)
        .execute()
    : []

  const itemRows = skuIds.length
    ? await db
        .selectFrom('purchase_items')
        .innerJoin('purchases', 'purchases.id', 'purchase_items.purchase_id')
        .selectAll('purchase_items')
        .select([
          'purchases.id as p_id',
          'purchases.purchase_no',
          'purchases.supplier_name',
          'purchases.kind',
          'purchases.total_amount',
          'purchases.note as p_note',
          'purchases.image_keys',
          'purchases.ocr_raw',
          'purchases.operator_id as p_operator_id',
          'purchases.ordered_at',
          'purchases.created_at as p_created_at',
        ])
        .where('purchase_items.sku_id', 'in', skuIds)
        .orderBy('purchases.ordered_at', 'desc')
        .orderBy('purchases.id', 'desc')
        .limit(200)
        .execute()
    : []

  const purchaseMap = new Map<number, PurchaseWithItems>()
  for (const row of itemRows) {
    let purchase = purchaseMap.get(row.p_id)
    if (!purchase) {
      purchase = {
        id: row.p_id,
        purchase_no: row.purchase_no,
        supplier_name: row.supplier_name,
        kind: row.kind as PurchaseWithItems['kind'],
        total_amount: row.total_amount,
        note: row.p_note,
        image_keys: row.image_keys,
        ocr_raw: row.ocr_raw,
        operator_id: row.p_operator_id,
        ordered_at: row.ordered_at,
        created_at: row.p_created_at,
        items: [],
      }
      purchaseMap.set(row.p_id, purchase)
    }
    purchase.items.push({
      id: row.id,
      purchase_id: row.purchase_id,
      sku_id: row.sku_id,
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
    })
  }

  const priceHistory: PriceHistoryEntry[] = historyRows.map((row) => ({
    id: row.id,
    sku_id: row.sku_id,
    price_type: row.price_type as PriceHistoryEntry['price_type'],
    old_value: row.old_value,
    new_value: row.new_value,
    source: row.source,
    reason: row.reason,
    operator_id: row.operator_id,
    created_at: row.created_at,
    operator_name: row.operator_name,
  }))

  const productCategoryIds = (await loadCategoryIds(db, [id])).get(id) ?? []

  return {
    product: toProduct(productRow, productCategoryIds),
    skus,
    linked_products: linkedProducts,
    price_history: priceHistory,
    purchases: [...purchaseMap.values()].slice(0, 20),
  }
}

export async function getLinkedProducts(db: Kysely<DB>, productId: number): Promise<LinkedProduct[]> {
  const linkRows = await db
    .selectFrom('product_links')
    .selectAll()
    .where('product_id', '=', productId)
    .orderBy('id', 'asc')
    .execute()
  if (!linkRows.length) return []
  const linkedIds = [...new Set(linkRows.map((row) => row.linked_product_id))]
  const products = await db
    .selectFrom('products')
    .selectAll()
    .where('id', 'in', linkedIds)
    .where('status', '=', 'active')
    .execute()
  const productMap = new Map(products.map((row) => [row.id, row]))
  const skuSummary = await db
    .selectFrom('skus')
    .select(['product_id', 'retail_price', 'stock_status'])
    .where('product_id', 'in', linkedIds)
    .where('status', '=', 'active')
    .execute()
  const summaryByProduct = new Map<number, { prices: number[]; out: boolean }>()
  for (const row of skuSummary) {
    const entry = summaryByProduct.get(row.product_id) ?? { prices: [], out: false }
    entry.prices.push(row.retail_price)
    if (row.stock_status === 'out_of_stock') entry.out = true
    summaryByProduct.set(row.product_id, entry)
  }
  return linkRows
    .map((link) => {
      const target = productMap.get(link.linked_product_id)
      if (!target) return null
      const summary = summaryByProduct.get(link.linked_product_id)
      return {
        link_id: link.id,
        id: target.id,
        name: target.name,
        relation: link.relation,
        min_retail_price: summary?.prices.length ? Math.min(...summary.prices) : 0,
        max_retail_price: summary?.prices.length ? Math.max(...summary.prices) : 0,
        out_of_stock: summary?.out ?? false,
      }
    })
    .filter((item): item is LinkedProduct => item !== null)
}

export async function addProductLink(
  db: Kysely<DB>,
  productId: number,
  input: { linked_product_id: number; relation?: string; note?: string | null },
): Promise<ProductLink> {
  if (input.linked_product_id === productId) {
    throw new ApiError(400, 'VALIDATION', '不能关联自己')
  }
  const target = await db
    .selectFrom('products')
    .select('id')
    .where('id', '=', input.linked_product_id)
    .executeTakeFirst()
  if (!target) throw new ApiError(404, 'PRODUCT_NOT_FOUND', '关联的商品不存在')
  const row = await db
    .insertInto('product_links')
    .values({
      product_id: productId,
      linked_product_id: input.linked_product_id,
      relation: input.relation ?? 'box_piece',
      note: input.note ?? null,
      created_at: nowIso(),
    })
    .returningAll()
    .executeTakeFirst()
    .catch(() => {
      throw new ApiError(400, 'LINK_EXISTS', '已经关联过了')
    })
  if (!row) throw new ApiError(500, 'CREATE_FAILED', '关联失败')
  return row
}

export async function deleteProductLink(db: Kysely<DB>, linkId: number): Promise<void> {
  await db.deleteFrom('product_links').where('id', '=', linkId).execute()
}

export interface OcrFromRowInput {
  name: string
  box_code?: string | null | undefined
  unit_code?: string | null | undefined
  conversion: number
  unit_price_fen?: number | null | undefined
  spec_hint?: string | null | undefined
  sale_unit: string
}

export async function createProductsFromOcrRow(
  db: Kysely<DB>,
  d1: D1Database,
  input: OcrFromRowInput,
  operatorId: number,
): Promise<OcrFromRowResult> {
  const boxCode = input.box_code?.trim() || null
  const unitCode = input.unit_code?.trim() || null
  if (!boxCode && !unitCode) {
    throw new ApiError(400, 'VALIDATION', '至少需要整箱码或单件码')
  }

  async function findByCode(code: string): Promise<number | null> {
    const row = await db.selectFrom('barcodes').select('sku_id').where('code', '=', code).executeTakeFirst()
    return row?.sku_id ?? null
  }

  if (boxCode) {
    const existing = await findByCode(boxCode)
    if (existing) throw new ApiError(409, 'BARCODE_EXISTS', `整箱码已存在（sku ${existing}），请改用匹配商品`)
  }
  if (unitCode) {
    const existing = await findByCode(unitCode)
    if (existing) throw new ApiError(409, 'BARCODE_EXISTS', `单件码已存在（sku ${existing}），请改用匹配商品`)
  }

  const price = input.unit_price_fen ?? null
  const baseName = input.name.trim()
  const boxDetail = await createProduct(
    db,
    d1,
    {
      name: baseName,
      sku: {
        spec_name: input.spec_hint?.trim() || '整箱',
        sale_unit: input.sale_unit.trim() || '箱',
        retail_price: 0,
        friend_price: null,
      },
      purchase_price: price,
      barcodes: boxCode ? [{ code: boxCode, is_primary: true }] : [],
    },
    operatorId,
  )
  const boxSku = boxDetail.skus[0]
  if (!boxSku) throw new ApiError(500, 'CREATE_FAILED', '箱装规格创建失败')

  let unitSide: { product_id: number; sku_id: number; name: string; sale_unit: string; barcode: string | null } | null = null
  let linkId: number | null = null
  if (unitCode) {
    let unitDetail: ProductDetail
    try {
      unitDetail = await createProduct(
        db,
        d1,
        {
          name: baseName,
          sku: {
            spec_name: '单件',
            sale_unit: '件',
            retail_price: 0,
            friend_price: null,
          },
          purchase_price: price === null ? null : Math.round(price / Math.max(1, input.conversion)),
          barcodes: [{ code: unitCode, is_primary: true }],
        },
        operatorId,
      )
    } catch (error) {
      // 回滚已建箱装，避免半截数据
      await db
        .updateTable('products')
        .set({ status: 'archived', updated_at: nowIso() })
        .where('id', '=', boxDetail.product.id)
        .execute()
        .catch(() => undefined)
      if (boxCode) {
        await db.deleteFrom('barcodes').where('code', '=', boxCode).execute().catch(() => undefined)
      }
      throw error
    }
    const unitSku = unitDetail.skus[0]
    if (!unitSku) throw new ApiError(500, 'CREATE_FAILED', '单件规格创建失败')
    unitSide = {
      product_id: unitDetail.product.id,
      sku_id: unitSku.id,
      name: unitDetail.product.name,
      sale_unit: unitSku.sale_unit,
      barcode: unitCode,
    }
    const link = await addProductLink(db, boxDetail.product.id, {
      linked_product_id: unitDetail.product.id,
      relation: 'box_piece',
      note: 'OCR 入库自动关联',
    })
    linkId = link.id
    await addProductLink(db, unitDetail.product.id, {
      linked_product_id: boxDetail.product.id,
      relation: 'box_piece',
      note: 'OCR 入库自动关联',
    }).catch(() => {
      // reverse link optional
    })
  }

  return {
    box: {
      product_id: boxDetail.product.id,
      sku_id: boxSku.id,
      name: boxDetail.product.name,
      sale_unit: boxSku.sale_unit,
      barcode: boxCode,
    },
    unit: unitSide,
    link_id: linkId,
  }
}

export async function createPromotion(
  db: Kysely<DB>,
  skuId: number,
  input: { content: string; starts_at?: string | null; ends_at?: string | null },
): Promise<Promotion> {
  const sku = await db.selectFrom('skus').select('id').where('id', '=', skuId).executeTakeFirst()
  if (!sku) throw new ApiError(404, 'SKU_NOT_FOUND', '规格不存在')
  return db
    .insertInto('promotions')
    .values({
      sku_id: skuId,
      content: input.content,
      starts_at: input.starts_at ?? null,
      ends_at: input.ends_at ?? null,
      created_at: nowIso(),
    })
    .returningAll()
    .executeTakeFirstOrThrow()
}

export async function deletePromotion(db: Kysely<DB>, id: number): Promise<void> {
  await db.deleteFrom('promotions').where('id', '=', id).execute()
}

export async function updatePromotion(
  db: Kysely<DB>,
  id: number,
  input: { content?: string; starts_at?: string | null; ends_at?: string | null },
): Promise<Promotion> {
  const values: Record<string, unknown> = {}
  if (input.content !== undefined) values.content = input.content
  if (input.starts_at !== undefined) values.starts_at = input.starts_at
  if (input.ends_at !== undefined) values.ends_at = input.ends_at
  const row = await db
    .updateTable('promotions')
    .set(values)
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirst()
  if (!row) throw new ApiError(404, 'NOT_FOUND', '优惠不存在')
  return row
}

export async function createPrize(
  db: Kysely<DB>,
  skuId: number,
  input: { description?: string | null; extra_price: number },
): Promise<Prize> {
  const sku = await db.selectFrom('skus').select('id').where('id', '=', skuId).executeTakeFirst()
  if (!sku) throw new ApiError(404, 'SKU_NOT_FOUND', '规格不存在')
  if (input.extra_price < 0) throw new ApiError(400, 'VALIDATION', '换购价不能为负数')
  return db
    .insertInto('prizes')
    .values({
      sku_id: skuId,
      description: input.description ?? null,
      extra_price: input.extra_price,
      created_at: nowIso(),
    })
    .returningAll()
    .executeTakeFirstOrThrow()
}

export async function deletePrize(db: Kysely<DB>, id: number): Promise<void> {
  await db.deleteFrom('prizes').where('id', '=', id).execute()
}

export async function updatePrize(
  db: Kysely<DB>,
  id: number,
  input: { description?: string | null; extra_price?: number },
): Promise<Prize> {
  if (input.extra_price !== undefined && input.extra_price < 0) {
    throw new ApiError(400, 'VALIDATION', '换购价不能为负数')
  }
  const values: Record<string, unknown> = {}
  if (input.description !== undefined) values.description = input.description
  if (input.extra_price !== undefined) values.extra_price = input.extra_price
  const row = await db
    .updateTable('prizes')
    .set(values)
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirst()
  if (!row) throw new ApiError(404, 'NOT_FOUND', '奖品不存在')
  return row
}

export async function archiveSku(db: Kysely<DB>, skuId: number): Promise<void> {
  const activeCount = await db
    .selectFrom('skus')
    .select((eb) => eb.fn.count('skus.id').as('count'))
    .innerJoin('skus as self', (join) => join.onRef('self.product_id', '=', 'skus.product_id'))
    .where('self.id', '=', skuId)
    .where('skus.status', '=', 'active')
    .executeTakeFirst()
  if (Number(activeCount?.count ?? 0) <= 1) {
    throw new ApiError(400, 'VALIDATION', '至少保留一个规格')
  }
  await db.updateTable('skus').set({ status: 'archived', updated_at: nowIso() }).where('id', '=', skuId).execute()
}

export async function createProduct(
  db: Kysely<DB>,
  d1: D1Database,
  input: ProductCreateData,
  operatorId: number,
): Promise<ProductDetail> {
  const now = nowIso()
  const product = await db
    .insertInto('products')
    .values({
      name: input.name,
      aliases: input.aliases?.length ? JSON.stringify(input.aliases) : null,
      category: input.category ?? null,
      brand: input.brand ?? null,
      notes: input.notes ?? null,
      image_key: input.image_key ?? null,
      status: 'active',
      created_at: now,
      updated_at: now,
    })
    .returningAll()
    .executeTakeFirstOrThrow()

  try {
    if (input.category_ids?.length) {
      await syncProductCategories(db, product.id, input.category_ids)
    }
    const sku = await db
      .insertInto('skus')
      .values({
        product_id: product.id,
        spec_name: input.sku.spec_name ?? null,
        sale_unit: input.sku.sale_unit,
        retail_price: input.sku.retail_price,
        friend_price: input.sku.friend_price ?? null,
        latest_purchase_price: input.purchase_price ?? null,
        stock_status: 'in_stock',
        status: 'active',
        created_at: now,
        updated_at: now,
      })
      .returningAll()
      .executeTakeFirstOrThrow()

    const statements = input.barcodes.map((barcode, index) =>
      db
        .insertInto('barcodes')
        .values({
          code: barcode.code,
          sku_id: sku.id,
          product_id: product.id,
          is_primary: barcode.is_primary || index === 0 ? 1 : 0,
          created_at: now,
        })
        .compile(),
    )

    const historyEntries: Array<{ type: string; value: number | null | undefined; source: string; reason: string }> = [
      { type: 'retail', value: input.sku.retail_price, source: 'init', reason: '首次录入' },
      { type: 'friend', value: input.sku.friend_price, source: 'init', reason: '首次录入' },
      { type: 'purchase', value: input.purchase_price, source: 'init', reason: '首次录入' },
    ]
    for (const entry of historyEntries) {
      if (entry.value === null || entry.value === undefined || entry.value <= 0) continue
      statements.push(
        db
          .insertInto('price_history')
          .values({
            sku_id: sku.id,
            price_type: entry.type,
            old_value: null,
            new_value: entry.value,
            source: entry.source,
            reason: entry.reason,
            operator_id: operatorId,
            created_at: now,
          })
          .compile(),
      )
    }

    for (const promotion of input.promotions ?? []) {
      statements.push(
        db
          .insertInto('promotions')
          .values({
            sku_id: sku.id,
            content: promotion.content,
            starts_at: promotion.starts_at ?? null,
            ends_at: promotion.ends_at ?? null,
            created_at: now,
          })
          .compile(),
      )
    }
    for (const prize of input.prizes ?? []) {
      statements.push(
        db
          .insertInto('prizes')
          .values({
            sku_id: sku.id,
            description: prize.description ?? null,
            extra_price: prize.extra_price,
            created_at: now,
          })
          .compile(),
      )
    }

    await batchCompiled(d1, statements)
  } catch (error) {
    await db.deleteFrom('products').where('id', '=', product.id).execute()
    throw error
  }

  const detail = await getProductDetail(db, product.id)
  if (!detail) throw new ApiError(500, 'CREATE_FAILED', '商品创建失败')
  return detail
}

export interface ProductPatch {
  name?: string | undefined
  aliases?: string[] | undefined
  category?: string | null | undefined
  category_ids?: number[] | undefined
  brand?: string | null | undefined
  notes?: string | null | undefined
  image_key?: string | null | undefined
  status?: string | undefined
}

export async function updateProduct(
  db: Kysely<DB>,
  id: number,
  patch: ProductPatch,
): Promise<Product | null> {
  const values: Record<string, unknown> = { updated_at: nowIso() }
  if (patch.name !== undefined) values.name = patch.name
  if (patch.aliases !== undefined) {
    values.aliases = patch.aliases.length ? JSON.stringify(patch.aliases) : null
  }
  if (patch.category !== undefined && patch.category_ids === undefined) values.category = patch.category
  if (patch.brand !== undefined) values.brand = patch.brand
  if (patch.notes !== undefined) values.notes = patch.notes
  if (patch.image_key !== undefined) values.image_key = patch.image_key
  if (patch.status !== undefined) values.status = patch.status
  await db
    .updateTable('products')
    .set(values as never)
    .where('id', '=', id)
    .execute()
  if (patch.category_ids !== undefined) {
    await syncProductCategories(db, id, patch.category_ids)
  }
  const row = await db.selectFrom('products').selectAll().where('id', '=', id).executeTakeFirst()
  if (!row) return null
  const ids = (await loadCategoryIds(db, [id])).get(id) ?? []
  return toProduct(row, ids)
}

export async function addBarcode(
  db: Kysely<DB>,
  input: {
    sku_id: number
    code: string
    is_primary: boolean
  },
): Promise<Barcode> {
  const sku = await db.selectFrom('skus').selectAll().where('id', '=', input.sku_id).executeTakeFirst()
  if (!sku) throw new ApiError(404, 'SKU_NOT_FOUND', '规格不存在')
  const now = nowIso()
  const row = await db
    .insertInto('barcodes')
    .values({
      code: input.code,
      sku_id: input.sku_id,
      product_id: sku.product_id,
      is_primary: input.is_primary ? 1 : 0,
      created_at: now,
    })
    .returningAll()
    .executeTakeFirstOrThrow()
  return toBarcode(row)
}

export async function updateBarcode(
  db: Kysely<DB>,
  id: number,
  patch: Partial<{
    code: string
    is_primary: boolean
  }>,
): Promise<Barcode | null> {
  const values: Record<string, unknown> = {}
  if (patch.code !== undefined) values.code = patch.code
  if (patch.is_primary !== undefined) values.is_primary = patch.is_primary ? 1 : 0
  if (Object.keys(values).length) {
    await db.updateTable('barcodes').set(values as never).where('id', '=', id).execute()
  }
  const row = await db.selectFrom('barcodes').selectAll().where('id', '=', id).executeTakeFirst()
  return row ? toBarcode(row) : null
}

export async function deleteBarcode(db: Kysely<DB>, id: number): Promise<void> {
  await db.deleteFrom('barcodes').where('id', '=', id).execute()
}

export async function setStockStatus(
  db: Kysely<DB>,
  skuId: number,
  status: StockStatus,
): Promise<SkuWithBarcodes | null> {
  const now = nowIso()
  await db
    .updateTable('skus')
    .set({ stock_status: status, out_of_stock_at: status === 'out_of_stock' ? now : null, updated_at: now })
    .where('id', '=', skuId)
    .execute()
  const row = await db.selectFrom('skus').selectAll().where('id', '=', skuId).executeTakeFirst()
  if (!row) return null
  const barcodes = await db.selectFrom('barcodes').selectAll().where('sku_id', '=', skuId).execute()
  return toSku(row, barcodes.map(toBarcode))
}

export interface SkuPatch {
  spec_name?: string | null | undefined
  sale_unit?: string | undefined
  retail_price?: number | undefined
  friend_price?: number | null | undefined
  latest_purchase_price?: number | null | undefined
  reason?: string | null | undefined
}

export async function updateSku(
  db: Kysely<DB>,
  d1: D1Database,
  skuId: number,
  patch: SkuPatch,
  operatorId: number,
): Promise<SkuWithBarcodes> {
  const sku = await db.selectFrom('skus').selectAll().where('id', '=', skuId).executeTakeFirst()
  if (!sku) throw new ApiError(404, 'SKU_NOT_FOUND', '规格不存在')

  const now = nowIso()
  const values: Record<string, unknown> = { updated_at: now }
  const history: Array<{ type: string; oldValue: number | null; newValue: number }> = []

  const priceFields: Array<{
    key: 'retail_price' | 'friend_price' | 'latest_purchase_price'
    type: string
  }> = [
    { key: 'retail_price', type: 'retail' },
    { key: 'friend_price', type: 'friend' },
    { key: 'latest_purchase_price', type: 'purchase' },
  ]
  for (const field of priceFields) {
    const next = patch[field.key]
    if (next === undefined) continue
    if (next !== null && next < 0) throw new ApiError(400, 'VALIDATION', '价格不能为负数')
    values[field.key] = next
    const oldValue = sku[field.key] ?? null
    if (oldValue !== next) {
      history.push({ type: field.type, oldValue, newValue: next ?? 0 })
    }
  }
  if (patch.spec_name !== undefined) values.spec_name = patch.spec_name
  if (patch.sale_unit !== undefined) values.sale_unit = patch.sale_unit

  const statements = [
    db.updateTable('skus').set(values as never).where('id', '=', skuId).compile(),
  ]
  for (const entry of history) {
    statements.push(
      db
        .insertInto('price_history')
        .values({
          sku_id: skuId,
          price_type: entry.type,
          old_value: entry.oldValue,
          new_value: entry.newValue,
          source: 'manual',
          reason: patch.reason ?? null,
          operator_id: operatorId,
          created_at: now,
        })
        .compile(),
    )
  }
  await batchCompiled(d1, statements)

  const updated = await db.selectFrom('skus').selectAll().where('id', '=', skuId).executeTakeFirstOrThrow()
  const barcodes = await db.selectFrom('barcodes').selectAll().where('sku_id', '=', skuId).execute()
  return toSku(updated, barcodes.map(toBarcode))
}

export async function addSku(
  db: Kysely<DB>,
  d1: D1Database,
  productId: number,
  input: {
    spec_name?: string | null | undefined
    sale_unit: string
    retail_price: number
    friend_price?: number | null | undefined
    latest_purchase_price?: number | null | undefined
  },
  operatorId: number,
): Promise<SkuWithBarcodes> {
  const product = await db
    .selectFrom('products')
    .selectAll()
    .where('id', '=', productId)
    .executeTakeFirst()
  if (!product) throw new ApiError(404, 'PRODUCT_NOT_FOUND', '商品不存在')
  const now = nowIso()
  const sku = await db
    .insertInto('skus')
    .values({
      product_id: productId,
      spec_name: input.spec_name ?? null,
      sale_unit: input.sale_unit,
      retail_price: input.retail_price,
      friend_price: input.friend_price ?? null,
      latest_purchase_price: input.latest_purchase_price ?? null,
      stock_status: 'in_stock',
      status: 'active',
      created_at: now,
      updated_at: now,
    })
    .returningAll()
    .executeTakeFirstOrThrow()
  await batchCompiled(d1, [
    db
      .insertInto('price_history')
      .values({
        sku_id: sku.id,
        price_type: 'retail',
        old_value: null,
        new_value: input.retail_price,
        source: 'init',
        reason: '新增规格',
        operator_id: operatorId,
        created_at: now,
      })
      .compile(),
  ])
  return toSku(sku, [])
}
