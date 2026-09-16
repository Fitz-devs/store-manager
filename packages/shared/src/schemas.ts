import { z } from 'zod'
import { PAYMENT_METHODS, STOCK_STATUSES, USER_ROLES } from './constants'

const nullableText = (max: number) =>
  z
    .union([z.string().trim().max(max), z.null()])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === '' ? null : v))

const id = z.coerce.number().int().positive()
const fen = z.coerce.number().int().min(0)

export const loginSchema = z.object({
  username: z.string().trim().min(1).max(50),
  password: z.string().min(1).max(100),
})

export const wxLoginSchema = z.object({
  code: z.string().min(1).max(200),
})

export const wxBindSchema = z.object({
  bind_token: z.string().min(1),
  username: z.string().trim().min(1).max(50),
  password: z.string().min(1).max(100),
})

export const changePasswordSchema = z.object({
  old_password: z.string().min(1).max(100),
  new_password: z.string().min(6).max(100),
})

export const userCreateSchema = z.object({
  username: z.string().trim().min(2).max(50),
  password: z.string().min(6).max(100),
  nickname: nullableText(50),
  role: z.enum(USER_ROLES).default('staff'),
})

export const userUpdateSchema = z.object({
  nickname: nullableText(50),
  role: z.enum(USER_ROLES).optional(),
  status: z.enum(['active', 'disabled']).optional(),
  password: z.string().min(6).max(100).optional(),
})

export const barcodeInputSchema = z.object({
  code: z.string().trim().min(1).max(64),
  is_primary: z.coerce.boolean().default(false),
})

export const skuInputSchema = z.object({
  spec_name: nullableText(50),
  sale_unit: z.string().trim().min(1).max(10).default('件'),
  retail_price: fen.default(0),
  friend_price: fen.nullable().optional(),
  latest_purchase_price: fen.nullable().optional(),
})

export const promotionCreateSchema = z.object({
  content: z.string().trim().min(1).max(200),
  starts_at: nullableText(40),
  ends_at: nullableText(40),
})

export const promotionUpdateSchema = z.object({
  content: z.string().trim().min(1).max(200).optional(),
  starts_at: nullableText(40),
  ends_at: nullableText(40),
})

export const prizeCreateSchema = z.object({
  description: nullableText(100),
  extra_price: fen.default(0),
})

export const prizeUpdateSchema = z.object({
  description: nullableText(100),
  extra_price: fen.optional(),
})

export const linkCreateSchema = z.object({
  linked_product_id: id,
  relation: z.string().trim().max(20).default('box_piece'),
  note: nullableText(200),
})

export const productCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  aliases: z.array(z.string().trim().min(1).max(30)).max(20).optional(),
  category: nullableText(50),
  category_ids: z.array(id).max(10).optional(),
  brand: nullableText(50),
  notes: nullableText(500),
  image_key: nullableText(300),
  purchase_price: fen.nullable().optional(),
  sku: skuInputSchema,
  barcodes: z.array(barcodeInputSchema).max(20).default([]),
  promotions: z.array(promotionCreateSchema).max(20).default([]),
  prizes: z.array(prizeCreateSchema).max(20).default([]),
})

export const productUpdateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  aliases: z.array(z.string().trim().min(1).max(30)).max(20).optional(),
  category: nullableText(50),
  category_ids: z.array(id).max(10).optional(),
  brand: nullableText(50),
  notes: nullableText(500),
  image_key: nullableText(300),
  status: z.enum(['active', 'archived']).optional(),
})

export const skuUpdateSchema = z.object({
  spec_name: nullableText(50),
  sale_unit: z.string().trim().min(1).max(10).optional(),
  retail_price: fen.optional(),
  friend_price: fen.nullable().optional(),
  latest_purchase_price: fen.nullable().optional(),
  reason: nullableText(100),
})

export const stockStatusSchema = z.object({
  status: z.enum(STOCK_STATUSES),
})

export const barcodeCreateSchema = barcodeInputSchema.extend({
  sku_id: id,
})

export const purchaseItemInputSchema = z.object({
  sku_id: id,
  unit_name: z.string().trim().min(1).max(10),
  conversion: z.coerce.number().int().positive().max(100000).default(1),
  qty: z.coerce.number().positive().max(1000000),
  unit_price: fen,
})

export const priceUpdateInputSchema = z.object({
  sku_id: id,
  retail_price: fen.optional(),
  friend_price: fen.nullable().optional(),
})

