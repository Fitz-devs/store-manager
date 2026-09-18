import { API_BASE } from '../config'
import { getToken } from '../api/client'
import type { LocalImage, PickSource, UploadScope } from './media-common'
import type { LibheifModule } from 'libheif-js/libheif-wasm/libheif-bundle.mjs'

export type { UploadScope, LocalImage, PickSource } from './media-common'

const UPLOAD_MAX_SIDE = 1600

export async function pickImages(
  options: { count?: number; camera?: boolean; source?: PickSource } = {},
): Promise<LocalImage[]> {
  // camera: true 兼容旧行为 = both（可拍可选）；显式 source 优先
  const source: PickSource =
    options.source ?? (options.camera ? 'both' : 'album')
  return new Promise<LocalImage[]>((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.multiple = (options.count ?? 1) > 1
    // 仅「只拍照」时强制相机；both/album 必须可选系统相册
    if (source === 'camera') input.setAttribute('capture', 'environment')
    input.onchange = () => {
      const files = Array.from(input.files ?? [])
      if (!files.length) {
        reject(new Error('cancel'))
        return
      }
      resolve(files.map((file) => ({ path: URL.createObjectURL(file), file })))
    }
    input.click()
  })
}

// file.type 按来源/扩展名声明，不可靠；HEIC/HEIF 的 ftyp 品牌盒固定在文件头
async function isHeicFile(file: File): Promise<boolean> {
  try {
    const buffer = await file.slice(0, 64).arrayBuffer()
    return /ftyp(hei[cmxs]|hev[msx]|mif1|msf1)/.test(String.fromCharCode(...new Uint8Array(buffer)))
  } catch {
    return false
  }
}

// WASM 实例跨上传复用（emscripten 工厂自身不缓存）；浏览器版 bundle（wasm 内联），主入口为 Node 版会引入 fs 依赖
let libheifModule: Promise<LibheifModule> | null = null
function getLibheifModule(): Promise<LibheifModule> {
  if (!libheifModule) {
    libheifModule = import('libheif-js/libheif-wasm/libheif-bundle.mjs').then((m) => m.default())
  }
  return libheifModule
}

async function decodeHeicToImageData(file: File): Promise<ImageData> {
  const libheif = await getLibheifModule()
  const pages = new libheif.HeifDecoder().decode(new Uint8Array(await file.arrayBuffer()))
  const image = pages[0]
  if (!image) throw new Error('HEIC 图片解析失败')
  const width = image.get_width()
  const height = image.get_height()
  const data = new Uint8ClampedArray(width * height * 4)
  try {
    await new Promise<void>((resolve, reject) => {
      image.display({ data, width, height }, (result) =>
        result ? resolve() : reject(new Error('HEIC 图片解析失败')),
      )
    })
  } finally {
    image.free()
  }
  return new ImageData(data, width, height)
}

// canvas 仅作为浏览器原生解码后的像素读取桥，不参与压缩编码；直接绘制到目标尺寸，
// 规避 iOS WebKit 全尺寸画布的面积上限（超大图静默产出空白像素）
async function decodeToImageData(file: File): Promise<ImageData> {
  if (await isHeicFile(file)) return decodeHeicToImageData(file)
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, UPLOAD_MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('图片解码失败')
  context.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height, 0, 0, width, height)
  return context.getImageData(0, 0, width, height)
}

function downscaleImageData(source: ImageData, maxSide: number): ImageData {
  const scale = Math.min(1, maxSide / Math.max(source.width, source.height))
  if (scale >= 1) return source
  const width = Math.max(1, Math.round(source.width * scale))
  const height = Math.max(1, Math.round(source.height * scale))
  const result = new ImageData(width, height)
  const src = source.data
  const dst = result.data
  for (let y = 0; y < height; y++) {
    const sy0 = Math.floor((y * source.height) / height)
    const sy1 = Math.max(sy0 + 1, Math.floor(((y + 1) * source.height) / height))
    for (let x = 0; x < width; x++) {
      const sx0 = Math.floor((x * source.width) / width)
      const sx1 = Math.max(sx0 + 1, Math.floor(((x + 1) * source.width) / width))
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          const i = (sy * source.width + sx) * 4
          r += src[i]
          g += src[i + 1]
          b += src[i + 2]
          a += src[i + 3]
        }
      }
      const count = (sx1 - sx0) * (sy1 - sy0)
      const offset = (y * width + x) * 4
      dst[offset] = r / count
      dst[offset + 1] = g / count
      dst[offset + 2] = b / count
      dst[offset + 3] = a / count
    }
  }
  return result
}

async function prepareH5Upload(file: File): Promise<File> {
  let imageData: ImageData
  try {
    imageData = await decodeToImageData(file)
  } catch {
    // 解不开的图（老环境 HEIC 等）绝不原样上传，否则安卓端无法显示
    throw new Error('当前浏览器无法处理该图片，请改用 JPG/PNG 图片')
  }
  const scaled = downscaleImageData(imageData, UPLOAD_MAX_SIDE)
  const { encode: encodeJpeg } = await import('@jsquash/jpeg')
  const jpegBuffer = await encodeJpeg(scaled, { quality: 80 })
  const baseName = file.name.replace(/\.\w+$/, '') || 'upload'
  return new File([jpegBuffer], `${baseName}.jpg`, { type: 'image/jpeg' })
}

export async function uploadLocalImage(
  image: LocalImage,
  scope: UploadScope,
): Promise<{ key: string; url: string }> {
  let file = image.file
  if (!file) {
    const response = await fetch(image.path)
    const blob = await response.blob()
    file = new File([blob], 'upload.jpg', { type: blob.type || 'image/jpeg' })
  }
  const finalFile = await prepareH5Upload(file)
  const form = new FormData()
  form.append('file', finalFile)
  form.append('scope', scope)
  const response = await fetch(`${API_BASE}/api/files`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getToken()}` },
    body: form,
  })
  const body = (await response.json()) as {
    ok: boolean
    data?: { key: string; url: string }
    error?: { message?: string }
  }
  if (!response.ok || !body.ok || !body.data) {
    throw new Error(body.error?.message ?? `上传失败(${response.status})`)
  }
  return body.data
}
