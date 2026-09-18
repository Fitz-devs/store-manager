import { Hono } from 'hono'
import { z } from 'zod'
import { paymentCreateSchema, paymentUpdateSchema } from '@sm/shared'
import type { AppEnv } from '../env'
import { createStorage } from '../adapters/storage'
import { ApiError, ok, parseBody } from '../lib/errors'
import { addPayment, updatePayment } from '../services/payments'

const router = new Hono<AppEnv>()

const idSchema = z.coerce.number().int().positive()

router.post('/', async (c) => {
  const input = await parseBody(c, paymentCreateSchema)
  const result = await addPayment(c.get('database').db, input, c.get('user').id)
  return ok(c, result, 201)
})

router.patch('/:id', async (c) => {
  const id = idSchema.parse(c.req.param('id'))
  const input = await parseBody(c, paymentUpdateSchema)
  const result = await updatePayment(
    c.get('database').db,
    id,
    input,
    createStorage(c.env.BUCKET),
  )
  return ok(c, result)
})

export default router
