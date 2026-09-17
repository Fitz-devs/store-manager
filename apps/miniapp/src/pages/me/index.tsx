import { useState } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { Button, Input, Text, View } from '@tarojs/components'
import type { HomeReport, User } from '@sm/shared'
import { api, clearToken, getToken, getUser, setUser } from '../../api/client'
import { API_BASE } from '../../config'
import { setPendingOrdersFilter } from '../../utils/orderFilter'
import { useAuthGuard } from '../../utils/auth'
import { IS_WEAPP } from '../../utils/env'
import { formatFen, ROLE_LABELS } from '../../utils/format'
import './index.scss'

export default function Me() {
  useAuthGuard()
  const [user, setUserState] = useState<User | null>(null)
  const [report, setReport] = useState<HomeReport | null>(null)
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [wxBusy, setWxBusy] = useState(false)

  useDidShow(() => {
    setUserState(getUser<User>())
    api.get<HomeReport>('/api/reports/home').then(setReport).catch(() => undefined)
    api
      .get<User>('/api/auth/me')
      .then((u) => {
        setUser(u)
        setUserState(u)
      })
      .catch(() => undefined)
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

  const bindWechat = async () => {
    if (wxBusy) return
    setWxBusy(true)
    try {
      const login = await Taro.login()
      const data = await api.post<{ user: User }>('/api/auth/wx-bind-current', { code: login.code })
      setUser(data.user)
      setUserState(data.user)
      Taro.showToast({ title: '微信已绑定', icon: 'success' })
    } catch (error) {
      Taro.showToast({ title: (error as Error).message, icon: 'none' })
    } finally {
      setWxBusy(false)
    }
  }

  const unbindWechat = async () => {
    if (wxBusy) return
    const confirm = await Taro.showModal({
      title: '解绑微信',
      content: '解绑后将无法用微信一键登录，确定解绑吗？',
    })
    if (!confirm.confirm) return
    setWxBusy(true)
    try {
      const data = await api.post<{ user: User }>('/api/auth/wx-unbind')
      setUser(data.user)
      setUserState(data.user)
      Taro.showToast({ title: '已解绑微信', icon: 'success' })
    } catch (error) {
      Taro.showToast({ title: (error as Error).message, icon: 'none' })
    } finally {
      setWxBusy(false)
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
        {isOwner && (
          <View
            className="user-row"
            onClick={() => Taro.navigateTo({ url: '/pages/users/index' })}
          >
            <Text>用户管理</Text>
            <Text className="muted">›</Text>
          </View>
        )}
      </View>

      <View className="section-title">账号安全</View>
      <View className="card">
        <View className="user-row wechat-row">
          <View className="wechat-info">
            <Text>微信登录</Text>
            <Text className="muted">
              {user?.has_wechat
                ? '已绑定，可一键登录'
                : IS_WEAPP
                  ? '未绑定'
                  : '未绑定，请在小程序中绑定'}
            </Text>
          </View>
          {user?.has_wechat ? (
            <Button className="btn btn-ghost sm-action" loading={wxBusy} onClick={unbindWechat}>
              解绑
            </Button>
          ) : IS_WEAPP ? (
            <Button className="btn btn-primary sm-action" loading={wxBusy} onClick={bindWechat}>
              绑定微信
            </Button>
          ) : null}
        </View>
        <Input className="input field" password placeholder="原密码" value={oldPassword} onInput={(event) => setOldPassword(event.detail.value)} />
        <Input className="input field" password placeholder="新密码（至少 6 位）" value={newPassword} onInput={(event) => setNewPassword(event.detail.value)} />
        <Button className="btn btn-ghost full-btn" onClick={changePassword}>
          修改密码
        </Button>
      </View>

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
