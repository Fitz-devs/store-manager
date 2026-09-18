import { useRef, useState } from 'react'
import Taro, { useDidShow, usePullDownRefresh, useReachBottom } from '@tarojs/taro'
import { Button, Text, View } from '@tarojs/components'
import type { CustomerListItem } from '@sm/shared'
import { api } from '../../api/client'
import { EmptyState } from '../../components/empty-state'
import { ListLoading } from '../../components/list-loading'
import { SearchBox } from '../../components/search-box'
import { useAuthGuard } from '../../utils/auth'
import { formatDay, formatFen } from '../../utils/format'
import './index.scss'

export default function Customers() {
  useAuthGuard()
  const [keyword, setKeyword] = useState('')
  const keywordRef = useRef('')
  const [items, setItems] = useState<CustomerListItem[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const loadingRef = useRef(false)

  const load = async (nextPage: number, append = false) => {
    if (append && loadingRef.current) return
    loadingRef.current = true
    setLoading(true)
    try {
      const query = new URLSearchParams()
      const q = keywordRef.current.trim()
      if (q) query.set('q', q)
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
      loadingRef.current = false
      setLoading(false)
    }
  }

  useDidShow(() => {
    load(1)
  })

  useReachBottom(() => {
    if (!loading && items.length < total) load(page + 1, true)
  })

  usePullDownRefresh(() => {
    load(1).finally(() => Taro.stopPullDownRefresh())
  })

  const onKeywordChange = (value: string) => {
    keywordRef.current = value
    setKeyword(value)
  }

  return (
    <View className="customers-page">
      <View className="list-header">
        <View className="toolbar">
          <SearchBox
            value={keyword}
            onChange={onKeywordChange}
            onSearch={() => load(1)}
            placeholder="搜索姓名 / 电话 / 地址"
          />
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
            {customer.last_order_at ? ` · 最近 ${formatDay(customer.last_order_at)}` : ''}
          </Text>
        </View>
      ))}

      {!loading && !items.length && (
        <EmptyState
          title="暂无客户"
          sub="新增客户后，开单可直接选人记账"
          actions={[
            {
              label: '新增客户',
              primary: true,
              onClick: () => Taro.navigateTo({ url: '/pages/customer-edit/index' }),
            },
          ]}
        />
      )}
      <ListLoading
        loading={loading}
        hasItems={items.length > 0}
        shown={items.length}
        total={total}
        unit="位"
      />
    </View>
  )
}
