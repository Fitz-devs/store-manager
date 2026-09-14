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
