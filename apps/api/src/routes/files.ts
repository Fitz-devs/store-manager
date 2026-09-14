import { Hono } from 'hono'
import type { Context } from 'hono'
import type { AppEnv } from '../env'
import { createStorage } from '../adapters/storage'
import { ApiError, ok } from '../lib/errors'
import { shanghaiDateString, uuid } from '../lib/ids'

const router = new Hono<AppEnv>()

const SCOPES = new Set(['products', 'purchases', 'deliveries', 'misc'])
const MAX_SIZE = 8 * 1024 * 1024

function extensionFor(contentType: string): string {
  if (contentType.includes('png')) return 'png'
  if (contentType.includes('webp')) return 'webp'
  if (contentType.includes('gif')) return 'gif'
  if (contentType.includes('pdf')) return 'pdf'
  return 'jpg'
}

router.post('/', async (c) => {
  let form: FormData
  try {
    form = await c.req.formData()
  } catch {
    throw new ApiError(400, 'BAD_FORM', '上传格式错误')
  }
  const file = form.get('file')
  if (!(file instanceof File)) throw new ApiError(400, 'VALIDATION', '缺少文件')
  if (file.size <= 0) throw new ApiError(400, 'VALIDATION', '文件为空')
  if (file.size > MAX_SIZE) throw new ApiError(400, 'FILE_TOO_LARGE', '文件不能超过 8MB')
  const contentType = file.type || 'application/octet-stream'
  if (!contentType.startsWith('image/') && contentType !== 'application/pdf') {
    throw new ApiError(400, 'UNSUPPORTED_TYPE', '只支持图片或 PDF')
  }
  const scopeRaw = String(form.get('scope') ?? 'misc')
  const scope = SCOPES.has(scopeRaw) ? scopeRaw : 'misc'
  const month = shanghaiDateString().slice(0, 7)
  const key = `${scope}/${month}/${uuid()}.${extensionFor(contentType)}`
  const buffer = await file.arrayBuffer()
  await createStorage(c.env.BUCKET).put(key, buffer, contentType)
  return ok(c, { key, url: `/files/${key}` }, 201)
})

export default router

export async function serveStoredFile(c: Context<AppEnv>): Promise<Response> {
  const prefix = '/files/'
  const key = decodeURIComponent(c.req.path.slice(prefix.length))
  if (!key) return c.notFound()
  const object = await createStorage(c.env.BUCKET).get(key)
  if (!object?.body) return c.notFound()
  const headers = new Headers()
  headers.set('Content-Type', object.contentType ?? 'application/octet-stream')
  if (object.etag) headers.set('ETag', object.etag)
  headers.set('Cache-Control', 'public, max-age=31536000, immutable')
  return new Response(object.body, { headers })
}
