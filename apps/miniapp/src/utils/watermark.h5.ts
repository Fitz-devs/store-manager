import {
  buildWatermarkLines,
  getLocationText,
  type WatermarkedPhoto,
  type WatermarkContext,
} from './watermark-common'

export type { WatermarkContext } from './watermark-common'

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('image load failed'))
    image.src = src
  })
}

export async function watermarkPhoto(
  filePath: string,
  _canvasId: string,
  context: WatermarkContext,
): Promise<WatermarkedPhoto> {
  const locationText = await getLocationText()
  const lines = buildWatermarkLines(context, locationText)
  try {
    const image = await loadImage(filePath)
    const width = image.naturalWidth || image.width
    const height = image.naturalHeight || image.height
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return { path: filePath, lines }
    ctx.drawImage(image, 0, 0, width, height)
    const fontSize = Math.max(18, Math.round(width / 26))
    const lineHeight = fontSize + 10
    const boxHeight = lines.length * lineHeight + 24
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'
    ctx.fillRect(0, height - boxHeight, width, boxHeight)
    ctx.fillStyle = '#ffffff'
    ctx.font = `${fontSize}px sans-serif`
    lines.forEach((line, index) => {
      ctx.fillText(line, 20, height - boxHeight + 24 + (index + 1) * lineHeight - 8)
    })
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
    if (!blob) return { path: filePath, lines }
    const file = new File([blob], 'delivery.jpg', { type: 'image/jpeg' })
    return { path: URL.createObjectURL(blob), lines, file }
  } catch {
    return { path: filePath, lines }
  }
}
