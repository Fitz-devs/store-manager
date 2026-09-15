import { Text, View } from '@tarojs/components'
import { formatFen } from '../../utils/format'
import './index.scss'

export interface TrendPoint {
  date: string
  value: number
}

export interface TrendSeries {
  key: string
  label: string
  color: string
  points: TrendPoint[]
}

/** Geometry matches .chart-plot (design px; Taro converts to rpx on weapp). */
const PAD_L = 24
const PAD_R = 24
const PAD_T = 28
const PAD_B = 36
const PLOT_W = 300
const PLOT_H = 180
const INNER_W = PLOT_W - PAD_L - PAD_R
const INNER_H = PLOT_H - PAD_T - PAD_B

/** View-only polyline chart (works on weapp + H5). */
export default function PriceLineChart({
  series,
  title = '价格趋势',
}: {
  series: TrendSeries[]
  title?: string
}) {
  const active = series.filter((s) => s.points.length >= 2)
  if (!active.length) {
    return (
      <View className="chart-card">
        <View className="chart-head">
          <Text className="chart-title">{title}</Text>
          <Text className="muted">数据不足</Text>
        </View>
        <View className="chart-empty">
          <Text className="muted">至少两次变动后才能画趋势</Text>
        </View>
      </View>
    )
  }

  const dateSet = new Set<string>()
  for (const s of active) for (const p of s.points) dateSet.add(p.date)
  const dates = [...dateSet].sort()

  const values: number[] = []
  for (const s of active) for (const p of s.points) values.push(p.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1

  const xOf = (date: string) => {
    if (dates.length <= 1) return PAD_L + INNER_W / 2
    return PAD_L + (INNER_W * dates.indexOf(date)) / (dates.length - 1)
  }
  const yOf = (value: number) => PAD_T + INNER_H * (1 - (value - min) / span)

  const segments: Array<{
    key: string
    left: number
    top: number
    width: number
    angle: number
    color: string
  }> = []
  const dots: Array<{ key: string; left: number; top: number; color: string; last: boolean }> = []
  const lastLabels: Array<{ key: string; left: number; top: number; color: string; text: string }> = []

  for (const s of active) {
    const coords = s.points.map((p) => ({ x: xOf(p.date), y: yOf(p.value) }))
    for (let i = 0; i < coords.length - 1; i++) {
      const a = coords[i]!
      const b = coords[i + 1]!
      const dx = b.x - a.x
      const dy = b.y - a.y
      const length = Math.sqrt(dx * dx + dy * dy)
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI
      segments.push({
        key: `${s.key}-seg-${i}`,
        left: a.x,
        top: a.y,
        width: length,
        angle,
        color: s.color,
      })
    }
    coords.forEach((c, i) => {
      dots.push({
        key: `${s.key}-dot-${i}`,
        left: c.x,
        top: c.y,
        color: s.color,
        last: i === coords.length - 1,
      })
    })
    const last = coords[coords.length - 1]!
    lastLabels.push({
      key: `${s.key}-last`,
      left: last.x,
      top: last.y,
      color: s.color,
      text: formatFen(s.points[s.points.length - 1]!.value),
    })
  }

  return (
    <View className="chart-card">
      <View className="chart-head">
        <Text className="chart-title">{title}</Text>
        <Text className="muted">
          {formatFen(min)}
          {min !== max ? ` ~ ${formatFen(max)}` : ''}
        </Text>
      </View>
      <View className="chart-legend">
        {active.map((s) => (
          <View key={s.key} className="chart-legend-item">
            <View className="chart-legend-dot" style={{ background: s.color }} />
            <Text className="muted">{s.label}</Text>
          </View>
        ))}
      </View>
      <View className="chart-plot">
        {[0, 0.5, 1].map((ratio) => (
          <View
            key={ratio}
            className="chart-guide"
            style={{ top: `${PAD_T + INNER_H * (1 - ratio)}px` }}
          />
        ))}
        {segments.map((seg) => (
          <View
            key={seg.key}
            className="chart-line"
            style={{
              left: `${seg.left}px`,
              top: `${seg.top}px`,
              width: `${seg.width}px`,
              background: seg.color,
              transform: `rotate(${seg.angle}deg)`,
            }}
          />
        ))}
        {dots.map((dot) => (
          <View
            key={dot.key}
            className={`chart-dot ${dot.last ? 'chart-dot-last' : ''}`}
            style={{
              left: `${dot.left}px`,
              top: `${dot.top}px`,
              background: dot.color,
            }}
          />
        ))}
        {lastLabels.map((label) => (
          <Text
            key={label.key}
            className="chart-last-label"
            style={{
              left: `${label.left}px`,
              top: `${label.top}px`,
              color: label.color,
            }}
          >
            {label.text}
          </Text>
        ))}
        {dates.map((date, index) => (
          <Text
            key={date}
            className="chart-x-label"
            style={{ left: `${xOf(date)}px` }}
          >
            {dates.length <= 5 || index % 2 === 0 || index === dates.length - 1 ? date.slice(5) : ''}
          </Text>
        ))}
      </View>
    </View>
  )
}
