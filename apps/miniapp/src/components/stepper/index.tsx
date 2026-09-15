import { Text, View } from '@tarojs/components'

interface Props {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  onRemoveAtMin?: () => void
}

/** Cross-platform qty stepper. Uses custom markup so − at min can trigger remove. */
export function Stepper({ value, onChange, min = 0, max = 9999, onRemoveAtMin }: Props) {
  const decrease = () => {
    if (value <= min) {
      onRemoveAtMin?.()
      return
    }
    onChange(value - 1)
  }
  const increase = () => {
    if (value >= max) return
    onChange(value + 1)
  }

  return (
    <View className="sm-stepper">
      <View className="sm-stepper-btn" onClick={decrease}>
        −
      </View>
      <Text className="sm-stepper-value">{value}</Text>
      <View className="sm-stepper-btn" onClick={increase}>
        ＋
      </View>
    </View>
  )
}
