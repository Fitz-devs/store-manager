import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { z } from 'zod'

export class ApiError extends Error {
  status: ContentfulStatusCode
  code: string
  detail?: unknown

  constructor(status: ContentfulStatusCode, code: string, message: string, detail?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.detail = detail
  }
}

export function ok<T>(c: Context, data: T, status: ContentfulStatusCode = 200) {
  return c.json({ ok: true as const, data }, status)
}

export async function parseBody<S extends z.ZodTypeAny>(
  c: Context,
  schema: S,
): Promise<z.output<S>> {
  let raw: unknown
  try {
    raw = await c.req.json()
  } catch {
    throw new ApiError(400, 'BAD_JSON', '请求体不是合法 JSON')
  }
  const result = schema.safeParse(raw)
  if (!result.success) {
    throw new ApiError(400, 'VALIDATION', '参数错误', result.error.flatten())
  }
  return result.data as z.output<S>
}

export function parseQuery<S extends z.ZodTypeAny>(c: Context, schema: S): z.output<S> {
  const result = schema.safeParse(c.req.query())
  if (!result.success) {
    throw new ApiError(400, 'VALIDATION', '查询参数错误', result.error.flatten())
  }
  return result.data as z.output<S>
}
