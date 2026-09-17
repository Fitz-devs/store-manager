import Taro from '@tarojs/taro'
import { IS_WEAPP } from './env'

export interface MapPoint {
  lat: number
  lng: number
  address?: string | null
  name?: string | null
}

export interface PickedLocation {
  name: string
  address: string
  lat: number
  lng: number
}

export function hasCoords(point: { lat?: number | null; lng?: number | null }): boolean {
  return typeof point.lat === 'number' && typeof point.lng === 'number' && Number.isFinite(point.lat) && Number.isFinite(point.lng)
}

/** 微信 chooseLocation：name 多为 POI（沙元埔），address 常只有区级行政路径，需拼接 */
export function formatPickedAddress(picked: { name?: string | null; address?: string | null }): string {
  const name = (picked.name || '').trim()
  const addr = (picked.address || '').trim()
  if (!addr) return name
  if (!name) return addr
  if (addr.includes(name)) return addr
  return `${addr} ${name}`
}

export async function copyAddress(address: string): Promise<void> {
  await Taro.setClipboardData({ data: address })
}

export async function pickMapLocation(keyword?: string): Promise<PickedLocation | null> {
  if (!IS_WEAPP) {
    Taro.showToast({ title: '请在微信小程序中地图选点', icon: 'none' })
    return null
  }
  try {
    const result = await Taro.chooseLocation({
      keyword: keyword?.trim() || undefined,
    })
    if (typeof result.latitude !== 'number' || typeof result.longitude !== 'number') return null
    return {
      name: result.name?.trim() || '',
      address: result.address?.trim() || '',
      lat: result.latitude,
      lng: result.longitude,
    }
  } catch (error) {
    const message = (error as Error).message ?? ''
    if (!message.toLowerCase().includes('cancel')) {
      Taro.showToast({ title: message || '选点失败', icon: 'none' })
    }
    return null
  }
}

function amapNavigationUrl(point: MapPoint): string {
  const name = encodeURIComponent(point.name || point.address || '目的地')
  const to = `${point.lng.toFixed(6)},${point.lat.toFixed(6)},${name}`
  return `https://uri.amap.com/navigation?to=${to}&mode=car&policy=1&src=store-manager&coordinate=gaode&callnative=1`
}

export async function openMapForNavigation(point: MapPoint): Promise<'opened' | 'picked-later' | 'copied'> {
  const address = formatPickedAddress({ name: point.name, address: point.address })
  const title = address || '送货地址'
  if (hasCoords(point)) {
    if (IS_WEAPP) {
      await Taro.openLocation({
        latitude: point.lat!,
        longitude: point.lng!,
        name: title,
        address,
        scale: 16,
      })
      return 'opened'
    }
    if (typeof window !== 'undefined') {
      window.open(
        amapNavigationUrl({ ...point, name: title, address }),
        '_blank',
        'noopener,noreferrer',
      )
      return 'opened'
    }
  }

  if (!address) {
    Taro.showToast({ title: '没有可导航的地址', icon: 'none' })
    return 'picked-later'
  }

  if (IS_WEAPP) {
    return 'picked-later'
  }

  await copyAddress(address)
  Taro.showToast({ title: '已复制地址，请粘贴到地图', icon: 'none' })
  return 'copied'
}

export async function promptMapFallback(address: string): Promise<'pick' | 'copy' | 'cancel'> {
  if (!IS_WEAPP) {
    await copyAddress(address)
    Taro.showToast({ title: '已复制地址，请粘贴到地图', icon: 'none' })
    return 'copy'
  }
  const result = await Taro.showActionSheet({
    itemList: ['地图选点补全', '复制地址'],
  }).catch(() => ({ tapIndex: -1 }))
  if (result.tapIndex === 0) return 'pick'
  if (result.tapIndex === 1) {
    await copyAddress(address)
    Taro.showToast({ title: '已复制地址', icon: 'success' })
    return 'copy'
  }
  return 'cancel'
}
