import { useState } from 'react'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import { Button, Canvas, Image, Input, Text, View } from '@tarojs/components'
import type { OrderWithItems, ProductDetail, ProductListItem, User } from '@sm/shared'
import { api, fileUrl, getUser } from '../../api/client'
import { useAuthGuard } from '../../utils/auth'
import { pickImages, uploadLocalImage } from '../../utils/media'
import {
  fenToYuan,
  formatDateTime,
  formatFen,
  orderStatusTagClass,
  orderStatusText,
  PAYMENT_METHOD_LABELS,
  yuanToFen,
} from '../../utils/format'
import { watermarkPhoto } from '../../utils/watermark'
import './index.scss'

type PayMethod = 'cash' | 'wechat' | 'alipay' | 'goods'

interface GoodsItem {
  sku_id: number
  productName: string
  unit_name: string
  conversion: string
  qty: string
  unit_price: string
}

export default function OrderDetailPage() {
  useAuthGuard()
  const router = useRouter()
  const id = Number(router.params.id)
  const [order, setOrder] = useState<OrderWithItems | null>(null)
  const [loadError, setLoadError] = useState('')
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [showPay, setShowPay] = useState(false)
  const [method, setMethod] = useState<PayMethod>('wechat')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [goodsItems, setGoodsItems] = useState<GoodsItem[]>([])
  const [keyword, setKeyword] = useState('')
  const [results, setResults] = useState<ProductListItem[]>([])
  const [busy, setBusy] = useState(false)

  const load = async () => {
    if (!Number.isFinite(id)) {
      setLoadError('订单不存在')
      return
    }
    setLoadingDetail(true)
    setLoadError('')
    try {
      const data = await api.get<OrderWithItems>(`/api/orders/${id}`)
      setOrder(data)
      setAmount(fenToYuan(data.remaining))
    } catch (error) {
      setLoadError((error as Error).message || '加载失败')
      Taro.showToast({ title: (error as Error).message, icon: 'none' })
    } finally {
      setLoadingDetail(false)
    }
  }

  useDidShow(() => {
    load()
  })

  const deliver = async () => {
    if (!order) return
    try {
      const images = await pickImages({ count: 1, source: 'both' })
      const image = images[0]
      if (!image) return
      Taro.showLoading({ title: '生成水印' })
      const user = getUser<User>()
      const watermarked = await watermarkPhoto(image.path, 'wm-canvas', {
        address: order.delivery_address,
        operator: user?.nickname || user?.username,
      })
      Taro.showLoading({ title: '上传中' })
      const uploaded = await uploadLocalImage({ path: watermarked.path, file: watermarked.file }, 'deliveries')
      await api.post(`/api/orders/${id}/deliver`, { photo_key: uploaded.key })
      Taro.hideLoading()
      Taro.showToast({ title: '已记录送达', icon: 'success' })
      load()
    } catch (error) {
      Taro.hideLoading()
      const message = (error as Error).message ?? ''
      if (!message.includes('cancel')) {
        Taro.showToast({ title: message || '操作失败', icon: 'none' })
      }
    }
  }

  const search = async (value?: string) => {
    const q = (value ?? keyword).trim()
    if (!q) {
      setResults([])
      return
    }
    try {
      const data = await api.get<{ items: ProductListItem[] }>(
        `/api/products?q=${encodeURIComponent(q)}&page_size=10`,
      )
      setResults(data.items)
    } catch (error) {
      Taro.showToast({ title: (error as Error).message, icon: 'none' })
    }
  }

  const addGoodsItem = async (productId: number) => {
    try {
      const detail = await api.get<ProductDetail>(`/api/products/${productId}`)
      const active = detail.skus.filter((sku) => sku.status === 'active')
      if (!active.length) return
      let sku = active[0]!
      if (active.length > 1) {
        const sheet = await Taro.showActionSheet({
          itemList: active.map((item) => `${item.spec_name ?? '默认'} ${formatFen(item.latest_purchase_price)}`),
        })
        sku = active[sheet.tapIndex] ?? active[0]!
      }
      setGoodsItems((previous) => [
        ...previous,
        {
          sku_id: sku.id,
          productName: detail.product.name,
          unit_name: sku.sale_unit,
          conversion: '1',
          qty: '1',
          unit_price: sku.latest_purchase_price ? fenToYuan(sku.latest_purchase_price) : '',
        },
      ])
      setResults([])
      setKeyword('')
    } catch (error) {
      Taro.showToast({ title: (error as Error).message, icon: 'none' })
    }
  }

  const updateGoodsItem = (index: number, patch: Partial<GoodsItem>) => {
    setGoodsItems((previous) => {
      const next = [...previous]
      next[index] = { ...next[index]!, ...patch }
      return next
    })
  }

  const goodsTotal = goodsItems.reduce(
    (sum, item) => sum + yuanToFen(item.unit_price) * (Number(item.qty) || 0),
    0,
  )

  const submitPayment = async () => {
    const amountFen = method === 'goods' ? goodsTotal : yuanToFen(amount)
    if (amountFen <= 0) {
      Taro.showToast({ title: '请输入回款金额', icon: 'none' })
      return
    }
    if (method === 'goods' && !goodsItems.length) {
      Taro.showToast({ title: '请添加抵扣商品', icon: 'none' })
      return
    }
    setBusy(true)
    try {
      await api.post('/api/payments', {
        order_id: id,
        method,
        amount: amountFen,
        note: note.trim() || null,
        goods_items:
          method === 'goods'
            ? goodsItems.map((item) => ({
                sku_id: item.sku_id,
                unit_name: item.unit_name || '件',
                conversion: Number(item.conversion) || 1,
                qty: Number(item.qty) || 1,
                unit_price: yuanToFen(item.unit_price),
              }))
            : undefined,
      })
      Taro.showToast({ title: '回款已记录', icon: 'success' })
      setShowPay(false)
      setGoodsItems([])
      setNote('')
      load()
    } catch (error) {
      Taro.showToast({ title: (error as Error).message, icon: 'none' })
    } finally {
      setBusy(false)
    }
  }

  const voidOrder = async () => {
    const confirm = await Taro.showModal({ title: '作废订单', content: '作废后订单不再计入欠款，确定吗？' })
    if (!confirm.confirm) return
    try {
      await api.post(`/api/orders/${id}/void`)
      Taro.showToast({ title: '已作废', icon: 'success' })
      load()
    } catch (error) {
      Taro.showToast({ title: (error as Error).message, icon: 'none' })
    }
  }

  if (!order) {
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
    return (
      <View className="empty">{loadingDetail || Number.isFinite(id) ? '加载中…' : '订单不存在'}</View>
    )
  }

  const methods: PayMethod[] = ['wechat', 'alipay', 'cash', 'goods']

  return (
    <View className="order-detail-page">
      <View className="card">
        <View className="row-between">
          <Text className="order-no">{order.order_no}</Text>
          <Text className={orderStatusTagClass(order)}>{orderStatusText(order)}</Text>
        </View>
        <Text className="muted">
          {order.customer_name || '散客'} · {formatDateTime(order.created_at)}
        </Text>
        <Text className="muted">经办：{order.operator_name || '-'}</Text>
        {order.note ? <Text className="muted">备注：{order.note}</Text> : null}
        <View className="amount-row">
          <Text className="muted">合计</Text>
          <Text className="price-text amount-value">{formatFen(order.total)}</Text>
        </View>
        <View className="row-between">
          <Text className="muted">已收 {formatFen(order.paid_amount)}</Text>
          <Text className={order.remaining > 0 ? 'danger-text' : 'muted'}>
            未收 {formatFen(order.remaining)}
          </Text>
        </View>
      </View>

      <View className="section-title">商品</View>
      <View className="card">
        {order.items.map((item) => (
          <View key={item.id} className="item-row">
            <View className="item-main">
              <Text>
                {item.product_name}
                {item.spec_name ? ` · ${item.spec_name}` : ''}
              </Text>
              <Text className="muted">
                {item.qty}
                {item.unit_name} × {formatFen(item.unit_price)}
              </Text>
            </View>
            <Text className="price-text">{formatFen(item.amount)}</Text>
          </View>
        ))}
      </View>

      {order.delivery_required ? (
        <>
          <View className="section-title">送货</View>
          <View className="card">
            <Text>地址：{order.delivery_address || '-'}</Text>
            <Text className="muted">
              {order.delivery_contact || ''} {order.delivery_phone || ''}
            </Text>
            <Text className="muted">
              约定：{order.delivery_at || '-'} · 状态：
              {order.delivery_status === 'delivered' ? `已送达（${formatDateTime(order.delivered_at)}）` : '待送货'}
            </Text>
            {order.delivery_photo_key ? (
              <Image
                className="delivery-photo"
                src={fileUrl(order.delivery_photo_key)}
                mode="aspectFill"
                onClick={() =>
                  Taro.previewImage({ current: fileUrl(order.delivery_photo_key), urls: [fileUrl(order.delivery_photo_key)] })
                }
              />
            ) : null}
            {order.delivery_status !== 'delivered' && order.status === 'open' ? (
              <Button className="btn btn-primary full-btn" onClick={deliver}>
                拍照送达（带时间/地址水印）
              </Button>
            ) : null}
          </View>
        </>
      ) : null}

      <View className="section-title">回款记录</View>
      <View className="card">
        {order.payments.map((payment) => (
          <View key={payment.id} className="payment-row">
            <View>
              <Text>{PAYMENT_METHOD_LABELS[payment.method]}</Text>
              <Text className="muted">
                {' '}
                {formatDateTime(payment.received_at)} {payment.note ? `· ${payment.note}` : ''}
              </Text>
            </View>
            <Text className="price-text">{formatFen(payment.amount)}</Text>
          </View>
        ))}
        {!order.payments.length && <View className="empty">暂无回款</View>}
      </View>

      {showPay ? (
        <View className="card">
          <Text className="section-title">记一笔回款</Text>
          <View className="method-row">
            {methods.map((value) => (
              <View
                key={value}
                className={`method-chip ${method === value ? 'method-chip-active' : ''}`}
                onClick={() => setMethod(value)}
              >
                {PAYMENT_METHOD_LABELS[value]}
              </View>
            ))}
          </View>

          {method === 'goods' ? (
            <View>
              <View className="search-row">
                <Input
                  className="input search-input"
                  placeholder="搜索抵扣商品"
                  value={keyword}
                  confirmType="search"
                  onInput={(event) => setKeyword(event.detail.value)}
                  onConfirm={() => search()}
                />
              </View>
              {results.map((product) => (
                <View key={product.id} className="search-item" onClick={() => addGoodsItem(product.id)}>
                  <Text>{product.name}</Text>
                  <Text className="muted">{product.sku_count} 版本</Text>
                </View>
              ))}
              {goodsItems.map((item, index) => (
                <View key={index} className="goods-item">
                  <View className="row-between">
                    <Text>{item.productName}</Text>
                    <Text className="danger-text" onClick={() => setGoodsItems((previous) => previous.filter((_, i) => i !== index))}>
                      删除
                    </Text>
                  </View>
                  <View className="field-row">
                    <Input className="input quarter" type="digit" placeholder="数量" value={item.qty} onInput={(event) => updateGoodsItem(index, { qty: event.detail.value })} />
                    <Input className="input quarter" placeholder="单位" value={item.unit_name} onInput={(event) => updateGoodsItem(index, { unit_name: event.detail.value })} />
                    <Input className="input quarter" type="number" placeholder="换算" value={item.conversion} onInput={(event) => updateGoodsItem(index, { conversion: event.detail.value })} />
                    <Input className="input quarter" type="digit" placeholder="单价" value={item.unit_price} onInput={(event) => updateGoodsItem(index, { unit_price: event.detail.value })} />
                  </View>
                </View>
              ))}
              <View className="row-between">
                <Text className="muted">抵扣金额</Text>
                <Text className="price-text">{formatFen(goodsTotal)}</Text>
              </View>
            </View>
          ) : (
            <View className="field">
              <Text className="field-label">回款金额（元）</Text>
              <Input className="input" type="digit" value={amount} onInput={(event) => setAmount(event.detail.value)} />
            </View>
          )}

          <View className="field">
            <Text className="field-label">备注</Text>
            <Input className="input" placeholder="如 部分现金" value={note} onInput={(event) => setNote(event.detail.value)} />
          </View>
          <View className="inline-actions">
            <Button className="btn btn-ghost" onClick={() => setShowPay(false)}>
              取消
            </Button>
            <Button className="btn btn-primary" loading={busy} onClick={submitPayment}>
              确认回款
            </Button>
          </View>
        </View>
      ) : order.status === 'open' ? (
        <View className="footer-bar">
          <Button className="btn btn-danger" onClick={voidOrder}>
            作废
          </Button>
          <Button className="btn btn-primary" onClick={() => setShowPay(true)}>
            记回款
          </Button>
        </View>
      ) : null}

      <Canvas type="2d" id="wm-canvas" className="hidden-canvas" />
    </View>
  )
}
