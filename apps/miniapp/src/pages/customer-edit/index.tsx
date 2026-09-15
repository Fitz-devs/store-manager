import { useState } from 'react'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import { Button, Input, Text, Textarea, View } from '@tarojs/components'
import type { Customer } from '@sm/shared'
import { api } from '../../api/client'
import { useAuthGuard } from '../../utils/auth'
import './index.scss'

export default function CustomerEdit() {
  useAuthGuard()
  const router = useRouter()
  const id = router.params.id ? Number(router.params.id) : null
  const selectMode = router.params.select === '1'

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const load = async () => {
    if (!id) {
      const draft = Taro.getStorageSync('sm_customer_draft_name')
      if (draft) {
        setName(String(draft))
        Taro.removeStorageSync('sm_customer_draft_name')
      }
      setLoaded(true)
      return
    }
    try {
      const data = await api.get<Customer & { notes: string | null }>(`/api/customers/${id}`)
      setName(data.name)
      setPhone(data.phone ?? '')
      setAddress(data.address ?? '')
      setNotes(data.notes ?? '')
    } catch (error) {
      Taro.showToast({ title: (error as Error).message, icon: 'none' })
    } finally {
      setLoaded(true)
    }
  }

  useDidShow(() => {
    load()
  })

  const save = async () => {
    if (busy) return
    if (!name.trim()) {
      Taro.showToast({ title: '请填写客户姓名', icon: 'none' })
      return
    }
    setBusy(true)
    try {
      const payload = {
        name: name.trim(),
        phone: phone.trim() || null,
        address: address.trim() || null,
        notes: notes.trim() || null,
      }
      const saved = id
        ? await api.patch<Customer>(`/api/customers/${id}`, payload)
        : await api.post<Customer>('/api/customers', payload)

      if (selectMode) {
        Taro.setStorageSync('sm_customer_pick', { mode: 'select', customer: saved })
        Taro.navigateBack({ delta: 2 })
        return
      }
      Taro.showToast({ title: id ? '已保存' : '已创建', icon: 'success' })
      setTimeout(() => Taro.navigateBack(), 400)
    } catch (error) {
      Taro.showToast({ title: (error as Error).message, icon: 'none' })
    } finally {
      setBusy(false)
    }
  }

  if (!loaded) return <View className="empty">加载中…</View>

  return (
    <View className="customer-edit-page">
      <View className="card">
        <View className="field">
          <Text className="field-label">客户姓名 *</Text>
          <Input className="input" placeholder="如 张三" value={name} onInput={(event) => setName(event.detail.value)} />
        </View>
        <View className="field">
          <Text className="field-label">联系电话</Text>
          <Input className="input" type="tel" maxlength={20} placeholder="可留空" value={phone} onInput={(event) => setPhone(event.detail.value)} />
        </View>
        <View className="field">
          <Text className="field-label">默认送货地址</Text>
          <Textarea
            className="input sm-textarea"
            placeholder="可留空，送货时也能临时填"
            value={address}
            maxlength={200}
            autoHeight
            onInput={(event) => setAddress(event.detail.value)}
          />
        </View>
        <View className="field">
          <Text className="field-label">备注</Text>
          <Textarea
            className="input sm-textarea"
            placeholder="可留空"
            value={notes}
            maxlength={200}
            autoHeight
            onInput={(event) => setNotes(event.detail.value)}
          />
        </View>
      </View>

      <View className="footer-bar">
        <Button className="btn btn-primary full-btn" loading={busy} onClick={save}>
          {id ? '保存修改' : selectMode ? '保存并选择' : '创建客户'}
        </Button>
      </View>
    </View>
  )
}
