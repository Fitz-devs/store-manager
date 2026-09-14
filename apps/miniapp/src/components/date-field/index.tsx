import { Picker, View } from '@tarojs/components'
import { todayString } from '../../utils/format'

export interface DateFieldProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export function DateField({ value, onChange, placeholder }: DateFieldProps) {
  return (
    <Picker
      mode="date"
      value={value || todayString()}
      onChange={(event) => onChange(String(event.detail.value))}
    >
      <View className="input picker-field">{value || placeholder || '选择日期'}</View>
    </Picker>
  )
}
