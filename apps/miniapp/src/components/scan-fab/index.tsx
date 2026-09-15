import Taro from '@tarojs/taro'
import { Text, View } from '@tarojs/components'
import { scanBarcode } from '../../utils/scan'
import { scanAndGo } from '../../utils/scanGo'
import { H5_TABBAR_HEIGHT, IS_WEAPP } from '../../utils/env'
import './index.scss'

export default function ScanFab({
  mode = 'browse',
  label = '扫码',
  icon = 'scan',
  onOrderScan,
  onCustomTap,
}: {
  mode?: 'browse' | 'order'
  label?: string
  icon?: 'scan' | 'camera'
  onOrderScan?: (code: string) => void
  onCustomTap?: () => void | Promise<void>
}) {
  const tap = async () => {
    if (onCustomTap) {
      await onCustomTap()
      return
    }
    const code = await scanBarcode()
    if (!code) return
    if (mode === 'order' && onOrderScan) {
      onOrderScan(code)
      return
    }
    scanAndGo(code)
  }

  const fabStyle = IS_WEAPP
    ? undefined
    : { bottom: `calc(${140 + H5_TABBAR_HEIGHT}px + env(safe-area-inset-bottom))` }

  return (
    <View className="scan-fab" style={fabStyle} onClick={tap}>
      {icon === 'camera' ? (
        <View className="scan-fab-camera">
          <View className="scan-fab-camera-top" />
          <View className="scan-fab-camera-body">
            <View className="scan-fab-camera-lens" />
          </View>
        </View>
      ) : (
        <View className="scan-fab-bars">
          <View className="scan-fab-bar" />
          <View className="scan-fab-bar scan-fab-bar-wide" />
          <View className="scan-fab-bar" />
          <View className="scan-fab-bar scan-fab-bar-wide" />
        </View>
      )}
      <Text className="scan-fab-label">{label}</Text>
    </View>
  )
}
