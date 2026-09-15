import { useEffect, useRef } from 'react'
import { Input, Text, View } from '@tarojs/components'

interface Props {
  value: string
  onChange: (value: string) => void
  onSearch: (value: string) => void
  placeholder?: string
  debounceMs?: number
}

export function SearchBox({
  value,
  onChange,
  onSearch,
  placeholder = '搜索',
  debounceMs = 350,
}: Props) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const valueRef = useRef(value)
  valueRef.current = value

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  const emit = (next: string, immediate = false) => {
    onChange(next)
    if (timer.current) clearTimeout(timer.current)
    if (immediate) {
      onSearch(next)
      return
    }
    timer.current = setTimeout(() => onSearch(valueRef.current), debounceMs)
  }

  return (
    <View className="sm-search">
      <Text className="sm-search-icon">🔍</Text>
      <Input
        className="sm-search-input"
        placeholder={placeholder}
        value={value}
        confirmType="search"
        onInput={(event) => emit(event.detail.value)}
        onConfirm={() => {
          if (timer.current) clearTimeout(timer.current)
          onSearch(value)
        }}
      />
      {value ? (
        <Text
          className="sm-search-clear"
          onClick={() => {
            if (timer.current) clearTimeout(timer.current)
            onChange('')
            onSearch('')
          }}
        >
          ✕
        </Text>
      ) : null}
    </View>
  )
}
