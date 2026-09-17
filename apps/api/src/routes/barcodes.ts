import { Hono } from 'hono'
import { z } from 'zod'
import { barcodeCreateSchema, barcodeEnrichSchema, barcodeInputSchema } from '@sm/shared'
import type { AppEnv } from '../env'
import { ApiError, ok, parseBody } from '../lib/errors'
import { addBarcode, deleteBarcode, updateBarcode } from '../services/products'
import { enrichBarcode, lookupBarcode, upsertBarcodeCache } from '../services/barcodes'

const router = new Hono<AppEnv>()

const idSchema = z.coerce.number().int().positive()

router.get('/lookup', async (c) => {
  const code = (c.req.query('code') ?? '').trim()
  if (!code) throw new ApiError(400, 'VALIDATION', '缺少 code 参数')
  const result = await lookupBarcode(c.get('database').db, code, {
    taobaoAppKey: c.env.TB_APP_KEY,
    taobaoAppSecret: c.env.TB_APP_SECRET,
    aliMarketUrl: c.env.ALI_MARKET_BARCODE_URL,
    aliMarketAppCode: c.env.ALI_MARKET_APPCODE,
    apiZeroKey: c.env.APIZERO_KEY,
    barcodeSpiderToken: c.env.BARCODESPIDER_TOKEN,
  })
  return ok(c, result)
})

router.post('/enrich', async (c) => {
  const { code } = await parseBody(c, barcodeEnrichSchema)
  const enriched = await enrichBarcode(code, {
    taobaoAppKey: c.env.TB_APP_KEY,
    taobaoAppSecret: c.env.TB_APP_SECRET,
    aliMarketUrl: c.env.ALI_MARKET_BARCODE_URL,
    aliMarketAppCode: c.env.ALI_MARKET_APPCODE,
    apiZeroKey: c.env.APIZERO_KEY,
    barcodeSpiderToken: c.env.BARCODESPIDER_TOKEN,
  })
  if (!enriched) throw new ApiError(404, 'NOT_FOUND', '公开接口未查询到该条码')
  await upsertBarcodeCache(c.get('database').db, enriched.entry)
  return ok(c, enriched.entry)
})

router.post('/', async (c) => {
  const input = await parseBody(c, barcodeCreateSchema)
  const barcode = await addBarcode(c.get('database').db, input)
  return ok(c, barcode, 201)
})

router.patch('/:id', async (c) => {
  const id = idSchema.parse(c.req.param('id'))
  const input = await parseBody(c, barcodeInputSchema.partial())
  const barcode = await updateBarcode(c.get('database').db, id, input)
  if (!barcode) throw new ApiError(404, 'BARCODE_NOT_FOUND', '条码不存在')
  return ok(c, barcode)
})

router.delete('/:id', async (c) => {
  const id = idSchema.parse(c.req.param('id'))
  await deleteBarcode(c.get('database').db, id)
  return ok(c, { deleted: true })
})

export default router
