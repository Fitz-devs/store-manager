export const PRICE_TYPES = ['purchase', 'retail', 'friend'] as const
export type PriceType = (typeof PRICE_TYPES)[number]

export const PAYMENT_METHODS = ['cash', 'wechat', 'alipay', 'other'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: '现金',
  wechat: '微信',
  alipay: '支付宝',
  other: '其他',
}

export const BARCODE_TYPES = ['single', 'box'] as const
export type BarcodeType = (typeof BARCODE_TYPES)[number]

export const STOCK_STATUSES = ['in_stock', 'out_of_stock'] as const
export type StockStatus = (typeof STOCK_STATUSES)[number]

export const ORDER_STATUSES = ['open', 'void'] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

export const DELIVERY_STATUSES = ['none', 'pending', 'delivered'] as const
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number]

export const USER_ROLES = ['owner', 'staff'] as const
export type UserRole = (typeof USER_ROLES)[number]

export const PRICE_TYPE_LABELS: Record<PriceType, string> = {
  purchase: '入库价',
  retail: '零售价',
  friend: '友情价',
}

export const STOCK_STATUS_LABELS: Record<StockStatus, string> = {
  in_stock: '在售',
  out_of_stock: '缺货',
}

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  none: '无需配送',
  pending: '待送货',
  delivered: '已送达',
}
