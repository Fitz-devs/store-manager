import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../env'
import { ApiError, ok, parseBody } from '../lib/errors'
import { nowIso } from '../lib/ids'

const router = new Hono<AppEnv>()
const idSchema = z.coerce.number().int().positive()
const nameSchema = z.string().trim().min(1).max(50)

router.get('/', async (c) => {
  const rows = await c
    .get('database')
    .db.selectFrom('categories')
    .selectAll()
    .orderBy('name', 'asc')
    .execute()
  return ok(c, rows)
})

router.post('/', async (c) => {
  const input = await parseBody(c, z.object({ name: nameSchema }))
  const db = c.get('database').db
  const exists = await db
    .selectFrom('categories')
    .select('id')
    .where('name', '=', input.name)
    .executeTakeFirst()
  if (exists) throw new ApiError(409, 'DUPLICATE', '分类已存在')
  const row = await db
    .insertInto('categories')
    .values({ name: input.name, created_at: nowIso() })
    .returningAll()
    .executeTakeFirstOrThrow()
  return ok(c, row, 201)
})

router.patch('/:id', async (c) => {
  const id = idSchema.parse(c.req.param('id'))
  const input = await parseBody(c, z.object({ name: nameSchema }))
  const db = c.get('database').db
  const exists = await db
    .selectFrom('categories')
    .select('id')
    .where('name', '=', input.name)
    .where('id', '!=', id)
    .executeTakeFirst()
  if (exists) throw new ApiError(409, 'DUPLICATE', '分类已存在')
  const row = await db
    .updateTable('categories')
    .set({ name: input.name })
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirst()
  if (!row) throw new ApiError(404, 'NOT_FOUND', '分类不存在')
  return ok(c, row)
})

router.delete('/:id', async (c) => {
  const id = idSchema.parse(c.req.param('id'))
  const db = c.get('database').db
  const used = await db
    .selectFrom('product_categories')
    .select('product_id')
    .where('category_id', '=', id)
    .execute()
  if (used.length) {
    throw new ApiError(400, 'IN_USE', `该分类下还有 ${used.length} 个商品，无法删除`)
  }
  await db.deleteFrom('categories').where('id', '=', id).execute()
  return ok(c, { deleted: true })
})

export default router
