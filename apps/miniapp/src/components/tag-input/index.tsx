import { useState } from 'react'
import { Input, Text, View } from '@tarojs/components'
import './index.scss'

interface TagInputProps {
  values: string[]
  onChange: (values: string[]) => void
  placeholder?: string
  maxLength?: number
}

export function TagInput({ values, onChange, placeholder, maxLength = 30 }: TagInputProps) {
  const [draft, setDraft] = useState('')

  const add = () => {
    const text = draft.trim()
    if (!text) return
    if (values.includes(text)) {
      setDraft('')
      return
    }
    onChange([...values, text.slice(0, maxLength)])
    setDraft('')
  }

  return (
    <View>
      {values.length > 0 && (
        <View className="tag-input-chips">
          {values.map((item) => (
            <View
              key={item}
              className="tag-input-chip"
              onClick={() => onChange(values.filter((value) => value !== item))}
            >
              <Text>{item}</Text>
              <Text className="tag-input-remove">×</Text>
            </View>
          ))}
        </View>
      )}
      <View className="tag-input-row">
        <Input
          className="input tag-input-field"
          placeholder={placeholder ?? '输入后点添加'}
          value={draft}
          maxlength={maxLength}
          confirmType="done"
          onInput={(event) => setDraft(event.detail.value)}
          onConfirm={add}
        />
        <View className="tag-input-add" onClick={add}>
          <Text>＋ 添加</Text>
        </View>
      </View>
    </View>
  )
}
