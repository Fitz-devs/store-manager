import { useEffect, useState } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { Button, Input, Text, View } from '@tarojs/components'
import type { Category } from '@sm/shared'
import { api } from '../../api/client'
import { useAuthGuard } from '../../utils/auth'
import './index.scss'

export default function CategoriesPage() {
  useAuthGuard()
  const [items, setItems] = useState<Category[]>([])
  const [name, setName] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [busy, setBusy] = useState(false)

  const load = async () => {
    try {
      const data = await api.get<Category[]>('/api/categories')
      setItems(data)
    } catch (error) {
      Taro.showToast({ title: (error as Error).message, icon: 'none' })
    }
  }

  useDidShow(() => {
    load()
  })

  const add = async () => {
    const value = name.trim()
    if (!value) {
      Taro.showToast({ title: '请填写分类名称', icon: 'none' })
      return
    }
    setBusy(true)
    try {
      await api.post('/api/categories', { name: value })
      setName('')
      Taro.showToast({ title: '已添加', icon: 'success' })
      load()
    } catch (error) {
      Taro.showToast({ title: (error as Error).message, icon: 'none' })
    } finally {
      setBusy(false)
    }
  }

  const rename = async (id: number) => {
    const value = editName.trim()
    if (!value) return
    setBusy(true)
    try {
      await api.patch(`/api/categories/${id}`, { name: value })
      setEditingId(null)
      Taro.showToast({ title: '已保存', icon: 'success' })
      load()
    } catch (error) {
      Taro.showToast({ title: (error as Error).message, icon: 'none' })
    } finally {
      setBusy(false)
    }
  }

  const remove = async (row: Category) => {
    const ok = await Taro.showModal({ title: '删除分类', content: `确定删除「${row.name}」吗？` })
    if (!ok.confirm) return
    try {
      await api.delete(`/api/categories/${row.id}`)
      Taro.showToast({ title: '已删除', icon: 'success' })
      load()
    } catch (error) {
      Taro.showToast({ title: (error as Error).message, icon: 'none' })
    }
  }

  return (
    <View className="categories-page">
      <View className="card">
        <View className="field">
          <Text className="field-label">新分类</Text>
          <View className="barcode-line">
            <Input
              className="input"
              placeholder="如 饮料 / 烟酒 / 零食"
              value={name}
              onInput={(event) => setName(event.detail.value)}
            />
            <Button className="btn btn-primary" loading={busy} onClick={add}>
              添加
            </Button>
          </View>
        </View>
      </View>

      <View className="section-title">全部分类</View>
      <View className="card">
        {!items.length && (
          <View className="sm-empty">
            <Text className="sm-empty-title">还没有分类</Text>
            <Text className="sm-empty-sub">在上方添加，商品编辑时可直接勾选</Text>
          </View>
        )}
        {items.map((row) => (
          <View key={row.id} className="list-row">
            {editingId === row.id ? (
              <>
                <Input
                  className="input edit-input"
                  value={editName}
                  onInput={(event) => setEditName(event.detail.value)}
                />
                <View className="row-actions">
                  <Text className="sm-action" onClick={() => rename(row.id)}>
                    保存
                  </Text>
                  <Text className="sm-action muted" onClick={() => setEditingId(null)}>
                    取消
                  </Text>
                </View>
              </>
            ) : (
              <>
                <Text className="list-row-main">{row.name}</Text>
                <View className="row-actions">
                  <Text
                    className="sm-action"
                    onClick={() => {
                      setEditingId(row.id)
                      setEditName(row.name)
                    }}
                  >
                    编辑
                  </Text>
                  <Text className="sm-action sm-action-danger" onClick={() => remove(row)}>
                    删除
                  </Text>
                </View>
              </>
            )}
          </View>
        ))}
      </View>
    </View>
  )
}
