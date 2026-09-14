import Taro from '@tarojs/taro'
import {
  buildWatermarkLines,
  getLocationText,
  type WatermarkedPhoto,
  type WatermarkContext,
} from './watermark-common'

export type { WatermarkContext } from './watermark-common'

export async function watermarkPhoto(
  filePath: string,
  canvasId: string,
  context: WatermarkContext,
): Promise<WatermarkedPhoto> {
  const locationText = await getLocationText()
  const lines = buildWatermarkLines(context, locationText)
  try {
    const info = await Taro.getImageInfo({ src: filePath })
    const node = await new Promise<any>((resolve) => {
      Taro.createSelectorQuery()
        .select(`#${canvasId}`)
        .fields({ node: true, size: true })
        .exec((res) => resolve(res?.[0] ?? null))
    })
    if (!node?.node) return { path: filePath, lines }
    const canvas = node.node
    canvas.width = info.width
    canvas.height = info.height
    const ctx = canvas.getContext('2d')
    const image = canvas.createImage()
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('image load failed'))
      image.src = filePath
    })
    ctx.drawImage(image, 0, 0, info.width, info.height)
    const fontSize = Math.max(18, Math.round(info.width / 26))
    const lineHeight = fontSize + 10
    const boxHeight = lines.length * lineHeight + 24
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'
    ctx.fillRect(0, info.height - boxHeight, info.width, boxHeight)
    ctx.fillStyle = '#ffffff'
    ctx.font = `${fontSize}px sans-serif`
    lines.forEach((line, index) => {
      ctx.fillText(line, 20, info.height - boxHeight + 24 + (index + 1) * lineHeight - 8)
    })
    const out = await new Promise<any>((resolve) => {
      Taro.canvasToTempFilePath({
        canvas,
        x: 0,
        y: 0,
        width: info.width,
        height: info.height,
        destWidth: info.width,
        destHeight: info.height,
        success: resolve,
        fail: () => resolve(null),
      } as any)
    })
    return { path: out?.tempFilePath ?? filePath, lines }
  } catch {
    return { path: filePath, lines }
  }
}
