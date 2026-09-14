import { Picker, View } from '@tarojs/components'

export interface DateTimeFieldProps {
  date: string
  time: string
  onDateChange: (value: string) => void
  onTimeChange: (value: string) => void
}

export function DateTimeField({ date, time, onDateChange, onTimeChange }: DateTimeFieldProps) {
  return (
    <>
      <Picker
        className="picker-half"
        mode="date"
        value={date}
        onChange={(event) => onDateChange(String(event.detail.value))}
      >
        <View className="input picker-field">送达日期 {date}</View>
      </Picker>
      <Picker
        className="picker-half"
        mode="time"
        value={time}
        onChange={(event) => onTimeChange(String(event.detail.value))}
      >
        <View className="input picker-field">送达时间 {time}</View>
      </Picker>
    </>
  )
}
