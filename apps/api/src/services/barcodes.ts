import type { Kysely } from 'kysely'
import type { BarcodeCacheEntry, BarcodeLookupResult } from '@sm/shared'
import type { DB } from '../db/schema'
import { getProductDetail } from './products'
import { fetchTaobaoBarcode } from './taobao'
import { nowIso } from '../lib/ids'

interface EnrichResult {
  entry: BarcodeCacheEntry
  source:
    | 'taobao'
    | 'openfoodfacts'
    | 'openproductsfacts'
    | 'upcitemdb'
    | 'alimarket'
    | 'apizero'
    | 'barcodespider'
}

export interface EnrichOptions {
  taobaoAppKey?: string | undefined
  taobaoAppSecret?: string | undefined
  aliMarketUrl?: string | undefined
  aliMarketAppCode?: string | undefined
  apiZeroKey?: string | undefined
  barcodeSpiderToken?: string | undefined
}

const UA = 'store-manager/0.1 (self-hosted retail tool)'

async function fetchTaobao(code: string, options: EnrichOptions): Promise<EnrichResult | null> {
  if (!options.taobaoAppKey || !options.taobaoAppSecret) return null
  try {
    const result = await fetchTaobaoBarcode(code, options.taobaoAppKey, options.taobaoAppSecret)
    if (!result) return null
    return {
      source: 'taobao',
      entry: {
        code,
        name: result.title,
        brand: result.brand,
        spec: result.spec,
        source: 'taobao',
        fetched_at: nowIso(),
      },
    }
  } catch {
    return null
  }
}

async function fetchOpenFoodFacts(code: string): Promise<EnrichResult | null> {
  try {
    const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,product_name_zh,generic_name,brands,quantity,image_front_url`
    const response = await fetch(url, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(6000),
    })
    if (!response.ok) return null
    const data = (await response.json()) as {
      status?: number
      product?: {
        product_name?: string
        product_name_zh?: string
        generic_name?: string
        brands?: string
        quantity?: string
        image_front_url?: string
      }
    }
    if (data.status !== 1 || !data.product) return null
    const product = data.product
    const name = product.product_name_zh || product.product_name || product.generic_name
    if (!name) return null
    return {
      source: 'openfoodfacts',
      entry: {
        code,
        name,
        brand: product.brands ?? null,
        spec: product.quantity ?? null,
        source: 'openfoodfacts',
        fetched_at: nowIso(),
      },
    }
  } catch {
    return null
  }
}

async function fetchUpcItemDb(code: string): Promise<EnrichResult | null> {
  try {
    const response = await fetch(
      `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(code)}`,
      {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(6000),
      },
    )
    if (!response.ok) return null
    const data = (await response.json()) as {
      items?: Array<{ title?: string; brand?: string; images?: string[]; model?: string }>
    }
    const item = data.items?.[0]
    if (!item?.title) return null
    return {
      source: 'upcitemdb',
      entry: {
        code,
        name: item.title,
        brand: item.brand ?? null,
        spec: item.model ?? null,
        source: 'upcitemdb',
        fetched_at: nowIso(),
      },
    }
  } catch {
    return null
  }
}

async function fetchOpenProductsFacts(code: string): Promise<EnrichResult | null> {
  try {
    const url = `https://world.openproductsfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,product_name_zh,generic_name,brands,quantity,image_front_url`
    const response = await fetch(url, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(6000),
    })
    if (!response.ok) return null
    const data = (await response.json()) as {
      status?: number
      product?: {
        product_name?: string
        product_name_zh?: string
        generic_name?: string
        brands?: string
        quantity?: string
        image_front_url?: string
      }
    }
    const product = data.product
    if (data.status !== 1 || !product) return null
    const name = product.product_name_zh || product.product_name || product.generic_name
    if (!name) return null
    return {
      source: 'openproductsfacts',
      entry: {
        code,
        name,
        brand: product.brands ?? null,
        spec: product.quantity ?? null,
        source: 'openproductsfacts',
        fetched_at: nowIso(),
      },
    }
  } catch {
    return null
  }
}

