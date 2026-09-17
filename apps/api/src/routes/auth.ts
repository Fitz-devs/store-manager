import { Hono } from 'hono'
import { z } from 'zod'
import type { User, UserRole } from '@sm/shared'
import { changePasswordSchema, loginSchema, wxBindSchema, wxLoginSchema } from '@sm/shared'
import type { AppEnv } from '../env'
import { ApiError, ok, parseBody } from '../lib/errors'
import { signToken, verifyToken } from '../lib/jwt'
import { hashPassword, verifyPassword } from '../lib/password'
import { nowIso } from '../lib/ids'

const router = new Hono<AppEnv>()

const setupSchema = z.object({
  username: z.string().trim().min(2).max(50),
  password: z.string().min(6).max(100),
  nickname: z.string().trim().max(50).optional(),
  store_name: z.string().trim().max(50).optional(),
})

interface UserRow {
  id: number
  username: string
  nickname: string | null
  role: string
  status: string
  wechat_openid: string | null
  created_at: string
}

function publicUser(row: UserRow): User {
  return {
    id: row.id,
    username: row.username,
    nickname: row.nickname,
    role: row.role as UserRole,
    status: row.status,
    has_wechat: Boolean(row.wechat_openid),
    created_at: row.created_at,
  }
}

router.get('/setup-status', async (c) => {
  const { db } = c.get('database')
  const row = await db
    .selectFrom('users')
    .select((eb) => eb.fn.count('users.id').as('count'))
    .executeTakeFirst()
  return ok(c, {
    needs_setup: Number(row?.count ?? 0) === 0,
    wx_login_enabled: Boolean(c.env.WX_APPID && c.env.WX_SECRET),
  })
})

router.post('/setup', async (c) => {
  const { db } = c.get('database')
  const countRow = await db
    .selectFrom('users')
    .select((eb) => eb.fn.count('users.id').as('count'))
    .executeTakeFirst()
  if (Number(countRow?.count ?? 0) > 0) throw new ApiError(400, 'ALREADY_SETUP', '系统已初始化')

  const input = await parseBody(c, setupSchema)
  const now = nowIso()
  const user = await db
    .insertInto('users')
    .values({
      username: input.username,
      password_hash: await hashPassword(input.password),
      nickname: input.nickname ?? '老板',
      role: 'owner',
      status: 'active',
      created_at: now,
      updated_at: now,
    })
    .returningAll()
    .executeTakeFirstOrThrow()

  if (input.store_name) {
    await db
      .insertInto('settings')
      .values({ key: 'store_name', value: input.store_name })
      .onConflict((oc) => oc.column('key').doUpdateSet({ value: input.store_name! }))
      .execute()
  }

  const token = await signToken(c.env.JWT_SECRET, { sub: String(user.id), role: user.role })
  return ok(c, { token, user: publicUser(user) }, 201)
})

router.post('/login', async (c) => {
  const { db } = c.get('database')
  const input = await parseBody(c, loginSchema)
  const user = await db
    .selectFrom('users')
    .selectAll()
    .where('username', '=', input.username)
    .executeTakeFirst()
  if (!user || !(await verifyPassword(input.password, user.password_hash))) {
    throw new ApiError(401, 'BAD_CREDENTIALS', '用户名或密码错误')
  }
  if (user.status !== 'active') throw new ApiError(403, 'USER_DISABLED', '账号已停用')
  const token = await signToken(c.env.JWT_SECRET, { sub: String(user.id), role: user.role })
  return ok(c, { token, user: publicUser(user) })
})

router.post('/wx-login', async (c) => {
  if (!c.env.WX_APPID || !c.env.WX_SECRET) {
    throw new ApiError(400, 'WX_DISABLED', '尚未配置微信登录')
  }
  const { db } = c.get('database')
  const { code } = await parseBody(c, wxLoginSchema)
  const url =
    'https://api.weixin.qq.com/sns/jscode2session' +
    `?appid=${encodeURIComponent(c.env.WX_APPID)}` +
    `&secret=${encodeURIComponent(c.env.WX_SECRET)}` +
    `&js_code=${encodeURIComponent(code)}` +
    '&grant_type=authorization_code'
  let data: { openid?: string; errcode?: number; errmsg?: string }
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) })
    data = (await response.json()) as typeof data
  } catch {
    throw new ApiError(502, 'WX_ERROR', '微信服务暂时不可用')
  }
  if (!data.openid) {
    throw new ApiError(401, 'WX_LOGIN_FAILED', data.errmsg ?? '微信登录失败')
  }
  const user = await db
    .selectFrom('users')
    .selectAll()
    .where('wechat_openid', '=', data.openid)
    .executeTakeFirst()
  if (!user) {
    const bindToken = await signToken(
      c.env.JWT_SECRET,
      { purpose: 'wx-bind', openid: data.openid },
      '10m',
    )
    return ok(c, { need_bind: true, bind_token: bindToken })
  }
  if (user.status !== 'active') throw new ApiError(403, 'USER_DISABLED', '账号已停用')
  const token = await signToken(c.env.JWT_SECRET, { sub: String(user.id), role: user.role })
  return ok(c, { token, user: publicUser(user) })
})

