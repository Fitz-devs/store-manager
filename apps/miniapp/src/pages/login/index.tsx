import { useEffect, useState } from 'react'
import Taro from '@tarojs/taro'
import { Button, Input, Text, View } from '@tarojs/components'
import { api, setToken, setUser } from '../../api/client'
import { IS_WEAPP } from '../../utils/env'
import './index.scss'

interface AuthResponse {
  token: string
  user: unknown
}

export default function Login() {
  const [mode, setMode] = useState<'loading' | 'error' | 'setup' | 'login'>('loading')
  const [statusError, setStatusError] = useState('')
  const [wxEnabled, setWxEnabled] = useState(false)
  const [storeName, setStoreName] = useState('')
  const [nickname, setNickname] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [bindToken, setBindToken] = useState('')
  const [busy, setBusy] = useState(false)

  const loadStatus = () => {
    setMode('loading')
    setStatusError('')
    api
      .get<{ needs_setup: boolean; wx_login_enabled: boolean }>('/api/auth/setup-status')
      .then((data) => {
        setMode(data.needs_setup ? 'setup' : 'login')
        setWxEnabled(data.wx_login_enabled)
      })
      .catch(() => {
        setStatusError('无法连接服务器，请检查 API 地址与网络')
        setMode('error')
      })
  }

  useEffect(() => {
    loadStatus()
  }, [])

  const finish = (data: AuthResponse) => {
    setToken(data.token)
    setUser(data.user)
    Taro.showToast({ title: '登录成功', icon: 'success' })
    setTimeout(() => Taro.switchTab({ url: '/pages/products/index' }), 400)
  }

  const submit = async () => {
    if (busy) return
    if (!username.trim() || !password) {
      Taro.showToast({ title: '请输入账号和密码', icon: 'none' })
      return
    }
    setBusy(true)
    try {
      if (bindToken) {
        const data = await api.post<AuthResponse>('/api/auth/wx-bind', {
          bind_token: bindToken,
          username: username.trim(),
          password,
        })
        finish(data)
        return
      }
      if (mode === 'setup') {
        if (username.trim().length < 2) {
          Taro.showToast({ title: '账号至少 2 位', icon: 'none' })
          return
        }
        if (password.length < 6) {
          Taro.showToast({ title: '密码至少 6 位', icon: 'none' })
          return
        }
        if (password !== confirm) {
          Taro.showToast({ title: '两次密码不一致', icon: 'none' })
          return
        }
        const data = await api.post<AuthResponse>('/api/auth/setup', {
          username: username.trim(),
          password,
          nickname: nickname.trim() || '老板',
          store_name: storeName.trim() || undefined,
        })
        finish(data)
        return
      }
      const data = await api.post<AuthResponse>('/api/auth/login', {
        username: username.trim(),
        password,
      })
      finish(data)
    } catch (error) {
      Taro.showToast({ title: (error as Error).message, icon: 'none' })
    } finally {
      setBusy(false)
    }
  }

  const wxLogin = async () => {
    if (busy) return
    setBusy(true)
    try {
      const login = await Taro.login()
      const data = await api.post<AuthResponse & { need_bind?: boolean; bind_token?: string }>(
        '/api/auth/wx-login',
        { code: login.code },
      )
      if (data.need_bind) {
        setBindToken(data.bind_token ?? '')
        Taro.showToast({ title: '首次使用请绑定账号', icon: 'none' })
        return
      }
      finish(data)
    } catch (error) {
      Taro.showToast({ title: (error as Error).message, icon: 'none' })
    } finally {
      setBusy(false)
    }
  }

  if (mode === 'loading') {
    return (
      <View className="login">
        <View className="empty">正在连接服务器…</View>
      </View>
    )
  }

  if (mode === 'error') {
    return (
      <View className="login">
        <View className="login-logo">店</View>
        <View className="login-title">店铺管家</View>
        <View className="sm-empty">
          <Text className="sm-empty-title">连接失败</Text>
          <Text className="sm-empty-sub">{statusError}</Text>
          <View className="sm-empty-actions">
            <Button className="btn btn-primary" onClick={loadStatus}>
              重试
            </Button>
          </View>
        </View>
      </View>
    )
  }

  return (
    <View className="login">
      <View className="login-logo">店</View>
      <View className="login-title">店铺管家</View>
      <View className="login-sub">
        {bindToken ? '绑定微信账号' : mode === 'setup' ? '首次使用，创建老板账号' : '登录后开始营业'}
      </View>

      <View className="login-form">
        {mode === 'setup' && !bindToken && (
          <Input
            className="input field"
            placeholder="店名（可留空）"
            value={storeName}
            onInput={(e) => setStoreName(e.detail.value)}
          />
        )}
        {mode === 'setup' && !bindToken && (
          <Input
            className="input field"
            placeholder="昵称（可留空）"
            value={nickname}
            onInput={(e) => setNickname(e.detail.value)}
          />
        )}
        <Input
          className="input field"
          placeholder="账号"
          value={username}
          onInput={(e) => setUsername(e.detail.value)}
        />
        <Input
          className="input field"
          placeholder="密码"
          password
          value={password}
          onInput={(e) => setPassword(e.detail.value)}
        />
        {mode === 'setup' && !bindToken && (
          <Input
            className="input field"
            placeholder="确认密码"
            password
            value={confirm}
            onInput={(e) => setConfirm(e.detail.value)}
          />
        )}
        <Button className="btn btn-primary login-btn" loading={busy} onClick={submit}>
          {bindToken ? '绑定并登录' : mode === 'setup' ? '创建并进入' : '登录'}
        </Button>

        {IS_WEAPP && wxEnabled && !bindToken && (
          <Button className="btn btn-ghost login-btn" onClick={wxLogin}>
            微信一键登录
          </Button>
        )}
        {bindToken && (
          <Text className="login-hint" onClick={() => setBindToken('')}>
            返回普通登录
          </Text>
        )}
      </View>
    </View>
  )
}
