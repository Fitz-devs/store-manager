import { Hono } from 'hono'
import { z } from 'zod'
import {
  barcodeInputSchema,
  linkCreateSchema,
  listQuerySchema,
  matchOcrSchema,
  ocrFromRowSchema,
  productCreateSchema,
  productUpdateSchema,
  skuInputSchema,
} from '@sm/shared'
import type { AppEnv } from '../env'
import { createStorage } from '../adapters/storage'
import { ApiError, ok, parseBody, parseQuery } from '../lib/errors'
import {
  addBarcode,
  addProductLink,
  addSku,
  createProduct,
  createProductsFromOcrRow,
  deleteProductLink,
  getProductDetail,
  listProducts,
  purgeProduct,
  updateProduct,
} from '../services/products'
import { matchOcrRows } from '../services/match-ocr'

const router = new Hono<AppEnv>()

const idSchema = z.coerce.number().int().positive()

router.get('/', async (c) => {
  const params = parseQuery(c, listQuerySchema)
  const result = await listProducts(c.get('database').db, params)
  return ok(c, result)
})

router.get('/categories', async (c) => {
  const { db } = c.get('database')
  const rows = await db
    .selectFrom('products')
    .select('category')
    .distinct()
    .where('status', '=', 'active')
    .where('category', 'is not', null)
    .orderBy('category', 'asc')
    .execute()
  return ok(
    c,
    rows.map((row) => row.category).filter((value): value is string => Boolean(value)),
  )
})

router.post('/', async (c) => {
  const input = await parseBody(c, productCreateSchema)
  const { db, d1 } = c.get('database')
  const detail = await createProduct(db, d1, input, c.get('user').id)
  return ok(c, detail, 201)
})

router.post('/from-ocr-row', async (c) => {
  const input = await parseBody(c, ocrFromRowSchema)
  const { db, d1 } = c.get('database')
  const result = await createProductsFromOcrRow(db, d1, createStorage(c.env.BUCKET), input, c.get('user').id)
  return ok(c, result, 201)
})

router.post('/match-ocr', async (c) => {
  const input = await parseBody(c, matchOcrSchema)
  const results = await matchOcrRows(c.get('database').db, input.rows)
  return ok(c, { results })
})

router.get('/:id', async (c) => {
  const id = idSchema.parse(c.req.param('id'))
  const detail = await getProductDetail(c.get('database').db, id)
  if (!detail) throw new ApiError(404, 'PRODUCT_NOT_FOUND', '商品不存在')
  return ok(c, detail)
})

router.patch('/:id', async (c) => {
  const id = idSchema.parse(c.req.param('id'))
  const input = await parseBody(c, productUpdateSchema)
  const product = await updateProduct(
    c.get('database').db,
    id,
    input,
    createStorage(c.env.BUCKET),
  )
  if (!product) throw new ApiError(404, 'PRODUCT_NOT_FOUND', '商品不存在')
  return ok(c, product)
})

router.delete('/:id', async (c) => {
  const id = idSchema.parse(c.req.param('id'))
  const product = await updateProduct(c.get('database').db, id, { status: 'archived' })
  if (!product) throw new ApiError(404, 'PRODUCT_NOT_FOUND', '商品不存在')
  return ok(c, { archived: true })
})

router.delete('/:id/purge', async (c) => {
  const id = idSchema.parse(c.req.param('id'))
  const { db, d1 } = c.get('database')
  await purgeProduct(db, d1, id, createStorage(c.env.BUCKET))
  return ok(c, { purged: true })
})

router.post('/:id/skus', async (c) => {
  const productId = idSchema.parse(c.req.param('id'))
  const input = await parseBody(c, skuInputSchema)
  const { db, d1 } = c.get('database')
  const sku = await addSku(db, d1, productId, input, c.get('user').id)
  return ok(c, sku, 201)
})

router.post('/:id/barcodes', async (c) => {
  const productId = idSchema.parse(c.req.param('id'))
  const input = await parseBody(c, barcodeInputSchema.extend({ sku_id: idSchema }))
  const { db } = c.get('database')
  const sku = await db
    .selectFrom('skus')
    .select('id')
    .where('id', '=', input.sku_id)
    .where('product_id', '=', productId)
    .executeTakeFirst()
  if (!sku) throw new ApiError(400, 'SKU_MISMATCH', '规格不属于该商品')
  const barcode = await addBarcode(db, input)
  return ok(c, barcode, 201)
})

router.post('/:id/links', async (c) => {
  const productId = idSchema.parse(c.req.param('id'))
  const input = await parseBody(c, linkCreateSchema)
  const link = await addProductLink(c.get('database').db, productId, input)
  return ok(c, link, 201)
})

router.delete('/links/:linkId', async (c) => {
  const linkId = idSchema.parse(c.req.param('linkId'))
  await deleteProductLink(c.get('database').db, linkId)
  return ok(c, { deleted: true })
})

export default router
