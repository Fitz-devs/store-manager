import Taro from '@tarojs/taro'
import { getToken, uploadImage } from '../api/client'
import { API_BASE } from '../config'
import { IS_WEAPP } from './env'

export type UploadScope = 'products' | 'purchases' | 'deliveries' | 'misc'

export interface LocalImage {
  path: string
  file?: File
}

export async function pickImages(options: { count?: number; camera?: boolean } = {}): Promise<LocalImage[]> {
  if (IS_WEAPP) {
    const media = await Taro.chooseMedia({
      count: options.count ?? 1,
      mediaType: ['image'],
      sourceType: options.camera ? ['camera', 'album'] : ['album', 'camera'],
      sizeType: ['compressed'],
    })
    return media.tempFiles.map((item) => ({ path: item.tempFilePath }))
  }
  return new Promise<LocalImage[]>((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.multiple = (options.count ?? 1) > 1
    if (options.camera) input.setAttribute('capture', 'environment')
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

async function compressImageFile(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file
  if (file.size <= 1.2 * 1024 * 1024) return file
  try {
    const bitmap = await createImageBitmap(file)
    const maxSide = 1600
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (!context) return file
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8))
    if (!blob) return file
    return new File([blob], `${file.name.replace(/\.\w+$/, '')}.jpg`, { type: 'image/jpeg' })
  } catch {
    return file
  }
}

export async function uploadLocalImage(
  image: LocalImage,
  scope: UploadScope,
): Promise<{ key: string; url: string }> {
  if (IS_WEAPP) {
    const compressed = await Taro.compressImage({ src: image.path, quality: 80 })
    return uploadImage(compressed.tempFilePath, scope)
  }
  let file = image.file
  if (!file) {
    const response = await fetch(image.path)
    const blob = await response.blob()
    file = new File([blob], 'upload.jpg', { type: blob.type || 'image/jpeg' })
  }
  const finalFile = await compressImageFile(file)
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
