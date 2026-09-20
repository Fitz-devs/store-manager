import { useRef, useState } from 'react'
import Taro, { useDidShow, useReachBottom, useRouter, useShareAppMessage } from '@tarojs/taro'
import { Button, Input, Text, Textarea, View } from '@tarojs/components'
import type { CustomerDetail, Order } from '@sm/shared'
import { api } from '../../api/client'
import { useAuthGuard } from '../../utils/auth'
import { formatFen, orderRemaining, orderStatusTagClass, orderStatusText } from '../../utils/format'
import { hasCoords, openMapForNavigation, pickMapLocation, promptMapFallback, formatPickedAddress } from '../../utils/map'
import { SHARE_LOGO } from '../../utils/share'
import './index.scss'

export default function CustomerDetailPage() {
  useAuthGuard()
  const router = useRouter()
  const id = Number(router.params.id)
  const [detail, setDetail] = useState<CustomerDetail | null>(null)
  const [loadError, setLoadError] = useState('')
  const [loadingDetail, setLoadingDetail] = useState(false)
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
  const [addrLat, setAddrLat] = useState<number | null>(null)
  const [addrLng, setAddrLng] = useState<number | null>(null)
  const [pinningId, setPinningId] = useState<number | null>(null)

  const load = async () => {
    if (!Number.isFinite(id)) {
      setLoadError('客户不存在')
      return
    }
    setLoadingDetail(true)
    setLoadError('')
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
      setLoadError((error as Error).message || '加载失败')
      Taro.showToast({ title: (error as Error).message, icon: 'none' })
    } finally {
      setLoadingDetail(false)
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

  // 微信小程序转发给同事
  useShareAppMessage(() => {
    if (!detail) {
      return { title: '店铺管家', path: '/pages/customers/index', imageUrl: SHARE_LOGO }
    }
    const name = detail.name
    const unpaid = detail.total_unpaid
    const debt = unpaid && unpaid > 0 ? ` 欠款 ${formatFen(unpaid)}` : ''
    const title = `客户 ${name}${debt}`.slice(0, 50)
    return {
      title,
      path: `/pages/customer-detail/index?id=${detail.id}`,
      imageUrl: SHARE_LOGO,
    }
  })

  const resetAddressForm = () => {
    setAddrLabel('')
    setAddrContact('')
    setAddrPhone('')
    setAddrAddress('')
    setAddrLat(null)
    setAddrLng(null)
  }

  const pickFormLocation = async () => {
    const picked = await pickMapLocation(addrAddress.trim() || detail?.name || '')
    if (!picked) return
    setAddrLat(picked.lat)
    setAddrLng(picked.lng)
    // 回填「行政地址 + POI 名称」，用户可再改门牌
    setAddrAddress(formatPickedAddress(picked) || addrAddress)
  }

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
        lat: addrLat,
        lng: addrLng,
        is_default: !detail?.addresses.length,
      })
      Taro.showToast({ title: '地址已保存', icon: 'success' })
      resetAddressForm()
      setShowAddressForm(false)
      load()
    } catch (error) {
      Taro.showToast({ title: (error as Error).message, icon: 'none' })
    }
  }

  const pinExistingAddress = async (item: { id: number; address: string }) => {
    if (pinningId) return
    setPinningId(item.id)
    try {
      const picked = await pickMapLocation(item.address)
      if (!picked) return
      // 只更新坐标，保留原详细地址
      await api.patch(`/api/customers/${id}/addresses/${item.id}`, {
        lat: picked.lat,
        lng: picked.lng,
      })
      Taro.showToast({ title: '已保存坐标', icon: 'success' })
      await load()
      await openMapForNavigation({
        lat: picked.lat,
        lng: picked.lng,
        address: item.address,
        name: item.address,
      })
    } catch (error) {
      Taro.showToast({ title: (error as Error).message, icon: 'none' })
    } finally {
      setPinningId(null)
    }
  }

  const openAddressMap = async (item: {
    id: number
    address: string
    lat: number | null
    lng: number | null
    label: string | null
    contact_name: string | null
  }) => {
    const result = await openMapForNavigation({
      lat: item.lat,
      lng: item.lng,
      address: item.address,
      name: item.address,
    })
    if (result === 'picked-later') {
      const action = await promptMapFallback(item.address)
      if (action === 'pick') await pinExistingAddress(item)
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

  if (!detail) {
    if (loadError) {
      return (
        <View className="sm-empty">
          <Text className="sm-empty-title">加载失败</Text>
          <Text className="sm-empty-sub">{loadError}</Text>
          <View className="sm-empty-actions">
            <Button className="btn btn-primary" onClick={() => load()}>
              重试
            </Button>
          </View>
        </View>
      )
    }
    return <View className="empty">{loadingDetail || Number.isFinite(id) ? '加载中…' : '客户不存在'}</View>
  }

  return (
    <View className="customer-detail-page">
      <View className="card">
        <View className="customer-head">
          <View className="row-between">
            <Text className="customer-name">{detail.name}</Text>
            <Text
              className="sm-action"
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
                  <Text className="sm-action" onClick={() => setDefaultAddress(item.id)}>
                    设为默认
                  </Text>
                )}
                <Text className="sm-action" onClick={() => pinExistingAddress(item)}>
                  {hasCoords(item) ? '重选坐标' : '地图选点'}
                </Text>
                <Text className="sm-action sm-action-danger" onClick={() => removeAddress(item.id)}>
                  删除
                </Text>
              </View>
            </View>
            <Text
              className={hasCoords(item) ? 'address-link-ready' : undefined}
              onClick={() => openAddressMap(item)}
            >
              {item.address}
              {hasCoords(item) ? ' · 导航' : ' · 点此定位'}
            </Text>
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
            <Input className="input field" type="tel" maxlength={20} placeholder="电话" value={addrPhone} onInput={(event) => setAddrPhone(event.detail.value)} />
            <Textarea
              className="input field sm-textarea"
              placeholder="详细地址 *（选点后可补门牌等）"
              value={addrAddress}
              maxlength={200}
              autoHeight
              onInput={(event) => setAddrAddress(event.detail.value)}
            />
            <View className="inline-actions">
              <Button className="btn btn-ghost" onClick={pickFormLocation}>
                地图选点
              </Button>
              <Button className="btn btn-ghost" onClick={() => setShowAddressForm(false)}>
                取消
              </Button>
              <Button className="btn btn-primary" onClick={addAddress}>
                保存地址
              </Button>
            </View>
            {addrLat != null && addrLng != null ? (
              <Text className="muted">已选坐标 {addrLat.toFixed(5)}, {addrLng.toFixed(5)}</Text>
            ) : null}
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
          className="sm-list-card"
          onClick={() => Taro.navigateTo({ url: `/pages/order-detail/index?id=${order.id}` })}
        >
          <View className="row-between">
            <Text className="sm-list-card-title">{order.order_no}</Text>
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
            <Text className="price-text sm-list-card-total">
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
