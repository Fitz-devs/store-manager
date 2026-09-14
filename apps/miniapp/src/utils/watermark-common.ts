import Taro from '@tarojs/taro'

export interface WatermarkContext {
  address?: string | null
  operator?: string | null
}

export interface WatermarkedPhoto {
  path: string
  lines: string[]
  file?: File
}

export async function getLocationText(): Promise<string | null> {
  try {
    const location = await Taro.getLocation({ type: 'gcj02' })
    return `GPS ${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`
  } catch {
    return null
  }
}

export function buildWatermarkLines(context: WatermarkContext, locationText: string | null): string[] {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const time = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  const lines = [time]
  if (context.address) lines.push(`送货至：${context.address}`)
  if (locationText) lines.push(locationText)
  if (context.operator) lines.push(`送货人：${context.operator}`)
  return lines
}
