import { Hono } from 'hono'
import { z } from 'zod'
import {
  prizeCreateSchema,
  prizeUpdateSchema,
  promotionCreateSchema,
  promotionUpdateSchema,
  skuUpdateSchema,
  stockStatusSchema,
} from '@sm/shared'
import type { AppEnv } from '../env'
import { ok, parseBody } from '../lib/errors'
import {
  archiveSku,
  createPrize,
  createPromotion,
  deletePrize,
  deletePromotion,
  setStockStatus,
  updatePrize,
  updatePromotion,
  updateSku,
} from '../services/products'

const router = new Hono<AppEnv>()

const idSchema = z.coerce.number().int().positive()

router.patch('/:id', async (c) => {
  const id = idSchema.parse(c.req.param('id'))
  const input = await parseBody(c, skuUpdateSchema)
  const { db, d1 } = c.get('database')
  const sku = await updateSku(db, d1, id, input, c.get('user').id)
  return ok(c, sku)
})

router.post('/:id/stock-status', async (c) => {
  const id = idSchema.parse(c.req.param('id'))
  const input = await parseBody(c, stockStatusSchema)
  const sku = await setStockStatus(c.get('database').db, id, input.status)
  return ok(c, sku)
})

router.post('/:id/archive', async (c) => {
  const id = idSchema.parse(c.req.param('id'))
  await archiveSku(c.get('database').db, id)
  return ok(c, { archived: true })
})

router.post('/:id/promotions', async (c) => {
  const skuId = idSchema.parse(c.req.param('id'))
  const input = await parseBody(c, promotionCreateSchema)
  const promotion = await createPromotion(c.get('database').db, skuId, input)
  return ok(c, promotion, 201)
})

router.delete('/promotions/:promotionId', async (c) => {
  const promotionId = idSchema.parse(c.req.param('promotionId'))
  await deletePromotion(c.get('database').db, promotionId)
  return ok(c, { deleted: true })
})

router.patch('/promotions/:promotionId', async (c) => {
  const promotionId = idSchema.parse(c.req.param('promotionId'))
  const input = await parseBody(c, promotionUpdateSchema)
  const promotion = await updatePromotion(c.get('database').db, promotionId, input)
  return ok(c, promotion)
})

router.post('/:id/prizes', async (c) => {
  const skuId = idSchema.parse(c.req.param('id'))
  const input = await parseBody(c, prizeCreateSchema)
  const prize = await createPrize(c.get('database').db, skuId, input)
  return ok(c, prize, 201)
})

router.delete('/prizes/:prizeId', async (c) => {
  const prizeId = idSchema.parse(c.req.param('prizeId'))
  await deletePrize(c.get('database').db, prizeId)
  return ok(c, { deleted: true })
})

router.patch('/prizes/:prizeId', async (c) => {
  const prizeId = idSchema.parse(c.req.param('prizeId'))
  const input = await parseBody(c, prizeUpdateSchema)
  const prize = await updatePrize(c.get('database').db, prizeId, input)
  return ok(c, prize)
})

export default router
