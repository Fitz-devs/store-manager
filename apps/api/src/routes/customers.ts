import { Hono } from 'hono'
import { z } from 'zod'
import { customerAddressInputSchema, customerInputSchema, customerUpdateSchema } from '@sm/shared'
import type { AppEnv } from '../env'
import { ApiError, ok, parseBody, parseQuery } from '../lib/errors'
import {
  addCustomerAddress,
  createCustomer,
  deleteCustomerAddress,
  getCustomerDetail,
  listCustomerAddresses,
  listCustomers,
  setDefaultCustomerAddress,
  updateCustomer,
} from '../services/customers'

const router = new Hono<AppEnv>()

const idSchema = z.coerce.number().int().positive()
const listSchema = z.object({
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
})

router.get('/', async (c) => {
  const params = parseQuery(c, listSchema)
  const result = await listCustomers(c.get('database').db, params)
  return ok(c, result)
})

router.post('/', async (c) => {
  const input = await parseBody(c, customerInputSchema)
  const customer = await createCustomer(c.get('database').db, input)
  return ok(c, customer, 201)
})

router.get('/:id', async (c) => {
  const id = idSchema.parse(c.req.param('id'))
  const detail = await getCustomerDetail(c.get('database').db, id)
  if (!detail) throw new ApiError(404, 'CUSTOMER_NOT_FOUND', '客户不存在')
  return ok(c, detail)
})

router.patch('/:id', async (c) => {
  const id = idSchema.parse(c.req.param('id'))
  const input = await parseBody(c, customerUpdateSchema)
  const customer = await updateCustomer(c.get('database').db, id, input)
  return ok(c, customer)
})

router.delete('/:id', async (c) => {
  const id = idSchema.parse(c.req.param('id'))
  await updateCustomer(c.get('database').db, id, { status: 'archived' })
  return ok(c, { archived: true })
})

router.get('/:id/addresses', async (c) => {
  const id = idSchema.parse(c.req.param('id'))
  const addresses = await listCustomerAddresses(c.get('database').db, id)
  return ok(c, addresses)
})

router.post('/:id/addresses', async (c) => {
  const id = idSchema.parse(c.req.param('id'))
  const input = await parseBody(c, customerAddressInputSchema)
  const address = await addCustomerAddress(c.get('database').db, id, input)
  return ok(c, address, 201)
})

router.post('/:id/addresses/:addressId/default', async (c) => {
  const id = idSchema.parse(c.req.param('id'))
  const addressId = idSchema.parse(c.req.param('addressId'))
  const address = await setDefaultCustomerAddress(c.get('database').db, id, addressId)
  return ok(c, address)
})

router.delete('/:id/addresses/:addressId', async (c) => {
  const id = idSchema.parse(c.req.param('id'))
  const addressId = idSchema.parse(c.req.param('addressId'))
  await deleteCustomerAddress(c.get('database').db, id, addressId)
  return ok(c, { deleted: true })
})

export default router
