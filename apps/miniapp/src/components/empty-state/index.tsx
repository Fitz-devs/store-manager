import { Empty } from '@nutui/nutui-react-taro'
import { Button, View } from '@tarojs/components'

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
    <View className="sm-empty-wrap">
      <Empty status="empty" title={title} description={sub || ''} />
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
