import { Text, View } from '@tarojs/components'

interface Props {
  loading: boolean
  hasItems: boolean
  shown: number
  total: number
  unit?: string
}

/** List footer: first-load spinner, load-more hint, or end-of-list. */
export function ListLoading({ loading, hasItems, shown, total, unit = '条' }: Props) {
  if (loading && !hasItems) {
    return <View className="empty">加载中…</View>
  }
  if (loading && hasItems) {
    return <View className="sm-list-footer">加载中…</View>
  }
  if (!hasItems) return null
  return (
    <View className="sm-list-footer">
      {shown < total ? '上滑加载更多…' : `到底了，共 ${total} ${unit}`}
    </View>
  )
}
