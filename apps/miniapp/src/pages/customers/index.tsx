import { useRef, useState } from 'react'
import Taro, { useDidShow, useReachBottom } from '@tarojs/taro'
import { Button, Input, Text, View } from '@tarojs/components'
import type { CustomerListItem } from '@sm/shared'
import { api } from '../../api/client'
import { useAuthGuard } from '../../utils/auth'
import { formatFen } from '../../utils/format'
import './index.scss'

export default function Customers() {
  useAuthGuard()
  const [keyword, setKeyword] = useState('')
  const [items, setItems] = useState<CustomerListItem[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = async (nextPage: number, append = false) => {
    setLoading(true)
    try {
      const query = new URLSearchParams()
      if (keyword.trim()) query.set('q', keyword.trim())
      query.set('page', String(nextPage))
      query.set('page_size', '20')
      const data = await api.get<{ items: CustomerListItem[]; total: number }>(
        `/api/customers?${query.toString()}`,
      )
      setItems((previous) => (append ? [...previous, ...data.items] : data.items))
      setTotal(data.total)
      setPage(nextPage)
    } catch (error) {
      Taro.showToast({ title: (error as Error).message, icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  useDidShow(() => {
    load(1)
  })

  useReachBottom(() => {
    if (!loading && items.length < total) load(page + 1, true)
  })

  const onKeywordInput = (value: string) => {
    setKeyword(value)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => load(1), 350)
  }

  return (
    <View className="customers-page">
      <View className="list-header">
        <View className="toolbar">
          <View className="sm-search">
            <Text className="sm-search-icon">🔍</Text>
            <Input
              className="sm-search-input"
              placeholder="搜索姓名 / 电话 / 地址"
              value={keyword}
              confirmType="search"
              onInput={(event) => onKeywordInput(event.detail.value)}
              onConfirm={() => load(1)}
            />
            {keyword ? (
              <Text
                className="sm-search-clear"
                onClick={() => {
                  setKeyword('')
                  if (searchTimer.current) clearTimeout(searchTimer.current)
                  load(1)
                }}
              >
                ✕
              </Text>
            ) : null}
          </View>
          <View
            className="sm-new-btn"
            onClick={() => Taro.navigateTo({ url: '/pages/customer-edit/index' })}
          >
            <Text>＋客户</Text>
          </View>
        </View>
      </View>

      {items.map((customer) => (
        <View
          key={customer.id}
          className="sm-list-card"
          onClick={() => Taro.navigateTo({ url: `/pages/customer-detail/index?id=${customer.id}` })}
        >
          <View className="row-between">
            <Text className="sm-list-card-title">{customer.name}</Text>
            {customer.unpaid_amount > 0 ? (
              <Text className="tag tag-warn">欠款 {formatFen(customer.unpaid_amount)}</Text>
            ) : (
              <Text className="tag tag-success">无欠款</Text>
            )}
          </View>
          <Text className="muted">{customer.phone || '未填电话'}</Text>
          <Text className="muted">{customer.address || '未填地址'}</Text>
          <Text className="muted">
            {customer.order_count} 单
            {customer.last_order_at ? ` · 最近 ${customer.last_order_at.slice(0, 10)}` : ''}
          </Text>
        </View>
      ))}

      {!loading && !items.length && (
        <View className="sm-empty">
          <Text className="sm-empty-title">暂无客户</Text>
          <Text className="sm-empty-sub">新增客户后，开单可直接选人记账</Text>
          <View className="sm-empty-actions">
            <Button
              className="btn btn-primary"
              onClick={() => Taro.navigateTo({ url: '/pages/customer-edit/index' })}
            >
              新增客户
            </Button>
          </View>
        </View>
      )}
      {loading && <View className="empty">加载中…</View>}
    </View>
  )
}
