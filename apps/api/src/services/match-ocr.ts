import type { Kysely, Selectable } from 'kysely'
import type { MatchOcrRowResult, MatchOcrSkuHit } from '@sm/shared'
import { ApiError } from '../lib/errors'
import type { DB } from '../db/schema'

type BarcodeRow = Selectable<DB['barcodes']>
type SkuRow = Selectable<DB['skus']>
type ProductRow = Selectable<DB['products']>

export type MatchOcrBarcodeHit = Pick<BarcodeRow, 'code' | 'sku_id' | 'product_id' | 'is_primary'>

export interface MatchOcrInputRow {
  box_code?: string | null | undefined
  unit_code?: string | null | undefined
}

const emptyResult = (): MatchOcrRowResult => ({
  status: 'missing',
  match_source: 'none',
  hit: null,
  candidates: [],
})

const toHit = (
  sku: SkuRow,
  product: ProductRow,
  matchedCode: string | null,
): MatchOcrSkuHit => ({
  sku_id: sku.id,
  product_id: sku.product_id,
  product_name: product.name,
  sale_unit: sku.sale_unit,
  spec_name: sku.spec_name,
  retail_price: sku.retail_price,
  friend_price: sku.friend_price,
  latest_purchase_price: sku.latest_purchase_price,
  matched_code: matchedCode,
  product_status: product.status,
  sku_status: sku.status,
})

/** 纯解析：条码命中 → 轻量 sku/product 组装；不读品名、不扫库 */
export function resolveOcrMatchRows(
  inputs: MatchOcrInputRow[],
  barcodeRows: MatchOcrBarcodeHit[],
  skuRows: SkuRow[],
  productRows: ProductRow[],
): MatchOcrRowResult[] {
  const byCode = new Map<string, MatchOcrBarcodeHit[]>()
  for (const row of barcodeRows) {
    const list = byCode.get(row.code) ?? []
    list.push(row)
    byCode.set(row.code, list)
  }
  const skuById = new Map(skuRows.map((row) => [row.id, row]))
  const productById = new Map(productRows.map((row) => [row.id, row]))

  return inputs.map((input) => {
    const box = input.box_code?.trim() || null
    const unit = input.unit_code?.trim() || null
    for (const [source, code] of [
      ['box_code', box],
      ['unit_code', unit],
    ] as const) {
      if (!code) continue
      const matches = byCode.get(code)
      if (!matches?.length) continue

      const ordered = [...matches].sort((a, b) => {
        if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1
        return a.sku_id - b.sku_id
      })
      const resolved: Array<{ sku: SkuRow; product: ProductRow }> = []
      for (const match of ordered) {
        const sku = skuById.get(match.sku_id)
        const product = productById.get(match.product_id) ?? (sku ? productById.get(sku.product_id) : undefined)
        if (!sku || !product) continue
        resolved.push({ sku, product })
      }
      if (!resolved.length) continue
      const preferred = resolved.filter((item) => item.sku.status === 'active')
      const list = preferred.length ? preferred : resolved
      const hits = list.map((item) => toHit(item.sku, item.product, code))
      return {
        status: 'matched',
        match_source: source,
        hit: hits[0]!,
        candidates: hits,
      }
    }
    return emptyResult()
  })
}

/** 仅商品码批量匹配：code IN + sku/product 轻量回填；无名称 LIKE */
export async function matchOcrRows(
  db: Kysely<DB>,
  inputs: MatchOcrInputRow[],
): Promise<MatchOcrRowResult[]> {
  if (!inputs.length) throw new ApiError(400, 'VALIDATION', '至少一行明细')
  if (inputs.length > 100) throw new ApiError(400, 'VALIDATION', '一次最多匹配 100 行')

  const codes = [
    ...new Set(
      inputs
        .flatMap((row) => [row.box_code?.trim(), row.unit_code?.trim()])
        .filter((code): code is string => Boolean(code)),
    ),
  ]
  if (!codes.length) return inputs.map(() => emptyResult())

  const barcodeRows = await db
    .selectFrom('barcodes')
    .select(['code', 'sku_id', 'product_id', 'is_primary'])
    .where('code', 'in', codes)
    .execute()

  const skuIds = [...new Set(barcodeRows.map((row) => row.sku_id))]
  const skuRows = skuIds.length
    ? await db
        .selectFrom('skus')
        .selectAll()
        .where('id', 'in', skuIds)
        .execute()
    : []

  const productIds = [
    ...new Set([
      ...barcodeRows.map((row) => row.product_id),
      ...skuRows.map((row) => row.product_id),
    ]),
  ]
  const productRows = productIds.length
    ? await db
        .selectFrom('products')
        .selectAll()
        .where('id', 'in', productIds)
        .execute()
    : []

  return resolveOcrMatchRows(inputs, barcodeRows, skuRows, productRows)
}
