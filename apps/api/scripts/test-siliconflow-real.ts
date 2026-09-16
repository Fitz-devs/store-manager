/**
 * 真实销售单 → SiliconFlow OCR 验证脚本
 * 用法: SILICONFLOW_KEY=sk-... bun scripts/test-siliconflow-real.ts [imagePath]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  DEFAULT_SILICONFLOW_OCR_MODEL,
  recognizeWithSiliconflow,
} from '../src/adapters/siliconflow-ocr'

const imagePath = resolve(process.argv[2] ?? 'tmp-samples/sales-receipt.jpg')
const apiKey = process.env.SILICONFLOW_KEY?.trim()
if (!apiKey) {
  console.error('缺少 SILICONFLOW_KEY（可从 apps/api/.dev.vars 读入环境）')
  process.exit(2)
}

const buf = readFileSync(imagePath)
console.log('image', imagePath, buf.byteLength, 'bytes')
console.log('model', process.env.SILICONFLOW_OCR_MODEL || DEFAULT_SILICONFLOW_OCR_MODEL)

const t0 = Date.now()
const result = await recognizeWithSiliconflow({
  apiKey,
  model: process.env.SILICONFLOW_OCR_MODEL,
  image: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  contentType: 'image/jpeg',
  imageKey: imagePath,
  pageIndex: 0,
})
console.log('elapsed_ms', Date.now() - t0)
console.log('model_used', result.model)
console.log('rows', result.draft.rows.length)
console.log('header', JSON.stringify(result.draft.headers[0], null, 2))
for (const row of result.draft.rows) {
  console.log(
    `  seq=${row.seq} box=${row.box_code} unit=${row.unit_code} name=${row.name} qty=${row.qty}${row.unit} price_fen=${row.unit_price_fen} conv=${row.conversion_guess}`,
  )
}
writeFileSync('/tmp/sf-ocr-raw.json', result.raw)
writeFileSync('/tmp/sf-ocr-draft.json', JSON.stringify(result.draft, null, 2))
console.log('raw → /tmp/sf-ocr-raw.json')
console.log('draft → /tmp/sf-ocr-draft.json')
