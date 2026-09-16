/**
 * 真实销售单 → 智谱 glm-ocr 验证
 * 用法: ZHIPU_API_KEY=... bun scripts/test-zhipu-real.ts [imagePath]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  DEFAULT_ZHIPU_TEXT_MODEL,
  recognizeWithZhipuOcr,
} from '../src/adapters/zhipu-ocr'

const imagePath = resolve(process.argv[2] ?? 'tmp-samples/sales-receipt.jpg')
const apiKey = process.env.ZHIPU_API_KEY?.trim()
if (!apiKey) {
  console.error('缺少 ZHIPU_API_KEY')
  process.exit(2)
}

const buf = readFileSync(imagePath)
console.log('image', imagePath, buf.byteLength, 'bytes')
const t0 = Date.now()
try {
  const result = await recognizeWithZhipuOcr({
    apiKey,
    image: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    contentType: 'image/jpeg',
    imageKey: imagePath,
    pageIndex: 0,
  })
  console.log('elapsed_ms', Date.now() - t0)
  console.log('model', result.model)
  console.log('rows', result.draft.rows.length)
  console.log('header', JSON.stringify(result.draft.headers[0], null, 2))
  for (const row of result.draft.rows) {
    console.log(
      `  seq=${row.seq} box=${row.box_code} unit=${row.unit_code} name=${row.name} qty=${row.qty}${row.unit} price_fen=${row.unit_price_fen} conv=${row.conversion_guess}`,
    )
  }
  writeFileSync('/tmp/zhipu-ocr-raw.json', result.raw)
  writeFileSync('/tmp/zhipu-ocr-draft.json', JSON.stringify(result.draft, null, 2))
  console.log('raw → /tmp/zhipu-ocr-raw.json')
} catch (error) {
  console.error('FAIL', error)
  process.exit(1)
}
void DEFAULT_ZHIPU_TEXT_MODEL
