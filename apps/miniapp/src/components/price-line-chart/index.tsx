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

const PAD_T = 36
const PAD_B = 40

function collectDates(series: TrendSeries[]): string[] {
  const set = new Set<string>()
  for (const s of series) for (const p of s.points) set.add(p.date)
  return [...set].sort()
}

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

  const dates = collectDates(active)
  const values: number[] = []
  for (const s of active) for (const p of s.points) values.push(p.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1

  const W = 640
  const H = 240
  const padL = 40
  const padR = 40
  const innerW = W - padL - padR
  const innerH = H - PAD_T - PAD_B

  const xOf = (date: string) => {
    if (dates.length <= 1) return padL + innerW / 2
    const i = dates.indexOf(date)
    return padL + (innerW * i) / (dates.length - 1)
  }
  const yOf = (value: number) => PAD_T + innerH * (1 - (value - min) / span)

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
        <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
          {active.map((s) => {
            const coords = s.points.map((p) => ({ x: xOf(p.date), y: yOf(p.value) }))
            const d = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x},${c.y}`).join(' ')
            return (
              <g key={s.key}>
                <path d={d} fill="none" stroke={s.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                {coords.map((c, i) => (
                  <circle key={`${s.key}-${i}`} cx={c.x} cy={c.y} r={4} fill={s.color} />
                ))}
              </g>
            )
          })}
          {dates.map((date) => (
            <text key={date} x={xOf(date)} y={H - 12} textAnchor="middle" fontSize="16" fill="#6b7280">
              {date}
            </text>
          ))}
          {active.map((s) => {
            const last = s.points[s.points.length - 1]!
            return (
              <text
                key={`${s.key}-last`}
                x={xOf(last.date)}
                y={yOf(last.value) - 10}
                textAnchor="middle"
                fontSize="16"
                fill={s.color}
                fontWeight="600"
              >
                {formatFen(last.value)}
              </text>
            )
          })}
        </svg>
      </View>
    </View>
  )
}