router.post('/wx-bind', async (c) => {
  const { db } = c.get('database')
  const input = await parseBody(c, wxBindSchema)
  let payload: Record<string, unknown>
  try {
    payload = await verifyToken(c.env.JWT_SECRET, input.bind_token)
  } catch {
    throw new ApiError(401, 'BIND_EXPIRED', '绑定凭证已过期，请重新登录')
  }
  if (payload.purpose !== 'wx-bind' || typeof payload.openid !== 'string') {
    throw new ApiError(401, 'BIND_INVALID', '绑定凭证无效')
  }
  const user = await db
    .selectFrom('users')
    .selectAll()
    .where('username', '=', input.username)
    .executeTakeFirst()
  if (!user || !(await verifyPassword(input.password, user.password_hash))) {
    throw new ApiError(401, 'BAD_CREDENTIALS', '用户名或密码错误')
  }
  if (user.status !== 'active') throw new ApiError(403, 'USER_DISABLED', '账号已停用')
  const conflict = await db
    .selectFrom('users')
    .select('id')
    .where('wechat_openid', '=', payload.openid)
    .where('id', '!=', user.id)
    .executeTakeFirst()
  if (conflict) throw new ApiError(400, 'WX_BOUND', '该微信已绑定其他账号')
  await db
    .updateTable('users')
    .set({ wechat_openid: payload.openid, updated_at: nowIso() })
    .where('id', '=', user.id)
    .execute()
  const token = await signToken(c.env.JWT_SECRET, { sub: String(user.id), role: user.role })
  return ok(c, { token, user: publicUser({ ...user, wechat_openid: payload.openid }) })
})

/** 已登录用户：用微信 code 把当前账号绑定到该微信 */
router.post('/wx-bind-current', async (c) => {
  if (!c.env.WX_APPID || !c.env.WX_SECRET) {
    throw new ApiError(400, 'WX_DISABLED', '尚未配置微信登录')
  }
  const { db } = c.get('database')
  const current = c.get('user')
  const { code } = await parseBody(c, wxLoginSchema)
  const url =
    'https://api.weixin.qq.com/sns/jscode2session' +
    `?appid=${encodeURIComponent(c.env.WX_APPID)}` +
    `&secret=${encodeURIComponent(c.env.WX_SECRET)}` +
    `&js_code=${encodeURIComponent(code)}` +
    '&grant_type=authorization_code'
  let data: { openid?: string; errcode?: number; errmsg?: string }
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) })
    data = (await response.json()) as typeof data
  } catch {
    throw new ApiError(502, 'WX_ERROR', '微信服务暂时不可用')
  }
  if (!data.openid) {
    throw new ApiError(401, 'WX_LOGIN_FAILED', data.errmsg ?? '微信登录失败')
  }
  const conflict = await db
    .selectFrom('users')
    .select('id')
    .where('wechat_openid', '=', data.openid)
    .where('id', '!=', current.id)
    .executeTakeFirst()
  if (conflict) throw new ApiError(400, 'WX_BOUND', '该微信已绑定其他账号')
  await db
    .updateTable('users')
    .set({ wechat_openid: data.openid, updated_at: nowIso() })
    .where('id', '=', current.id)
    .execute()
  const row = await db
    .selectFrom('users')
    .selectAll()
    .where('id', '=', current.id)
    .executeTakeFirstOrThrow()
  return ok(c, { user: publicUser(row) })
})

router.post('/wx-unbind', async (c) => {
  const { db } = c.get('database')
  const current = c.get('user')
  const row = await db
    .selectFrom('users')
    .selectAll()
    .where('id', '=', current.id)
    .executeTakeFirstOrThrow()
  if (!row.wechat_openid) throw new ApiError(400, 'WX_NOT_BOUND', '当前账号未绑定微信')
  await db
    .updateTable('users')
    .set({ wechat_openid: null, updated_at: nowIso() })
    .where('id', '=', current.id)
    .execute()
  return ok(c, { user: publicUser({ ...row, wechat_openid: null }) })
})

router.get('/me', async (c) => ok(c, c.get('user')))

router.post('/change-password', async (c) => {
  const { db } = c.get('database')
  const current = c.get('user')
  const input = await parseBody(c, changePasswordSchema)
  const row = await db
    .selectFrom('users')
    .selectAll()
    .where('id', '=', current.id)
    .executeTakeFirstOrThrow()
  if (!(await verifyPassword(input.old_password, row.password_hash))) {
    throw new ApiError(400, 'BAD_PASSWORD', '原密码不正确')
  }
  await db
    .updateTable('users')
    .set({ password_hash: await hashPassword(input.new_password), updated_at: nowIso() })
    .where('id', '=', current.id)
    .execute()
  return ok(c, { updated: true })
})

export default router
