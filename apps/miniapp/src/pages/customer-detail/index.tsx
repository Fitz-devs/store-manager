import { useRef, useState } from 'react'
import Taro, { useDidShow, useReachBottom, useRouter } from '@tarojs/taro'
import { Button, Input, Text, View } from '@tarojs/components'
import type { CustomerDetail, Order } from '@sm/shared'
import { api } from '../../api/client'
import { useAuthGuard } from '../../utils/auth'
import { formatFen, orderRemaining, orderStatusTagClass, orderStatusText } from '../../utils/format'
import './index.scss'

export default function CustomerDetailPage() {
  useAuthGuard()
  const router = useRouter()
  const id = Number(router.params.id)
  const [detail, setDetail] = useState<CustomerDetail | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [ordersTotal, setOrdersTotal] = useState(0)
  const [ordersPage, setOrdersPage] = useState(1)
  const [loadingOrders, setLoadingOrders] = useState(false)
  const ordersRequestRef = useRef(0)
  const [showAddressForm, setShowAddressForm] = useState(false)
  const [addrLabel, setAddrLabel] = useState('')
  const [addrContact, setAddrContact] = useState('')
  const [addrPhone, setAddrPhone] = useState('')
  const [addrAddress, setAddrAddress] = useState('')

  const load = async () => {
    try {
      const data = await api.get<CustomerDetail>(`/api/customers/${id}`)
      setDetail(data)
      setOrders(data.orders)
      setOrdersPage(1)
      setOrdersTotal(data.orders.length)
      if (data.orders.length >= 20) {
        // may have more; fetch total from list API
        api
          .get<{ total: number }>(`/api/orders?customer_id=${id}&page=1&page_size=20`)
          .then((res) => setOrdersTotal(res.total))
          .catch(() => undefined)
      }
    } catch (error) {
      Taro.showToast({ title: (error as Error).message, icon: 'none' })
    }
  }

  const loadMoreOrders = async () => {
    if (loadingOrders) return
    if (ordersTotal && orders.length >= ordersTotal) return
    const request = ordersRequestRef.current + 1
    ordersRequestRef.current = request
    setLoadingOrders(true)
    try {
      const data = await api.get<{ items: Order[]; total: number }>(
        `/api/orders?customer_id=${id}&page=${ordersPage + 1}&page_size=20`,
      )
      if (ordersRequestRef.current !== request) return
      setOrders((previous) => [...previous, ...data.items])
      setOrdersTotal(data.total)
      setOrdersPage(ordersPage + 1)
    } catch {
      // ignore
    } finally {
      if (ordersRequestRef.current === request) setLoadingOrders(false)
    }
  }

  useReachBottom(() => {
    loadMoreOrders()
  })

  useDidShow(() => {
    if (Number.isFinite(id)) load()
  })

  const addAddress = async () => {
    if (!addrAddress.trim()) {
      Taro.showToast({ title: '请填写地址', icon: 'none' })
      return
    }
    try {
      await api.post(`/api/customers/${id}/addresses`, {
        label: addrLabel.trim() || null,
        contact_name: addrContact.trim() || null,
        phone: addrPhone.trim() || null,
        address: addrAddress.trim(),
        is_default: !detail?.addresses.length,
      })
      Taro.showToast({ title: '地址已保存', icon: 'success' })
      setAddrLabel('')
      setAddrContact('')
      setAddrPhone('')
      setAddrAddress('')
      setShowAddressForm(false)
      load()
    } catch (error) {
      Taro.showToast({ title: (error as Error).message, icon: 'none' })
    }
  }

  const setDefaultAddress = async (addressId: number) => {
    try {
      await api.post(`/api/customers/${id}/addresses/${addressId}/default`)
      load()
    } catch (error) {
      Taro.showToast({ title: (error as Error).message, icon: 'none' })
    }
  }

  const removeAddress = async (addressId: number) => {
    const confirm = await Taro.showModal({ title: '删除地址', content: '确定删除该地址吗？' })
    if (!confirm.confirm) return
    try {
      await api.delete(`/api/customers/${id}/addresses/${addressId}`)
      load()
    } catch (error) {
      Taro.showToast({ title: (error as Error).message, icon: 'none' })
    }
  }

  if (!detail) return <View className="empty">加载中…</View>

  return (
    <View className="customer-detail-page">
      <View className="card">
        <View className="customer-head">
          <View className="row-between">
            <Text className="customer-name">{detail.name}</Text>
            <Text
              className="primary-text"
              onClick={() => Taro.navigateTo({ url: `/pages/customer-edit/index?id=${id}` })}
            >
              编辑
            </Text>
          </View>
          <Text className="muted">{detail.phone || '未填电话'}</Text>
          <Text className="muted">{detail.address || '未填地址'}</Text>
          {detail.notes ? <Text className="muted">备注：{detail.notes}</Text> : null}
          <View className="debt-row">
            <Text className="muted">未结欠款</Text>
            <Text className={detail.total_unpaid > 0 ? 'price-text debt-value' : 'debt-value'}>
              {formatFen(detail.total_unpaid)}
            </Text>
          </View>
        </View>
      </View>

      <View className="section-title">常用地址与联系方式</View>
      <View className="card">
        {detail.addresses.map((item) => (
          <View key={item.id} className="address-row">
            <View className="row-between">
              <Text className="address-row-label">
                {item.label || item.contact_name || '地址'}
                {item.is_default === 1 ? ' · 默认' : ''}
              </Text>
              <View className="address-actions">
                {item.is_default !== 1 && (
                  <Text className="primary-text" onClick={() => setDefaultAddress(item.id)}>
                    设为默认
                  </Text>
                )}
                <Text className="danger-text" onClick={() => removeAddress(item.id)}>
                  删除
                </Text>
              </View>
            </View>
            <Text>{item.address}</Text>
            {(item.contact_name || item.phone) && (
              <Text className="muted">{[item.contact_name, item.phone].filter(Boolean).join(' · ')}</Text>
            )}
          </View>
        ))}
        {!detail.addresses.length && <View className="empty">暂无地址，送货开单时可直接保存</View>}
        {showAddressForm ? (
          <View className="new-customer">
            <Input className="input field" placeholder="标签，如 家 / 店 / 仓库" value={addrLabel} onInput={(event) => setAddrLabel(event.detail.value)} />
            <Input className="input field" placeholder="联系人" value={addrContact} onInput={(event) => setAddrContact(event.detail.value)} />
            <Input className="input field" placeholder="电话" value={addrPhone} onInput={(event) => setAddrPhone(event.detail.value)} />
            <Input className="input field" placeholder="详细地址 *" value={addrAddress} onInput={(event) => setAddrAddress(event.detail.value)} />
            <View className="inline-actions">
              <Button className="btn btn-ghost" onClick={() => setShowAddressForm(false)}>
                取消
              </Button>
              <Button className="btn btn-primary" onClick={addAddress}>
                保存地址
              </Button>
            </View>
          </View>
        ) : (
          <Button className="btn btn-ghost full-btn" onClick={() => setShowAddressForm(true)}>
            新增地址
          </Button>
        )}
      </View>

      <View className="section-title">订单记录</View>
      {orders.map((order) => (
        <View
          key={order.id}
          className="order-card"
          onClick={() => Taro.navigateTo({ url: `/pages/order-detail/index?id=${order.id}` })}
        >
          <View className="row-between">
            <Text className="order-no">{order.order_no}</Text>
            <Text className={orderStatusTagClass(order)}>{orderStatusText(order)}</Text>
          </View>
          <Text className="muted">
            {order.created_at.slice(0, 16).replace('T', ' ')}
            {'items' in order && Array.isArray((order as { items?: unknown[] }).items)
              ? ` · ${(order as { items: unknown[] }).items.length} 个商品`
              : ''}
          </Text>
          <View className="row-between">
            <Text className="muted">
              {order.delivery_required ? (order.delivery_status === 'delivered' ? '已送达' : '待送货') : '到店自取'}
            </Text>
            <Text>
              {formatFen(order.total)}
              {orderRemaining(order) > 0 ? ` · 未收 ${formatFen(orderRemaining(order))}` : ''}
            </Text>
          </View>
        </View>
      ))}
      {!orders.length && <View className="empty">暂无订单</View>}
      {!!orders.length && (
        <View className="sm-list-footer">
          {orders.length < ordersTotal ? '上滑加载更多…' : `到底了，共 ${ordersTotal || orders.length} 单`}
        </View>
      )}
    </View>
  )
}
