import { Picker, View } from '@tarojs/components'
import { todayString } from '../../utils/format'

export interface DateRangeFieldProps {
  start: string
  end: string
  onStartChange: (value: string) => void
  onEndChange: (value: string) => void
}

export function DateRangeField({ start, end, onStartChange, onEndChange }: DateRangeFieldProps) {
  return (
    <>
      <Picker
        className="picker-half"
        mode="date"
        value={start || todayString()}
        onChange={(event) => onStartChange(String(event.detail.value))}
      >
        <View className="input picker-field">开始 {start || '不限'}</View>
      </Picker>
      <Picker
        className="picker-half"
        mode="date"
        value={end || todayString()}
        onChange={(event) => onEndChange(String(event.detail.value))}
      >
        <View className="input picker-field">结束 {end || '不限'}</View>
      </Picker>
    </>
  )
}
