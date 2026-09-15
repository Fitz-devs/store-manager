import { Tag } from '@nutui/nutui-react-taro'

type Tone = 'primary' | 'success' | 'warn' | 'danger' | 'muted'

const TONE: Record<Tone, 'primary' | 'success' | 'warning' | 'danger' | 'default'> = {
  primary: 'primary',
  success: 'success',
  warn: 'warning',
  danger: 'danger',
  muted: 'default',
}

export function StatusTag({ tone = 'muted', children }: { tone?: Tone; children: string }) {
  return <Tag type={TONE[tone]}>{children}</Tag>
}
