import { Hono } from 'hono'
import { z } from 'zod'
import { deliveryLocationSchema, orderCreateSchema, orderDeliverSchema } from '@sm/shared'
import type { AppEnv } from '../env'
import { createStorage } from '../adapters/storage'
import { ApiError, ok, parseBody, parseQuery } from '../lib/errors'
import {
  createOrder,
  deliverOrder,
  getOrder,
  listOrders,
  purgeOrder,
  updateOrderDeliveryLocation,
  voidOrder,
} from '../services/orders'

const router = new Hono<AppEnv>()

const idSchema = z.coerce.number().int().positive()

const booleanQuery = z
  .union([z.literal('1'), z.literal('true'), z.literal('0'), z.literal('false')])
  .optional()
  .transform((value) => value === '1' || value === 'true')

const listSchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(['open', 'void']).optional(),
  delivery_status: z.enum(['none', 'pending', 'delivered']).optional(),
  customer_id: z.coerce.number().int().positive().optional(),
  from: z.string().max(40).optional(),
  to: z.string().max(40).optional(),
  only_unpaid: booleanQuery,
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
})

router.get('/', async (c) => {
  const params = parseQuery(c, listSchema)
  const result = await listOrders(c.get('database').db, params)
  return ok(c, result)
})

router.post('/', async (c) => {
  const input = await parseBody(c, orderCreateSchema)
  const { db, d1 } = c.get('database')
  const order = await createOrder(d1, db, input, c.get('user').id)
  return ok(c, order, 201)
})

router.get('/:id', async (c) => {
  const id = idSchema.parse(c.req.param('id'))
  const order = await getOrder(c.get('database').db, id)
  if (!order) throw new ApiError(404, 'ORDER_NOT_FOUND', '订单不存在')
  return ok(c, order)
})

router.post('/:id/deliver', async (c) => {
  const id = idSchema.parse(c.req.param('id'))
  const input = await parseBody(c, orderDeliverSchema)
  const order = await deliverOrder(
    c.get('database').db,
    id,
    input,
    createStorage(c.env.BUCKET),
  )
  return ok(c, order)
})

router.patch('/:id/delivery-location', async (c) => {
  const id = idSchema.parse(c.req.param('id'))
  const input = await parseBody(c, deliveryLocationSchema)
  const order = await updateOrderDeliveryLocation(
    c.get('database').db,
    id,
    input.lat,
    input.lng,
    input.address,
  )
  return ok(c, order)
})

router.post('/:id/void', async (c) => {
  const id = idSchema.parse(c.req.param('id'))
  const { db, d1 } = c.get('database')
  const order = await voidOrder(db, d1, id)
  return ok(c, order)
})

router.delete('/:id/purge', async (c) => {
  const id = idSchema.parse(c.req.param('id'))
  const { db, d1 } = c.get('database')
  await purgeOrder(db, d1, id, createStorage(c.env.BUCKET))
  return ok(c, { purged: true })
})

export default router
