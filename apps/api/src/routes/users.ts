import { Hono } from 'hono'
import { z } from 'zod'
import { userCreateSchema, userUpdateSchema } from '@sm/shared'
import type { AppEnv } from '../env'
import { ApiError, ok, parseBody } from '../lib/errors'
import { hashPassword } from '../lib/password'
import { nowIso } from '../lib/ids'
import { requireOwner } from '../middleware/auth'

const router = new Hono<AppEnv>()

router.use('*', requireOwner)

const idSchema = z.coerce.number().int().positive()

router.get('/', async (c) => {
  const { db } = c.get('database')
  const rows = await db
    .selectFrom('users')
    .select(['id', 'username', 'nickname', 'role', 'status', 'wechat_openid', 'created_at'])
    .orderBy('id', 'asc')
    .execute()
  return ok(
    c,
    rows.map((row) => ({
      id: row.id,
      username: row.username,
      nickname: row.nickname,
      role: row.role,
      status: row.status,
      has_wechat: Boolean(row.wechat_openid),
      created_at: row.created_at,
    })),
  )
})

router.post('/', async (c) => {
  const { db } = c.get('database')
  const input = await parseBody(c, userCreateSchema)
  const exists = await db
    .selectFrom('users')
    .select('id')
    .where('username', '=', input.username)
    .executeTakeFirst()
  if (exists) throw new ApiError(400, 'USERNAME_TAKEN', '用户名已存在')
  const now = nowIso()
  const row = await db
    .insertInto('users')
    .values({
      username: input.username,
      password_hash: await hashPassword(input.password),
      nickname: input.nickname ?? null,
      role: input.role,
      status: 'active',
      created_at: now,
      updated_at: now,
    })
    .returningAll()
    .executeTakeFirstOrThrow()
  return ok(
    c,
    {
      id: row.id,
      username: row.username,
      nickname: row.nickname,
      role: row.role,
      status: row.status,
      has_wechat: Boolean(row.wechat_openid),
      created_at: row.created_at,
    },
    201,
  )
})

router.patch('/:id', async (c) => {
  const { db } = c.get('database')
  const id = idSchema.parse(c.req.param('id'))
  const input = await parseBody(c, userUpdateSchema)
  if (id === c.get('user').id && input.status === 'disabled') {
    throw new ApiError(400, 'SELF_DISABLE', '不能停用自己的账号')
  }
  const values: Record<string, unknown> = { updated_at: nowIso() }
  if (input.nickname !== undefined) values.nickname = input.nickname
  if (input.role !== undefined) values.role = input.role
  if (input.status !== undefined) values.status = input.status
  if (input.password) values.password_hash = await hashPassword(input.password)
  await db.updateTable('users').set(values as never).where('id', '=', id).execute()
  const row = await db.selectFrom('users').selectAll().where('id', '=', id).executeTakeFirst()
  if (!row) throw new ApiError(404, 'USER_NOT_FOUND', '账号不存在')
  return ok(c, {
    id: row.id,
    username: row.username,
    nickname: row.nickname,
    role: row.role,
    status: row.status,
    has_wechat: Boolean(row.wechat_openid),
    created_at: row.created_at,
  })
})

router.delete('/:id', async (c) => {
  const { db } = c.get('database')
  const id = idSchema.parse(c.req.param('id'))
  if (id === c.get('user').id) throw new ApiError(400, 'SELF_DELETE', '不能删除自己的账号')
  const row = await db.selectFrom('users').selectAll().where('id', '=', id).executeTakeFirst()
  if (!row) throw new ApiError(404, 'USER_NOT_FOUND', '账号不存在')
  // 历史单据保留 operator_id，经办人展示为「-」（快照约定，不做级联清理）
  await db.deleteFrom('users').where('id', '=', id).execute()
  return ok(c, { deleted: true })
})

export default router
