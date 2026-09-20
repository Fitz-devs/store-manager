export function yuanToFen(input: string | number): number {
  const n = typeof input === 'number' ? input : Number(String(input).replace(/[^\d.-]/g, ''))
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100)
}

export function fenToYuan(fen: number): string {
  return (Math.round(fen) / 100).toFixed(2)
}

export function formatFen(fen: number | null | undefined): string {
  if (fen === null || fen === undefined) return '-'
  return `¥${fenToYuan(fen)}`
}

export function calcAmount(unitPriceFen: number, qty: number): number {
  return Math.round(unitPriceFen * qty)
}

export function normalizeUnitPrice(unitPriceFen: number, conversion: number): number {
  if (!conversion || conversion <= 0) return unitPriceFen
  return Math.round(unitPriceFen / conversion)
}

export function priceChangeRatio(oldPrice: number | null, newPrice: number): number | null {
  if (oldPrice === null || oldPrice === 0) return null
  return Math.round(((newPrice - oldPrice) / oldPrice) * 10000) / 10000
}

const PIECE_UNIT_RE = /^(件|个|支|瓶|袋|盒|罐)$/

export function isPieceSaleUnit(unit: string | null | undefined): boolean {
  return PIECE_UNIT_RE.test(String(unit || '').trim())
}

/**
 * 入库进货价对比。
 * 用户约定：同一商品销售单位固定，单据上箱/提/件等描述可能不同，不按单位换算。
 * 直接比较「单据单价」与「库内 latest_purchase_price」。
 */
export function resolvePurchasePriceCompare(input: {
  docUnitPriceFen: number | null | undefined
  conversion?: number | null | undefined
  rowUnit?: string | null | undefined
  skuSaleUnit?: string | null | undefined
  latestPurchaseFen: number | null | undefined
}): {
  warn: boolean
  basis: 'same'
  docCompareFen: number
  libCompareFen: number
  libDisplayUnit: string
} | null {
  const doc = input.docUnitPriceFen
  const latest = input.latestPurchaseFen
  if (doc === null || doc === undefined || latest === null || latest === undefined) return null
  return {
    warn: Math.abs(doc - latest) >= 1,
    basis: 'same',
    docCompareFen: doc,
    libCompareFen: latest,
    libDisplayUnit: '',
  }
}
