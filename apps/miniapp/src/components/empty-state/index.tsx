import { Button, Text, View } from '@tarojs/components'

interface Props {
  title: string
  sub?: string
  actions?: Array<{
    label: string
    primary?: boolean
    onClick: () => void
  }>
}

export function EmptyState({ title, sub, actions }: Props) {
  return (
    <View className="sm-empty-state">
      <View className="sm-empty-figure">
        <View className="sm-empty-box">
          <View className="sm-empty-flap sm-empty-flap-left" />
          <View className="sm-empty-flap sm-empty-flap-right" />
          <View className="sm-empty-dot" />
        </View>
      </View>
      <Text className="sm-empty-state-title">{title}</Text>
      {sub ? <Text className="sm-empty-state-sub">{sub}</Text> : null}
      {actions?.length ? (
        <View className="sm-empty-actions">
          {actions.map((action) => (
            <Button
              key={action.label}
              className={`btn ${action.primary ? 'btn-primary' : 'btn-ghost'}`}
              onClick={action.onClick}
            >
              {action.label}
            </Button>
          ))}
        </View>
      ) : null}
    </View>
  )
}