const firstString = (source: Record<string, unknown>, keys: string[]): string | null => {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

const firstImage = (source: Record<string, unknown>): string | null => {
  const direct = firstString(source, ['img', 'image', 'pic_url', 'picUrl'])
  if (direct) return direct
  for (const key of ['Image', 'imgList', 'images']) {
    const list = source[key]
    if (Array.isArray(list)) {
      const found = list.find((item): item is string => typeof item === 'string' && item.trim().length > 0)
      if (found) return found
    }
  }
  return null
}

export function parseAliMarketResponse(payload: unknown): {
  name: string
  brand: string | null
  spec: string | null
  imageUrl: string | null
} | null {
  if (!payload || typeof payload !== 'object') return null
  const root = payload as Record<string, unknown>

  if (root.showapi_res_code !== undefined) {
    if (Number(root.showapi_res_code) !== 0) return null
    const body = (root.showapi_res_body && typeof root.showapi_res_body === 'object'
      ? root.showapi_res_body
      : {}) as Record<string, unknown>
    const name = firstString(body, ['name', 'goodsName', 'ItemName', 'title'])
    if (!name) return null
    return {
      name,
      brand: firstString(body, ['brand', 'trademark', 'BrandName']),
      spec: firstString(body, ['spec', 'ItemSpecification', 'specification', 'nw']),
      imageUrl: firstImage(body),
    }
  }

  const data = (root.data && typeof root.data === 'object' ? root.data : root) as Record<string, unknown>
  const okCode = root.code === 200 || root.status === 200 || root.status === '200'
  if (!okCode) return null
  const name = firstString(data, ['goodsName', 'ItemName', 'title', 'name', 'productName'])
  if (!name) return null
  return {
    name,
    brand: firstString(data, ['trademark', 'BrandName', 'brand']),
    spec: firstString(data, ['spec', 'ItemSpecification', 'specification', 'nw']),
    imageUrl: firstImage(data),
  }
}

async function fetchAliMarket(code: string, options: EnrichOptions): Promise<EnrichResult | null> {
  if (!options.aliMarketUrl || !options.aliMarketAppCode) return null
  try {
    const url = options.aliMarketUrl.includes('{code}')
      ? options.aliMarketUrl.replace('{code}', encodeURIComponent(code))
      : `${options.aliMarketUrl}${options.aliMarketUrl.includes('?') ? '&' : '?'}code=${encodeURIComponent(code)}`
    const response = await fetch(url, {
      headers: { Authorization: `APPCODE ${options.aliMarketAppCode}` },
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) return null
    const parsed = parseAliMarketResponse(await response.json())
    if (!parsed) return null
    return {
      source: 'alimarket',
      entry: {
        code,
        name: parsed.name,
        brand: parsed.brand,
        spec: parsed.spec,
        source: 'alimarket',
        fetched_at: nowIso(),
      },
    }
  } catch {
    return null
  }
}

export function parseApiZeroResponse(payload: unknown): {
  name: string
  brand: string | null
  spec: string | null
} | null {
  if (!payload || typeof payload !== 'object') return null
  const root = payload as Record<string, unknown>
  if (root.code !== 0) return null
  const data = root.data
  if (!data || typeof data !== 'object') return null
  const record = data as Record<string, unknown>
  if (record.found !== true) return null
  const name = firstString(record, ['name'])
  if (!name) return null
  return {
    name,
    brand: firstString(record, ['brand', 'manufacturer']),
    spec: firstString(record, ['spec']),
  }
}

async function fetchApiZero(code: string, apiKey?: string): Promise<EnrichResult | null> {
  try {
    const response = await fetch(
      `https://v1.apizero.cn/api/barcode-lookup?barcode=${encodeURIComponent(code)}`,
      {
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
        signal: AbortSignal.timeout(6000),
      },
    )
    if (!response.ok) return null
    const parsed = parseApiZeroResponse(await response.json())
    if (!parsed) return null
    return {
      source: 'apizero',
      entry: {
        code,
        name: parsed.name,
        brand: parsed.brand,
        spec: parsed.spec,
        source: 'apizero',
        fetched_at: nowIso(),
      },
    }
  } catch {
    return null
  }
}

async function fetchBarcodeSpider(code: string, token?: string): Promise<EnrichResult | null> {
  if (!token) return null
  try {
    const response = await fetch(
      `https://api.barcodespider.com/v1/lookup?upc=${encodeURIComponent(code)}`,
      {
        headers: { token, 'User-Agent': UA },
        signal: AbortSignal.timeout(6000),
      },
    )
    if (!response.ok) return null
    const data = (await response.json()) as {
      item?: {
        title?: string
        brand?: string
        manufacturer?: string
        images?: string[]
        description?: string
      }
    }
    const item = data.item
    if (!item?.title) return null
    return {
      source: 'barcodespider',
      entry: {
        code,
        name: item.title.trim(),
        brand: item.brand ?? item.manufacturer ?? null,
        spec: null,
        source: 'barcodespider',
        fetched_at: nowIso(),
      },
    }
  } catch {
    return null
  }
}

export async function enrichBarcode(
  code: string,
  options: EnrichOptions = {},
): Promise<EnrichResult | null> {
  const isChineseCode = code.startsWith('69') || code.startsWith('069')
  const result =
    (await fetchTaobao(code, options)) ??
    (await fetchAliMarket(code, options)) ??
    (isChineseCode ? await fetchApiZero(code, options.apiZeroKey) : null) ??
    (await fetchOpenFoodFacts(code)) ??
    (await fetchOpenProductsFacts(code)) ??
    (await fetchUpcItemDb(code)) ??
    (isChineseCode ? null : await fetchApiZero(code, options.apiZeroKey)) ??
    (await fetchBarcodeSpider(code, options.barcodeSpiderToken))
  return result
}

export async function upsertBarcodeCache(
  db: Kysely<DB>,
  entry: BarcodeCacheEntry,
): Promise<void> {
  await db
    .insertInto('barcode_cache')
    .values(entry)
    .onConflict((oc) =>
      oc.column('code').doUpdateSet({
        name: entry.name,
        brand: entry.brand,
        spec: entry.spec,
        source: entry.source,
        fetched_at: entry.fetched_at,
      }),
    )
    .execute()
}

export async function lookupBarcode(
  db: Kysely<DB>,
  code: string,
  options: EnrichOptions = {},
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

  const cached = await db
    .selectFrom('barcode_cache')
    .selectAll()
    .where('code', '=', code)
    .executeTakeFirst()
  if (cached) {
    const entry: BarcodeCacheEntry = {
      code: cached.code,
      name: cached.name,
      brand: cached.brand,
      spec: cached.spec,
      source: cached.source,
      fetched_at: cached.fetched_at,
    }
    return { source: 'cache', cache: entry }
  }

  const enriched = await enrichBarcode(code, options)
  if (enriched) {
    await upsertBarcodeCache(db, enriched.entry)
    return { source: enriched.source, cache: enriched.entry }
  }

  return { source: 'none' }
}
