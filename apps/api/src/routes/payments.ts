import { Hono } from 'hono'
import { paymentCreateSchema } from '@sm/shared'
import type { AppEnv } from '../env'
import { ok, parseBody } from '../lib/errors'
import { addPayment } from '../services/payments'

const router = new Hono<AppEnv>()

router.post('/', async (c) => {
  const input = await parseBody(c, paymentCreateSchema)
  const { db, d1 } = c.get('database')
  const result = await addPayment(d1, db, input, c.get('user').id)
  return ok(c, result, 201)
})

export default router
