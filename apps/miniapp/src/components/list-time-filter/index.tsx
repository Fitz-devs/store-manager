import { useState } from 'react'
import { Text, View } from '@tarojs/components'
import { DateRangeField } from '../date-range-field'
import './index.scss'

export interface ListTimeFilterProps {
  from: string
  to: string
  onChange: (from: string, to: string) => void
}

/** 列表页「时间」筛选：chip 展开日期区间，变更即由父级刷新 */
export function ListTimeFilter({ from, to, onChange }: ListTimeFilterProps) {
  const [open, setOpen] = useState(false)
  const active = Boolean(from || to)

  return (
    <View className="list-time-filter">
      <View className="list-time-filter-chips">
        <View
          className={`list-time-filter-chip ${active || open ? 'list-time-filter-chip-active' : ''}`}
          onClick={() => setOpen((prev) => !prev)}
        >
          <Text className="list-time-filter-chip-text">时间{active ? ' · 已设' : ''}</Text>
        </View>
        {active ? (
          <View
            className="list-time-filter-chip"
            onClick={() => {
              onChange('', '')
            }}
          >
            <Text className="list-time-filter-chip-text">清除时间</Text>
          </View>
        ) : null}
        {active ? (
          <Text className="muted list-time-filter-range">
            {from || '不限'} ~ {to || '不限'}
          </Text>
        ) : null}
      </View>
      {open ? (
        <View className="list-time-filter-panel">
          <DateRangeField
            start={from}
            end={to}
            onStartChange={(value) => onChange(value, to)}
            onEndChange={(value) => onChange(from, value)}
          />
        </View>
      ) : null}
    </View>
  )
}
