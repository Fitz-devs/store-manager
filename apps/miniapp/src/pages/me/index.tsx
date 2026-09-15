import { useState } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { Button, Input, Text, View } from '@tarojs/components'
import type { HomeReport, User } from '@sm/shared'
import { api, clearToken, getToken, getUser } from '../../api/client'
import { SelectField } from '../../components/select-field'
import { API_BASE } from '../../config'
import { setPendingOrdersFilter } from '../../utils/orderFilter'
import { useAuthGuard } from '../../utils/auth'
import { formatFen, ROLE_LABELS } from '../../utils/format'
import './index.scss'

interface UserRow {
  id: number
  username: string
  nickname: string | null
  role: string
  status: string
  has_wechat: boolean
  created_at: string
}

export default function Me() {
  useAuthGuard()
  const [user, setUser] = useState<User | null>(null)
  const [report, setReport] = useState<HomeReport | null>(null)
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [users, setUsers] = useState<UserRow[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [newUsername, setNewUsername] = useState('')
  const [newNickname, setNewNickname] = useState('')
  const [newUserPassword, setNewUserPassword] = useState('')
  const [newRole, setNewRole] = useState(1)

  useDidShow(() => {
    setUser(getUser<User>())
    api.get<HomeReport>('/api/reports/home').then(setReport).catch(() => undefined)
    api
      .get<UserRow[]>('/api/users')
      .then(setUsers)
      .catch(() => setUsers([]))
  })

  const changePassword = async () => {
    if (!oldPassword || newPassword.length < 6) {
      Taro.showToast({ title: '请填写原密码，新密码至少 6 位', icon: 'none' })
      return
    }
    try {
      await api.post('/api/auth/change-password', { old_password: oldPassword, new_password: newPassword })
      Taro.showToast({ title: '密码已修改', icon: 'success' })
      setOldPassword('')
      setNewPassword('')
    } catch (error) {
      Taro.showToast({ title: (error as Error).message, icon: 'none' })
    }
  }

  const addUser = async () => {
    if (newUsername.trim().length < 2 || newUserPassword.length < 6) {
      Taro.showToast({ title: '账号至少 2 位、密码至少 6 位', icon: 'none' })
      return
    }
    try {
      await api.post('/api/users', {
        username: newUsername.trim(),
        password: newUserPassword,
        nickname: newNickname.trim() || null,
        role: newRole === 0 ? 'owner' : 'staff',
      })
      Taro.showToast({ title: '已添加店员', icon: 'success' })
      setShowAdd(false)
      setNewUsername('')
      setNewNickname('')
      setNewUserPassword('')
      api.get<UserRow[]>('/api/users').then(setUsers)
    } catch (error) {
      Taro.showToast({ title: (error as Error).message, icon: 'none' })
    }
  }

  const disableUser = async (row: UserRow) => {
    const confirm = await Taro.showModal({ title: '停用账号', content: `确定停用 ${row.nickname || row.username} 吗？` })
    if (!confirm.confirm) return
    try {
      await api.delete(`/api/users/${row.id}`)
      api.get<UserRow[]>('/api/users').then(setUsers)
    } catch (error) {
      Taro.showToast({ title: (error as Error).message, icon: 'none' })
    }
  }

  const exportData = () => {
    const url = `${API_BASE}/api/reports/export?token=${encodeURIComponent(getToken())}`
    Taro.setClipboardData({ data: url })
  }

  const logout = async () => {
    const confirm = await Taro.showModal({ title: '退出登录', content: '确定退出吗？' })
    if (!confirm.confirm) return
    clearToken()
    Taro.reLaunch({ url: '/pages/login/index' })
  }

  const isOwner = user?.role === 'owner'

  return (
    <View className="me-page">
      <View className="me-header">
        <View className="avatar">{(user?.nickname || user?.username || '?').slice(0, 1)}</View>
        <View className="me-info">
          <Text className="me-name">{user?.nickname || user?.username}</Text>
          <Text className="muted">
            {user ? ROLE_LABELS[user.role] : ''} · {user?.username}
            {user?.has_wechat ? ' · 已绑定微信' : ''}
          </Text>
        </View>
      </View>

      {report && (
        <View className="card stats-card">
          <View
            className="stat"
            onClick={() => {
              setPendingOrdersFilter('all')
              Taro.switchTab({ url: '/pages/orders/index' })
            }}
          >
            <Text className="stat-value">{formatFen(report.today_sales)}</Text>
            <Text className="muted">今日销售</Text>
          </View>
          <View
            className="stat"
            onClick={() => {
              setPendingOrdersFilter('unpaid')
              Taro.switchTab({ url: '/pages/orders/index' })
            }}
          >
            <Text className="stat-value">{formatFen(report.unpaid_total)}</Text>
            <Text className="muted">待收款</Text>
          </View>
          <View
            className="stat"
            onClick={() => {
              Taro.navigateTo({ url: '/pages/product-list/index?stock=1' })
            }}
          >
            <Text className="stat-value">{report.out_of_stock_count}</Text>
            <Text className="muted">缺货商品</Text>
          </View>
        </View>
      )}

      <View className="section-title">订单</View>
      <View className="card">
        <View
          className="user-row"
          onClick={() => {
            setPendingOrdersFilter('all')
            Taro.switchTab({ url: '/pages/orders/index' })
          }}
        >
          <Text>全部订单</Text>
          <Text className="muted">›</Text>
        </View>
        <View
          className="user-row"
          onClick={() => {
            setPendingOrdersFilter('unpaid')
            Taro.switchTab({ url: '/pages/orders/index' })
          }}
        >
          <Text>待收款订单</Text>
          <Text className="muted">›</Text>
        </View>
        <View
          className="user-row"
          onClick={() => {
            setPendingOrdersFilter('pending')
            Taro.switchTab({ url: '/pages/orders/index' })
          }}
        >
          <Text>待送货订单</Text>
          <Text className="muted">›</Text>
        </View>
      </View>

      <View className="section-title">管理</View>
      <View className="card">
        <View
          className="user-row"
          onClick={() => Taro.switchTab({ url: '/pages/products/index' })}
        >
          <Text>商品管理</Text>
          <Text className="muted">›</Text>
        </View>
        <View
          className="user-row"
          onClick={() => Taro.navigateTo({ url: '/pages/customers/index' })}
        >
          <Text>客户管理</Text>
          <Text className="muted">›</Text>
        </View>
        <View
          className="user-row"
          onClick={() => Taro.navigateTo({ url: '/pages/categories/index' })}
        >
          <Text>分类管理</Text>
          <Text className="muted">›</Text>
        </View>
      </View>

      <View className="section-title">账号安全</View>
      <View className="card">
        <Input className="input field" password placeholder="原密码" value={oldPassword} onInput={(event) => setOldPassword(event.detail.value)} />
        <Input className="input field" password placeholder="新密码（至少 6 位）" value={newPassword} onInput={(event) => setNewPassword(event.detail.value)} />
        <Button className="btn btn-ghost full-btn" onClick={changePassword}>
          修改密码
        </Button>
      </View>

      {isOwner && (
        <>
          <View className="section-title">店员账号</View>
          <View className="card">
            {users.map((row) => (
              <View key={row.id} className="user-row">
                <View>
                  <Text>
                    {row.nickname || row.username}（{ROLE_LABELS[row.role as keyof typeof ROLE_LABELS] ?? row.role}）
                  </Text>
                  <Text className="muted">
                    {row.username} {row.status === 'disabled' ? '· 已停用' : ''} {row.has_wechat ? '· 微信已绑定' : ''}
                  </Text>
                </View>
                {row.status === 'active' && row.username !== user?.username ? (
                  <Text className="danger-text" onClick={() => disableUser(row)}>
                    停用
                  </Text>
                ) : null}
              </View>
            ))}
            {showAdd ? (
              <View className="add-user">
                <Input className="input field" placeholder="登录账号" value={newUsername} onInput={(event) => setNewUsername(event.detail.value)} />
                <Input className="input field" placeholder="昵称" value={newNickname} onInput={(event) => setNewNickname(event.detail.value)} />
                <Input className="input field" password placeholder="密码（至少 6 位）" value={newUserPassword} onInput={(event) => setNewUserPassword(event.detail.value)} />
                <SelectField
                  range={['老板', '店员']}
                  value={newRole}
                  onChange={setNewRole}
                >
                  <View className="input field">角色：{newRole === 0 ? '老板' : '店员'} ›</View>
                </SelectField>
                <View className="inline-actions">
                  <Button className="btn btn-ghost" onClick={() => setShowAdd(false)}>
                    取消
                  </Button>
                  <Button className="btn btn-primary" onClick={addUser}>
                    添加
                  </Button>
                </View>
              </View>
            ) : (
              <Button className="btn btn-ghost full-btn" onClick={() => setShowAdd(true)}>
                添加店员
              </Button>
            )}
          </View>
        </>
      )}

      <View className="section-title">数据</View>
      <View className="card">
        <Button className="btn btn-ghost full-btn" onClick={exportData}>
          复制数据导出链接
        </Button>
      </View>

      <View className="card">
        <Button className="btn btn-danger full-btn" onClick={logout}>
          退出登录
        </Button>
      </View>
    </View>
  )
}
