import { useRef, useState } from 'react'
import Taro, { useDidShow, useReachBottom, useRouter } from '@tarojs/taro'
import { Button, Input, Text, View } from '@tarojs/components'
import type { Order } from '@sm/shared'
import { api } from '../../api/client'
import { useAuthGuard } from '../../utils/auth'
import { consumePendingOrdersFilter } from '../../utils/orderFilter'
import { formatFen, orderRemaining, orderStatusTagClass, orderStatusText } from '../../utils/format'
import './index.scss'

type Filter = 'all' | 'unpaid' | 'pending'

export default function Orders() {
  useAuthGuard()
  const router = useRouter()
  const initial = (router.params.filter as Filter) || 'all'
  const [filter, setFilter] = useState<Filter>(initial)
  const filterRef = useRef<Filter>(initial)
  const [keyword, setKeyword] = useState('')
  const [items, setItems] = useState<Order[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = async (nextPage: number, nextFilter = filter, append = false) => {
    setLoading(true)
    try {
      const query = new URLSearchParams()
      if (keyword.trim()) query.set('q', keyword.trim())
      if (nextFilter === 'unpaid') query.set('only_unpaid', '1')
      if (nextFilter === 'pending') query.set('delivery_status', 'pending')
      query.set('page', String(nextPage))
      query.set('page_size', '20')
      const data = await api.get<{ items: Order[]; total: number }>(`/api/orders?${query.toString()}`)
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
    const pending = consumePendingOrdersFilter()
    if (pending) {
      setFilter(pending)
      filterRef.current = pending
      load(1, pending)
    } else {
      load(1, filterRef.current)
    }
  })

  useReachBottom(() => {
    if (!loading && items.length < total) load(page + 1, filter, true)
  })

  const switchFilter = (next: Filter) => {
    setFilter(next)
    filterRef.current = next
    load(1, next)
  }

  const onKeywordInput = (value: string) => {
    setKeyword(value)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => load(1), 350)
  }

  const filters: Array<{ value: Filter; label: string }> = [
    { value: 'all', label: '全部' },
    { value: 'unpaid', label: '待收款' },
    { value: 'pending', label: '待送货' },
  ]

  return (
    <View className="orders-page">
      <View className="list-header">
        <View className="toolbar">
          <View className="sm-search">
            <Text className="sm-search-icon">🔍</Text>
            <Input
              className="sm-search-input"
              placeholder="搜索单号 / 客户"
              value={keyword}
              confirmType="search"
              onInput={(event) => onKeywordInput(event.detail.value)}
              onConfirm={() => load(1)}
            />
            {keyword ? (
              <Text className="sm-search-clear" onClick={() => {
                setKeyword('')
                if (searchTimer.current) clearTimeout(searchTimer.current)
                load(1, filterRef.current)
              }}>
                ✕
              </Text>
            ) : null}
          </View>
        </View>
        <View className="sm-chips">
          {filters.map((item) => (
            <View
              key={item.value}
              className={`sm-chip ${filter === item.value ? 'sm-chip-active' : ''}`}
              onClick={() => switchFilter(item.value)}
            >
              {item.label}
            </View>
          ))}
          <Text className="muted sm-chip-total">共 {total} 单</Text>
        </View>
      </View>

      {items.map((order) => (
        <View
          key={order.id}
          className="sm-list-card"
          onClick={() => Taro.navigateTo({ url: `/pages/order-detail/index?id=${order.id}` })}
        >
          <View className="row-between">
            <Text className="sm-list-card-title">{order.order_no}</Text>
            <Text className={orderStatusTagClass(order)}>{orderStatusText(order)}</Text>
          </View>
          <Text className="muted">
            {order.customer_name || '散客'} · {order.created_at.slice(5, 16).replace('T', ' ')}
          </Text>
          <View className="row-between">
            <Text className="muted">
              {order.delivery_required
                ? order.delivery_status === 'delivered'
                  ? '已送达'
                  : `待送货${order.delivery_at ? ` · ${order.delivery_at}` : ''}`
                : '到店自取'}
            </Text>
            <Text className="price-text sm-list-card-total">{formatFen(order.total)}</Text>
          </View>
          {order.delivery_required && order.delivery_address ? (
            <Text className="muted order-address">收件：{order.delivery_address}</Text>
          ) : null}
          {orderRemaining(order) > 0 && order.status === 'open' ? (
            <Text className="warn-text">未收 {formatFen(orderRemaining(order))}</Text>
          ) : null}
        </View>
      ))}

      {!loading && !items.length && (
        <View className="sm-empty">
          <Text className="sm-empty-title">暂无订单</Text>
          <Text className="sm-empty-sub">开单后会出现在这里，可按待收款/待送货筛选</Text>
          <View className="sm-empty-actions">
            <Button
              className="btn btn-primary"
              onClick={() => Taro.switchTab({ url: '/pages/order-new/index' })}
            >
              去开单
            </Button>
          </View>
        </View>
      )}
      {loading && <View className="empty">加载中…</View>}
      {!loading && items.length > 0 && (
        <View className="sm-list-footer">
          {items.length < total ? '上滑加载更多…' : `到底了，共 ${total} 单`}
        </View>
      )}
    </View>
  )
}
