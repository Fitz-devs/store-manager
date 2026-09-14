import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { View } from '@tarojs/components'

export interface SelectFieldProps {
  range: string[]
  value: number
  onChange: (index: number) => void
  className?: string
  children: ReactNode
}

export function SelectField({ range, value, onChange, className, children }: SelectFieldProps) {
  const holderRef = useRef<any>(null)
  const selectRef = useRef<HTMLSelectElement | null>(null)

  useEffect(() => {
    const holder = holderRef.current
    if (!holder) return
    const select = document.createElement('select')
    select.setAttribute('style', 'position:absolute;inset:0;width:100%;height:100%;opacity:0;border:0;padding:0;margin:0;')
    range.forEach((item, index) => {
      const option = document.createElement('option')
      option.value = String(index)
      option.textContent = item
      select.appendChild(option)
    })
    select.selectedIndex = value
    select.addEventListener('change', () => onChange(select.selectedIndex))
    holder.appendChild(select)
    selectRef.current = select
    return () => {
      select.remove()
      selectRef.current = null
    }
  }, [])

  useEffect(() => {
    if (selectRef.current) selectRef.current.selectedIndex = value
  }, [value])

  return (
    <View className={className} style={{ position: 'relative' }} ref={holderRef}>
      {children}
    </View>
  )
}
