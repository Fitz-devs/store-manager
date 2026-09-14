import { useEffect, useRef } from 'react'
import { View } from '@tarojs/components'

export interface DateTimeFieldProps {
  date: string
  time: string
  onDateChange: (value: string) => void
  onTimeChange: (value: string) => void
}

interface NativeFieldProps {
  mode: 'date' | 'time'
  value: string
  label: string
  onChange: (value: string) => void
}

function NativeField({ mode, value, label, onChange }: NativeFieldProps) {
  const holderRef = useRef<any>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const holder = holderRef.current
    if (!holder) return
    const input = document.createElement('input')
    input.type = mode
    input.value = value
    input.setAttribute('style', 'position:absolute;inset:0;width:100%;height:100%;opacity:0;border:0;padding:0;margin:0;')
    input.addEventListener('change', () => onChange(input.value))
    holder.appendChild(input)
    inputRef.current = input
    return () => {
      input.remove()
      inputRef.current = null
    }
  }, [])

  useEffect(() => {
    if (inputRef.current && inputRef.current.value !== value) inputRef.current.value = value
  }, [value])

  return (
    <View className="input picker-field picker-half" ref={holderRef}>
      {label} {value}
    </View>
  )
}

export function DateTimeField({ date, time, onDateChange, onTimeChange }: DateTimeFieldProps) {
  return (
    <>
      <NativeField mode="date" value={date} label="送达日期" onChange={onDateChange} />
      <NativeField mode="time" value={time} label="送达时间" onChange={onTimeChange} />
    </>
  )
}
