import Taro from '@tarojs/taro'

export async function scanBarcode(): Promise<string | null> {
  try {
    const result = await Taro.scanCode({ scanType: ['barCode', 'qrCode'] })
    return result.result || null
  } catch {
    return null
  }
}
