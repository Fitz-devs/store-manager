import { Hono } from 'hono'
import { ocrRequestSchema } from '@sm/shared'
import type { AppEnv } from '../env'
import { createAi } from '../adapters/ai'
import { createStorage } from '../adapters/storage'
import { ApiError, ok, parseBody } from '../lib/errors'

const router = new Hono<AppEnv>()

router.post('/purchase', async (c) => {
  const { image_key } = await parseBody(c, ocrRequestSchema)
  const storage = createStorage(c.env.BUCKET)
  const object = await storage.get(image_key)
  if (!object?.body) throw new ApiError(404, 'FILE_NOT_FOUND', '图片不存在')
  const buffer = await new Response(object.body).arrayBuffer()
  if (buffer.byteLength > 8 * 1024 * 1024) {
    throw new ApiError(400, 'FILE_TOO_LARGE', '图片过大，请压缩后重试')
  }
  const ai = createAi(c.env.AI, c.env.OCR_MODEL)
  const result = await ai.recognizePurchaseReceipt(buffer, object.contentType ?? 'image/jpeg')
  return ok(c, result)
})

export default router
