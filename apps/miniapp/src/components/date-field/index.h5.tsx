import { useEffect, useRef } from 'react'
import { View } from '@tarojs/components'

export interface DateFieldProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export function DateField({ value, onChange, placeholder }: DateFieldProps) {
  const holderRef = useRef<any>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const holder = holderRef.current
    if (!holder) return
    const input = document.createElement('input')
    input.type = 'date'
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
    <View className="input picker-field" style={{ position: 'relative' }} ref={holderRef}>
      {value || placeholder || '选择日期'}
    </View>
  )
}
