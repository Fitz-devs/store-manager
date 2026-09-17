import type {
  DeliveryStatus,
  OrderStatus,
  PaymentMethod,
  PriceType,
  StockStatus,
  UserRole,
} from './constants'

export interface User {
  id: number
  username: string
  nickname: string | null
  role: UserRole
  status: string
  has_wechat: boolean
  created_at: string
}

export interface Product {
  id: number
  name: string
  aliases: string[]
  category: string | null
  category_ids: number[]
  brand: string | null
  notes: string | null
  image_key: string | null
  status: string
  created_at: string
  updated_at: string | null
}

export interface Category {
  id: number
  name: string
  created_at: string
}

export interface Sku {
  id: number
  product_id: number
  spec_name: string | null
  sale_unit: string
  retail_price: number
  friend_price: number | null
  latest_purchase_price: number | null
  stock_status: StockStatus
  out_of_stock_at: string | null
  status: string
  created_at: string
  updated_at: string | null
}

export interface Promotion {
  id: number
  sku_id: number
  content: string
  starts_at: string | null
  ends_at: string | null
  created_at: string
}

export interface ProductLink {
  id: number
  product_id: number
  linked_product_id: number
  relation: string
  note: string | null
  created_at: string
}

export interface LinkedProduct {
  link_id: number
  id: number
  name: string
  relation: string
  min_retail_price: number
  max_retail_price: number
  out_of_stock: boolean
}

export interface Barcode {
  id: number
  code: string
  sku_id: number
  product_id: number
  is_primary: number
  created_at: string
}

export interface SkuWithBarcodes extends Sku {
  barcodes: Barcode[]
  promotions: Promotion[]
}

export interface ProductListItem extends Product {
  sku_count: number
  out_of_stock: boolean
  min_retail_price: number
  max_retail_price: number
  primary_barcode: string | null
}

export interface PriceHistoryEntry {
  id: number
  sku_id: number
  price_type: PriceType
  old_value: number | null
  new_value: number
  source: string
  reason: string | null
  operator_id: number | null
  created_at: string
  operator_name?: string | null
}

export interface PurchaseItem {
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
}

export interface Purchase {
  id: number
  purchase_no: string
  supplier_name: string | null
  total_amount: number
  note: string | null
  image_keys: string | null
  ocr_raw?: string | null
  operator_id: number | null
  operator_name?: string | null
  ordered_at: string
  created_at: string
}

export interface PurchaseWithItems extends Purchase {
  items: PurchaseItem[]
}

export interface PriceChangeResult {
  sku_id: number
  product_name: string | null
  spec_name: string | null
  unit_name: string
  conversion: number
  unit_price: number
  old_price: number | null
  new_price: number
  ratio: number | null
  changed: boolean
}

export interface Customer {
  id: number
  name: string
  phone: string | null
  address: string | null
  notes: string | null
  status: string
  created_at: string
  updated_at: string | null
}

export interface Order {
  id: number
  order_no: string
  customer_id: number | null
  customer_name: string | null
  delivery_required: number
  delivery_address: string | null
  delivery_contact: string | null
  delivery_phone: string | null
  delivery_at: string | null
  delivered_at: string | null
  delivery_photo_key: string | null
  delivery_lat: number | null
  delivery_lng: number | null
  subtotal: number
  discount: number
  total: number
  paid_amount: number
  is_credit: number
  status: OrderStatus
  delivery_status: DeliveryStatus
  note: string | null
  operator_id: number | null
  operator_name?: string | null
  created_at: string
  updated_at: string | null
}

export interface OrderItem {
  id: number
  order_id: number
  sku_id: number
  product_id: number | null
  product_name: string | null
  spec_name: string | null
  unit_name: string
  conversion: number
  qty: number
  base_qty: number
  unit_price: number
  amount: number
  promotion_text: string | null
}

export interface Payment {
  id: number
  payment_no: string
  order_id: number
  customer_id: number | null
  method: PaymentMethod
  amount: number
  photo_key: string | null
  note: string | null
  operator_id: number | null
  operator_name?: string | null
  received_at: string
  created_at: string
}

export interface OrderWithItems extends Order {
  items: OrderItem[]
  payments: Payment[]
  remaining: number
}

export interface CustomerAddress {
  id: number
  customer_id: number
  label: string | null
  contact_name: string | null
  phone: string | null
  address: string
  lat: number | null
  lng: number | null
  is_default: number
  created_at: string
  updated_at: string | null
}

export interface CustomerDetail extends Customer {
  orders: OrderWithItems[]
  addresses: CustomerAddress[]
  total_unpaid: number
  last_order_at: string | null
}

export interface CustomerListItem extends Customer {
  unpaid_amount: number
  order_count: number
  last_order_at: string | null
}

export interface ProductDetail {
  product: Product
  skus: SkuWithBarcodes[]
  linked_products: LinkedProduct[]
  price_history: PriceHistoryEntry[]
  purchases: PurchaseWithItems[]
}

export interface BarcodeLookupResult {
  source: 'local' | 'none'
  product?: ProductDetail
  matched_sku_ids?: number[]
}

export interface OcrRow {
  name: string
  spec: string | null
  qty: number
  unit: string | null
  unit_price: number | null
  amount: number | null
}

export interface OcrHeader {
  order_no: string | null
  date: string | null
  /** 供货商（单据抬头公司名），不是收货方 */
  supplier_name: string | null
  /** 供货商电话（抬头旁），不是客户电话 */
  supplier_phone: string | null
  /** 收货方（我们自己），仅作参考，不预填供应商 */
  customer_name: string | null
  customer_phone: string | null
  salesman: string | null
  driver: string | null
  note: string | null
  total_raw: string | null
  total_fen: number | null
  page_index: number
  image_key: string
}

export interface OcrDraftRow {
  seq: number | null
  box_code: string | null
  unit_code: string | null
  name: string
  name_cleaned: string
  spec_hint: string | null
  qty_raw: string
  qty: number
  unit: string
  unit_price_raw: string
  unit_price_fen: number | null
  amount_raw: string
  amount_fen: number | null
  remark: string | null
  conversion_guess: number
  image_key: string
  page_index: number
}

export interface OcrDraft {
  headers: OcrHeader[]
  rows: OcrDraftRow[]
  model: string
  raw: string
}

export interface OcrProductPair {
  product_id: number
  sku_id: number
  name: string
  sale_unit: string
  barcode: string | null
}

export interface OcrFromRowResult {
  box: OcrProductPair
  unit: OcrProductPair | null
  link_id: number | null
}

export interface HomeReport {
  today_sales: number
  today_order_count: number
  today_purchase_amount: number
  unpaid_total: number
  unpaid_order_count: number
  pending_delivery_count: number
  out_of_stock_count: number
  recent_orders: Order[]
}

export interface Paginated<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}

export interface ApiErrorBody {
  code: string
  message: string
  detail?: unknown
}
