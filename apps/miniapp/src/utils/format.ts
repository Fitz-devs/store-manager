import type {
  DeliveryStatus,
  Order,
  PaymentMethod,
  PriceType,
  PurchaseKind,
  StockStatus,
  UserRole,
} from '@sm/shared'

export function fenToYuan(fen: number | null | undefined): string {
  if (fen === null || fen === undefined) return '-'
  return (Math.round(fen) / 100).toFixed(2)
}

export function formatFen(fen: number | null | undefined): string {
  if (fen === null || fen === undefined) return '-'
  return `¥${fenToYuan(fen)}`
}

export function yuanToFen(input: string | number): number {
  const n = typeof input === 'number' ? input : Number(String(input).replace(/[^\d.-]/g, ''))
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100)
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '-'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function formatDay(iso: string | null | undefined): string {
  if (!iso) return '-'
  return iso.slice(0, 10)
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: '现金',
  wechat: '微信',
  alipay: '支付宝',
  goods: '商品抵扣',
  other: '其他',
}

export const PRICE_TYPE_LABELS: Record<PriceType, string> = {
  purchase: '入库价',
  retail: '零售价',
  friend: '友情价',
}

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  none: '无需配送',
  pending: '待送货',
  delivered: '已送达',
}

export const STOCK_STATUS_LABELS: Record<StockStatus, string> = {
  in_stock: '在售',
  out_of_stock: '缺货',
}

export const PURCHASE_KIND_LABELS: Record<PurchaseKind, string> = {
  purchase: '入库',
  goods_offset: '商品抵扣',
}

export const ROLE_LABELS: Record<UserRole, string> = {
  owner: '老板',
  staff: '店员',
}

export function orderStatusText(order: Pick<Order, 'status' | 'total' | 'paid_amount'>): string {
  if (order.status === 'void') return '已作废'
  const remaining = Math.max(0, order.total - order.paid_amount)
  if (remaining <= 0) return '已结清'
  if (order.paid_amount > 0) return '部分回款'
  return '未回款'
}

export function orderStatusTagClass(order: Pick<Order, 'status' | 'total' | 'paid_amount'>): string {
  if (order.status === 'void') return 'tag tag-danger'
  const remaining = Math.max(0, order.total - order.paid_amount)
  if (remaining > 0) return 'tag tag-warn'
  return 'tag tag-success'
}

export function orderRemaining(order: Pick<Order, 'total' | 'paid_amount' | 'status'>): number {
  if (order.status === 'void') return 0
  return Math.max(0, order.total - order.paid_amount)
}

export function todayString(): string {
  const now = new Date(Date.now() + 8 * 3600 * 1000)
  return now.toISOString().slice(0, 10)
}
