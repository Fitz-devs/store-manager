import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const SIZE = 81
const STROKE = 5.5
const INACTIVE = [138, 143, 153]
const ACTIVE = [47, 107, 255]

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

const sdCircle = (x, y, cx, cy, r) => Math.hypot(x - cx, y - cy) - r

const sdRoundBox = (x, y, cx, cy, halfW, halfH, r) => {
  const dx = Math.abs(x - cx) - (halfW - r)
  const dy = Math.abs(y - cy) - (halfH - r)
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - r
}

const sdSegment = (x, y, ax, ay, bx, by, thickness) => {
  const pax = x - ax
  const pay = y - ay
  const bax = bx - ax
  const bay = by - ay
  const t = clamp((pax * bax + pay * bay) / (bax * bax + bay * bay), 0, 1)
  return Math.hypot(pax - bax * t, pay - bay * t) - thickness / 2
}

const union = (...distances) => Math.min(...distances)
const intersect = (...distances) => Math.max(...distances)
const outline = (distance, width) => Math.abs(distance) - width / 2

const icons = {
  order: (x, y) =>
    union(
      outline(sdRoundBox(x, y, 40.5, 41.5, 23, 27, 8), STROKE),
      sdSegment(x, y, 28, 30, 53, 30, 4),
      sdSegment(x, y, 28, 41.5, 53, 41.5, 4),
      sdSegment(x, y, 28, 53, 44, 53, 4),
    ),
  orders: (x, y) =>
    union(
      outline(sdRoundBox(x, y, 38, 41.5, 21, 27, 8), STROKE),
      sdSegment(x, y, 29, 42, 36, 50, STROKE),
      sdSegment(x, y, 36, 50, 51, 31, STROKE),
    ),
  product: (x, y) =>
    union(
      outline(sdRoundBox(x, y, 40.5, 47, 23, 25, 6), STROKE),
      outline(intersect(sdCircle(x, y, 40.5, 26, 15), y - 26), 5),
    ),
  purchase: (x, y) =>
    union(
      sdSegment(x, y, 17, 50, 17, 67, STROKE),
      sdSegment(x, y, 64, 50, 64, 67, STROKE),
      sdSegment(x, y, 17, 67, 64, 67, STROKE),
      sdSegment(x, y, 40.5, 14, 40.5, 44, STROKE),
      sdSegment(x, y, 40.5, 47, 29.5, 34, STROKE),
      sdSegment(x, y, 40.5, 47, 51.5, 34, STROKE),
    ),
  customer: (x, y) =>
    outline(
      union(
        sdCircle(x, y, 40.5, 26, 11.5),
        intersect(sdCircle(x, y, 40.5, 76, 36), y - 63),
      ),
      STROKE,
    ),
  me: (x, y) =>
    union(
      outline(sdCircle(x, y, 40.5, 40.5, 29), STROKE),
      outline(
        union(
          sdCircle(x, y, 40.5, 31, 8),
          intersect(sdCircle(x, y, 40.5, 64, 27), y - 53),
        ),
        5,
      ),
    ),
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buffer) {
  let crc = 0xffffffff
  for (let i = 0; i < buffer.length; i += 1) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buffer[i]) & 0xff]
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const typeBuffer = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])))
  return Buffer.concat([length, typeBuffer, data, crc])
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  }
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function render(icon, color) {
  const rgba = Buffer.alloc(SIZE * SIZE * 4)
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const coverage = clamp(0.5 - icon(x + 0.5, y + 0.5), 0, 1)
      if (coverage <= 0) continue
      const index = (y * SIZE + x) * 4
      rgba[index] = color[0]
      rgba[index + 1] = color[1]
      rgba[index + 2] = color[2]
      rgba[index + 3] = Math.round(coverage * 255)
    }
  }
  return encodePng(SIZE, SIZE, rgba)
}

const outputDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'assets', 'tabbar')
mkdirSync(outputDir, { recursive: true })

for (const [name, icon] of Object.entries(icons)) {
  writeFileSync(join(outputDir, `${name}.png`), render(icon, INACTIVE))
  writeFileSync(join(outputDir, `${name}-active.png`), render(icon, ACTIVE))
}

console.log(`generated ${Object.keys(icons).length * 2} icons in ${outputDir}`)
