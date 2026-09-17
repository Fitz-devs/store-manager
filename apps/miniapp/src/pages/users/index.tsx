import { useState } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { Button, Input, Text, View } from '@tarojs/components'
import type { User } from '@sm/shared'
import { api, getUser } from '../../api/client'
import { SelectField } from '../../components/select-field'
import { useAuthGuard } from '../../utils/auth'
import { ROLE_LABELS } from '../../utils/format'
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

export default function Users() {
  useAuthGuard()
  const [user, setUser] = useState<User | null>(null)
  const [users, setUsers] = useState<UserRow[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [newUsername, setNewUsername] = useState('')
  const [newNickname, setNewNickname] = useState('')
  const [newUserPassword, setNewUserPassword] = useState('')
  const [newRole, setNewRole] = useState(1)
  const [resetTarget, setResetTarget] = useState<UserRow | null>(null)
  const [resetPassword, setResetPassword] = useState('')
  const [savingReset, setSavingReset] = useState(false)

  const load = () => {
    api
      .get<UserRow[]>('/api/users')
      .then(setUsers)
      .catch((error) => Taro.showToast({ title: (error as Error).message, icon: 'none' }))
  }

  useDidShow(() => {
    setUser(getUser<User>())
    load()
  })

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
      Taro.showToast({ title: '已添加账号', icon: 'success' })
      setShowAdd(false)
      setNewUsername('')
      setNewNickname('')
      setNewUserPassword('')
      load()
    } catch (error) {
      Taro.showToast({ title: (error as Error).message, icon: 'none' })
    }
  }

  const submitResetPassword = async () => {
    if (!resetTarget) return
    if (resetPassword.length < 6) {
      Taro.showToast({ title: '新密码至少 6 位', icon: 'none' })
      return
    }
    setSavingReset(true)
    try {
      await api.patch(`/api/users/${resetTarget.id}`, { password: resetPassword })
      Taro.showToast({ title: '密码已重置', icon: 'success' })
      setResetTarget(null)
      setResetPassword('')
    } catch (error) {
      Taro.showToast({ title: (error as Error).message, icon: 'none' })
    } finally {
      setSavingReset(false)
    }
  }

  const toggleStatus = async (row: UserRow) => {
    const disabling = row.status === 'active'
    const confirm = await Taro.showModal({
      title: disabling ? '停用账号' : '启用账号',
      content: disabling
        ? `停用后 ${row.nickname || row.username} 将无法登录，历史记录不受影响。确定吗？`
        : `恢复 ${row.nickname || row.username} 的登录权限？`,
    })
    if (!confirm.confirm) return
    try {
      await api.patch(`/api/users/${row.id}`, { status: disabling ? 'disabled' : 'active' })
      Taro.showToast({ title: disabling ? '已停用' : '已启用', icon: 'success' })
      load()
    } catch (error) {
      Taro.showToast({ title: (error as Error).message, icon: 'none' })
    }
  }

  const deleteUser = async (row: UserRow) => {
    const confirm = await Taro.showModal({
      title: '删除账号',
      content: `${row.nickname || row.username}（${row.username}）将被永久删除且不可恢复；其历史单据保留、经办人显示为「-」。确定吗？`,
      confirmColor: '#dc2626',
    })
    if (!confirm.confirm) return
    try {
      await api.delete(`/api/users/${row.id}`)
      Taro.showToast({ title: '已删除', icon: 'success' })
      load()
    } catch (error) {
      Taro.showToast({ title: (error as Error).message, icon: 'none' })
    }
  }

  const manageUser = async (row: UserRow) => {
    const options = ['重置密码', row.status === 'active' ? '停用账号' : '启用账号', '删除账号']
    try {
      const sheet = await Taro.showActionSheet({ itemList: options })
      if (sheet.tapIndex === 0) {
        setResetTarget(row)
        setResetPassword('')
      }
      if (sheet.tapIndex === 1) await toggleStatus(row)
      if (sheet.tapIndex === 2) await deleteUser(row)
    } catch {
      // 用户取消选择
    }
  }

  return (
    <View className="users-page">
      <View className="section-title">账号列表</View>
      <View className="card">
        {users.map((row) => (
          <View key={row.id} className="user-row">
            <View className="users-row-main">
              <View className="users-row-title">
                <Text>{row.nickname || row.username}</Text>
                <Text className={`tag ${row.role === 'owner' ? 'tag-primary' : 'tag-muted'}`}>
                  {ROLE_LABELS[row.role as keyof typeof ROLE_LABELS] ?? row.role}
                </Text>
                {row.status === 'disabled' && <Text className="tag tag-warn">已停用</Text>}
                {row.has_wechat && <Text className="tag tag-success">微信</Text>}
              </View>
              <Text className="muted">{row.username}</Text>
            </View>
            {row.id !== user?.id ? (
              <Text className="muted" onClick={() => manageUser(row)}>
                管理 ›
              </Text>
            ) : (
              <Text className="muted">当前登录</Text>
            )}
          </View>
        ))}
        {!users.length && <View className="empty">暂无账号</View>}
      </View>

      {resetTarget && (
        <View className="card">
          <View className="section-title" style={{ marginTop: 0 }}>
            重置密码：{resetTarget.nickname || resetTarget.username}
          </View>
          <Input
            className="input field"
            password
            placeholder="新密码（至少 6 位）"
            value={resetPassword}
            onInput={(event) => setResetPassword(event.detail.value)}
          />
          <View className="inline-actions">
            <Button
              className="btn btn-ghost"
              onClick={() => {
                setResetTarget(null)
                setResetPassword('')
              }}
            >
              取消
            </Button>
            <Button className="btn btn-primary" loading={savingReset} onClick={submitResetPassword}>
              确认重置
            </Button>
          </View>
        </View>
      )}

      {showAdd ? (
        <View className="card">
          <View className="section-title" style={{ marginTop: 0 }}>
            添加账号
          </View>
          <Input className="input field" placeholder="登录账号" value={newUsername} onInput={(event) => setNewUsername(event.detail.value)} />
          <Input className="input field" placeholder="昵称" value={newNickname} onInput={(event) => setNewNickname(event.detail.value)} />
          <Input className="input field" password placeholder="密码（至少 6 位）" value={newUserPassword} onInput={(event) => setNewUserPassword(event.detail.value)} />
          <SelectField range={['老板', '店员']} value={newRole} onChange={setNewRole}>
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
        <View className="card">
          <Button className="btn btn-primary full-btn" onClick={() => setShowAdd(true)}>
            ＋ 添加账号
          </Button>
        </View>
      )}

      <View className="card">
        <Text className="muted">
          停用仅禁止登录，账号保留；删除不可恢复，历史单据的经办人将显示为「-」。
        </Text>
      </View>
    </View>
  )
}