export const purchaseCreateSchema = z.object({
  supplier_name: nullableText(50),
  ordered_at: z.string().min(1).max(40),
  note: nullableText(500),
  image_keys: z.array(z.string().max(300)).max(10).optional(),
  ocr_raw: z.string().max(500000).nullable().optional(),
  items: z.array(purchaseItemInputSchema).min(1).max(200),
  price_updates: z.array(priceUpdateInputSchema).max(200).default([]),
})

export const checkPricesSchema = z.object({
  items: z
    .array(
      z.object({
        sku_id: id,
        unit_name: z.string().max(10).default('件'),
        conversion: z.coerce.number().int().positive().max(100000).default(1),
        unit_price: fen,
      }),
    )
    .min(1)
    .max(200),
})

export const customerAddressInputSchema = z.object({
  label: nullableText(20),
  contact_name: nullableText(50),
  phone: nullableText(30),
  address: z.string().trim().min(1).max(200),
  is_default: z.coerce.boolean().optional(),
})

export const customerInputSchema = z.object({
  name: z.string().trim().min(1).max(50),
  phone: nullableText(30),
  address: nullableText(200),
  notes: nullableText(500),
  addresses: z.array(customerAddressInputSchema).max(20).optional(),
})

export const customerUpdateSchema = customerInputSchema.partial().extend({
  status: z.enum(['active', 'archived']).optional(),
})

export const deliveryInputSchema = z.object({
  required: z.coerce.boolean().default(false),
  address: nullableText(200),
  contact: nullableText(50),
  phone: nullableText(30),
  at: nullableText(40),
})

export const orderItemInputSchema = z.object({
  sku_id: id,
  unit_name: z.string().trim().min(1).max(10),
  conversion: z.coerce.number().int().positive().max(100000).default(1),
  qty: z.coerce.number().positive().max(1000000),
  unit_price: fen,
  promotion_text: nullableText(200),
})

export const orderCreateSchema = z.object({
  customer_id: id.nullable().optional(),
  customer_name: nullableText(50),
  note: nullableText(500),
  is_credit: z.coerce.boolean().default(false),
  discount: fen.default(0),
  delivery: deliveryInputSchema.optional(),
  items: z.array(orderItemInputSchema).min(1).max(200),
  payment: z
    .object({
      method: z.enum(PAYMENT_METHODS),
      amount: fen,
      note: nullableText(200),
      goods_items: z.array(purchaseItemInputSchema).max(200).optional(),
    })
    .optional(),
})

export const orderDeliverSchema = z.object({
  photo_key: z.string().max(300).nullable().optional(),
  delivered_at: z.string().max(40).optional(),
  note: nullableText(200),
})

export const paymentCreateSchema = z.object({
  order_id: id,
  method: z.enum(PAYMENT_METHODS),
  amount: fen,
  note: nullableText(200),
  received_at: z.string().max(40).optional(),
  goods_items: z.array(purchaseItemInputSchema).max(200).optional(),
})

export const ocrRequestSchema = z.object({
  image_key: z.string().min(1).max(300),
})

export const ocrFromRowSchema = z.object({
  name: z.string().trim().min(1).max(100),
  box_code: z.string().trim().min(8).max(64).nullable().optional(),
  unit_code: z.string().trim().min(8).max(64).nullable().optional(),
  conversion: z.coerce.number().int().positive().max(100000).default(1),
  unit_price_fen: fen.nullable().optional(),
  spec_hint: nullableText(80),
  sale_unit: z.string().trim().min(1).max(10).default('箱'),
})

export const barcodeEnrichSchema = z.object({
  code: z.string().trim().min(1).max(64),
})

export const idParamSchema = z.object({
  id,
})

export const listQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().trim().max(50).optional(),
  stock: z.enum(['all', 'in_stock', 'out_of_stock']).default('all'),
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
})

export type LoginInput = z.infer<typeof loginSchema>
export type ProductCreateInput = z.infer<typeof productCreateSchema>
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>
export type SkuUpdateInput = z.infer<typeof skuUpdateSchema>
export type PurchaseCreateInput = z.infer<typeof purchaseCreateSchema>
export type OrderCreateInput = z.infer<typeof orderCreateSchema>
export type PaymentCreateInput = z.infer<typeof paymentCreateSchema>
export type CustomerInput = z.infer<typeof customerInputSchema>
export type ListQueryInput = z.infer<typeof listQuerySchema>
