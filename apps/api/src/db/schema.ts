import type { Generated } from 'kysely'

export interface UsersTable {
  id: Generated<number>
  username: string
  password_hash: string | null
  wechat_openid: string | null
  nickname: string | null
  role: string
  status: string
  created_at: string
  updated_at: string | null
}

export interface ProductsTable {
  id: Generated<number>
  name: string
  aliases: string | null
  category: string | null
  brand: string | null
  notes: string | null
  image_key: string | null
  status: string
  created_at: string
  updated_at: string | null
}

export interface SkusTable {
  id: Generated<number>
  product_id: number
  spec_name: string | null
  sale_unit: string
  retail_price: number
  friend_price: number | null
  latest_purchase_price: number | null
  stock_status: string
  out_of_stock_at: string | null
  status: string
  created_at: string
  updated_at: string | null
}

export interface PromotionsTable {
  id: Generated<number>
  sku_id: number
  content: string
  starts_at: string | null
  ends_at: string | null
  created_at: string
}

export interface ProductLinksTable {
  id: Generated<number>
  product_id: number
  linked_product_id: number
  relation: string
  note: string | null
  created_at: string
}

export interface BarcodesTable {
  id: Generated<number>
  code: string
  sku_id: number
  product_id: number
  is_primary: number
  created_at: string
}

export interface PriceHistoryTable {
  id: Generated<number>
  sku_id: number
  price_type: string
  old_value: number | null
  new_value: number
  source: string
  reason: string | null
  operator_id: number | null
  created_at: string
}

export interface PurchasesTable {
  id: Generated<number>
  purchase_no: string
  supplier_name: string | null
  total_amount: number
  note: string | null
  image_keys: string | null
  ocr_raw: string | null
  operator_id: number | null
  ordered_at: string
  created_at: string
}

export interface PurchaseItemsTable {
  id: Generated<number>
  purchase_id: number
  sku_id: number
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

export interface CustomersTable {
  id: Generated<number>
  name: string
  phone: string | null
  address: string | null
  notes: string | null
  status: string
  created_at: string
  updated_at: string | null
}

export interface CustomerAddressesTable {
  id: Generated<number>
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

export interface OrdersTable {
  id: Generated<number>
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
  status: string
  delivery_status: string
  note: string | null
  operator_id: number | null
  created_at: string
  updated_at: string | null
}

export interface OrderItemsTable {
  id: Generated<number>
  order_id: number
  sku_id: number
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

export interface PaymentsTable {
  id: Generated<number>
  payment_no: string
  order_id: number
  customer_id: number | null
  method: string
  amount: number
  photo_key: string | null
  note: string | null
  operator_id: number | null
  received_at: string
  created_at: string
}

export interface SettingsTable {
  key: string
  value: string | null
}

export interface CategoriesTable {
  id: Generated<number>
  name: string
  created_at: string
}

export interface ProductCategoriesTable {
  product_id: number
  category_id: number
}

export interface DB {
  users: UsersTable
  products: ProductsTable
  skus: SkusTable
  barcodes: BarcodesTable
  promotions: PromotionsTable
  product_links: ProductLinksTable
  price_history: PriceHistoryTable
  purchases: PurchasesTable
  purchase_items: PurchaseItemsTable
  customers: CustomersTable
  customer_addresses: CustomerAddressesTable
  orders: OrdersTable
  order_items: OrderItemsTable
  payments: PaymentsTable
  settings: SettingsTable
  categories: CategoriesTable
  product_categories: ProductCategoriesTable
}
