import type { ReactNode } from 'react'
import { Picker } from '@tarojs/components'

export interface SelectFieldProps {
  range: string[]
  value: number
  onChange: (index: number) => void
  className?: string
  children: ReactNode
}

export function SelectField({ range, value, onChange, className, children }: SelectFieldProps) {
  return (
    <Picker
      className={className}
      mode="selector"
      range={range}
      value={value}
      onChange={(event) => onChange(Number(event.detail.value))}
    >
      {children}
    </Picker>
  )
}
