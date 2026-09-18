import { Hono } from 'hono'
import { z } from 'zod'
import { checkPricesSchema, purchaseCreateSchema, purchaseUpdateSchema } from '@sm/shared'
import type { AppEnv } from '../env'
import { createStorage } from '../adapters/storage'
import { ApiError, ok, parseBody, parseQuery } from '../lib/errors'
import {
  checkPurchasePrices,
  createPurchase,
  getPurchase,
  listPurchases,
  purgePurchase,
  updatePurchase,
} from '../services/purchases'

const router = new Hono<AppEnv>()

const idSchema = z.coerce.number().int().positive()

const listSchema = z.object({
  q: z.string().trim().max(100).optional(),
  from: z.string().max(40).optional(),
  to: z.string().max(40).optional(),
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
})

router.get('/', async (c) => {
  const params = parseQuery(c, listSchema)
  const result = await listPurchases(c.get('database').db, params)
  return ok(c, result)
})

router.post('/check-prices', async (c) => {
  const input = await parseBody(c, checkPricesSchema)
  const result = await checkPurchasePrices(c.get('database').db, input.items)
  return ok(c, result)
})

router.get('/:id', async (c) => {
  const id = idSchema.parse(c.req.param('id'))
  const purchase = await getPurchase(c.get('database').db, id)
  if (!purchase) throw new ApiError(404, 'PURCHASE_NOT_FOUND', '入库单不存在')
  return ok(c, purchase)
})

router.post('/', async (c) => {
  const input = await parseBody(c, purchaseCreateSchema)
  const { db, d1 } = c.get('database')
  const purchase = await createPurchase(d1, db, input, {
    operatorId: c.get('user').id,
  })
  return ok(c, purchase, 201)
})

router.patch('/:id', async (c) => {
  const id = idSchema.parse(c.req.param('id'))
  const input = await parseBody(c, purchaseUpdateSchema)
  const { db, d1 } = c.get('database')
  const purchase = await updatePurchase(db, d1, id, input, createStorage(c.env.BUCKET))
  return ok(c, purchase)
})

router.delete('/:id/purge', async (c) => {
  const id = idSchema.parse(c.req.param('id'))
  if (!Number.isFinite(id) || id <= 0) throw new ApiError(400, 'VALIDATION', '参数错误')
  const { db, d1 } = c.get('database')
  await purgePurchase(db, d1, id, createStorage(c.env.BUCKET))
  return ok(c, { purged: true })
})

export default router
