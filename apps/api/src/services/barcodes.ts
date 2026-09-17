import type { Kysely } from 'kysely'
import type { BarcodeLookupResult } from '@sm/shared'
import type { DB } from '../db/schema'
import { getProductDetail } from './products'

/** 仅查店内条码库 */
export async function lookupBarcode(
  db: Kysely<DB>,
  code: string,
): Promise<BarcodeLookupResult> {
  const matches = await db
    .selectFrom('barcodes')
    .selectAll()
    .where('code', '=', code)
    .execute()
  if (matches.length) {
    const productId = matches[0]!.product_id
    const detail = await getProductDetail(db, productId)
    if (detail) {
      return {
        source: 'local',
        product: detail,
        matched_sku_ids: [...new Set(matches.map((match) => match.sku_id))],
      }
    }
  }

  return { source: 'none' }
}
