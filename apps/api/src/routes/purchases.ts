import { Hono } from 'hono'
import { z } from 'zod'
import { checkPricesSchema, purchaseCreateSchema } from '@sm/shared'
import type { AppEnv } from '../env'
import { ApiError, ok, parseBody, parseQuery } from '../lib/errors'
import {
  checkPurchasePrices,
  createPurchase,
  getPurchase,
  listPurchases,
} from '../services/purchases'

const router = new Hono<AppEnv>()

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
  const id = Number(c.req.param('id'))
  if (!Number.isFinite(id) || id <= 0) throw new ApiError(400, 'VALIDATION', '参数错误')
  const purchase = await getPurchase(c.get('database').db, id)
  if (!purchase) throw new ApiError(404, 'PURCHASE_NOT_FOUND', '入库单不存在')
  return ok(c, purchase)
})

router.post('/', async (c) => {
  const input = await parseBody(c, purchaseCreateSchema)
  const { db, d1 } = c.get('database')
  const purchase = await createPurchase(d1, db, input, {
    applyPurchasePrice: true,
    operatorId: c.get('user').id,
  })
  return ok(c, purchase, 201)
})

export default router
