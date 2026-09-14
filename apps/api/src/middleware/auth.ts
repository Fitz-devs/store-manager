import type { MiddlewareHandler } from 'hono'
import type { UserRole } from '@sm/shared'
import type { AppEnv } from '../env'
import { ApiError } from '../lib/errors'
import { verifyToken } from '../lib/jwt'

export const authMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const header = c.req.header('Authorization')
  const token = header?.startsWith('Bearer ') ? header.slice(7) : c.req.query('token')
  if (!token) throw new ApiError(401, 'UNAUTHORIZED', '请先登录')
  let payload: Record<string, unknown>
  try {
    payload = await verifyToken(c.env.JWT_SECRET, token)
  } catch {
    throw new ApiError(401, 'TOKEN_INVALID', '登录已过期，请重新登录')
  }
  const id = Number(payload.sub)
  if (!Number.isFinite(id) || id <= 0) throw new ApiError(401, 'TOKEN_INVALID', '登录凭证无效')
  const row = await c
    .get('database')
    .db.selectFrom('users')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst()
  if (!row || row.status !== 'active') throw new ApiError(401, 'USER_DISABLED', '账号不存在或已停用')
  c.set('user', {
    id: row.id,
    username: row.username,
    nickname: row.nickname,
    role: row.role as UserRole,
    status: row.status,
    has_wechat: Boolean(row.wechat_openid),
    created_at: row.created_at,
  })
  await next()
}

export const requireOwner: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.get('user').role !== 'owner') throw new ApiError(403, 'FORBIDDEN', '只有老板账号可以操作')
  await next()
}
