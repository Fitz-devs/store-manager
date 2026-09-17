import { useState } from 'react'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import { Button, Canvas, Image, Input, Text, View } from '@tarojs/components'
import type { OrderWithItems, User } from '@sm/shared'
import { api, fileUrl, getUser } from '../../api/client'
import { PH } from '../../config/placeholders'
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

type PayMethod = 'cash' | 'wechat' | 'alipay' | 'other'

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
  const [otherReason, setOtherReason] = useState('')
  const [payPhotoKey, setPayPhotoKey] = useState<string | null>(null)
  const [uploadingPayPhoto, setUploadingPayPhoto] = useState(false)
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

  const addPayPhoto = async () => {
    try {
      const images = await pickImages({ count: 1, source: 'both' })
      const image = images[0]
      if (!image) return
      setUploadingPayPhoto(true)
      const uploaded = await uploadLocalImage({ path: image.path, file: image.file }, 'misc')
      setPayPhotoKey(uploaded.key)
    } catch (error) {
      const message = (error as Error).message ?? ''
      if (!message.includes('cancel')) Taro.showToast({ title: message || '上传失败', icon: 'none' })
    } finally {
      setUploadingPayPhoto(false)
    }
  }

  const submitPayment = async () => {
    const amountFen = yuanToFen(amount)
    if (amountFen <= 0) {
      Taro.showToast({ title: method === 'other' ? '请输入抵扣金额' : '请输入回款金额', icon: 'none' })
      return
    }
    setBusy(true)
    try {
      await api.post('/api/payments', {
        order_id: id,
        method,
        amount: amountFen,
        note: (method === 'other' ? otherReason : note).trim() || null,
        photo_key: payPhotoKey,
      })
      Taro.showToast({ title: '回款已记录', icon: 'success' })
      setShowPay(false)
      setNote('')
      setOtherReason('')
      setPayPhotoKey(null)
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

  const purgeOrder = async () => {
    const confirm = await Taro.showModal({
      title: '彻底删除订单',
      content:
        '仅删除这张订单、其商品行与回款记录，商品档案与入库记录不受影响。删除后不可恢复，确定吗？',
      confirmColor: '#dc2626',
    })
    if (!confirm.confirm) return
    try {
      await api.delete(`/api/orders/${id}/purge`)
      Taro.showToast({ title: '已彻底删除', icon: 'success' })
      setTimeout(() => Taro.navigateBack(), 400)
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

  const methods: PayMethod[] = ['wechat', 'alipay', 'cash', 'other']

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
            <View className="payment-main">
              <View>
                <Text>{PAYMENT_METHOD_LABELS[payment.method]}</Text>
                <Text className="muted">
                  {' '}
                  {formatDateTime(payment.received_at)} {payment.note ? `· ${payment.note}` : ''}
                </Text>
              </View>
              {payment.photo_key ? (
                <Image
                  className="payment-photo"
                  src={fileUrl(payment.photo_key)}
                  mode="aspectFill"
                  onClick={() => {
                    const url = fileUrl(payment.photo_key)
                    Taro.previewImage({ current: url, urls: [url] })
                  }}
                />
              ) : null}
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

          {method === 'other' ? (
            <View>
              <View className="field">
                <Text className="field-label">抵扣原因</Text>
                <Input
                  className="input"
                  placeholder={PH.otherReason}
                  value={otherReason}
                  onInput={(event) => setOtherReason(event.detail.value)}
                />
              </View>
              <View className="field">
                <Text className="field-label">抵扣金额（元）</Text>
                <Input className="input" type="digit" value={amount} onInput={(event) => setAmount(event.detail.value)} />
                <Text className="muted">按抵扣金额计入已收款，原因记录到回款备注</Text>
              </View>
            </View>
          ) : (
            <View className="field">
              <Text className="field-label">回款金额（元）</Text>
              <Input className="input" type="digit" value={amount} onInput={(event) => setAmount(event.detail.value)} />
            </View>
          )}

          {method !== 'other' && (
            <View className="field">
              <Text className="field-label">备注</Text>
              <Input className="input" placeholder="如 部分现金" value={note} onInput={(event) => setNote(event.detail.value)} />
            </View>
          )}

          <View className="field">
            <Text className="field-label">凭证照片（可选）</Text>
            {payPhotoKey ? (
              <View className="pay-photo-row">
                <Image
                  className="pay-photo-thumb"
                  src={fileUrl(payPhotoKey)}
                  mode="aspectFill"
                  onClick={() => Taro.previewImage({ current: fileUrl(payPhotoKey), urls: [fileUrl(payPhotoKey)] })}
                />
                <Text className="danger-text" onClick={() => setPayPhotoKey(null)}>
                  删除
                </Text>
              </View>
            ) : (
              <Button className="btn btn-ghost full-btn" loading={uploadingPayPhoto} onClick={addPayPhoto}>
                拍照/上传凭证
              </Button>
            )}
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
        order.remaining > 0 ? (
          <View className="footer-bar">
            <Button className="btn btn-ghost" onClick={voidOrder}>
              作废
            </Button>
            <Button className="btn btn-danger" onClick={purgeOrder}>
              彻底删除
            </Button>
            <Button className="btn btn-primary" onClick={() => setShowPay(true)}>
              记回款
            </Button>
          </View>
        ) : (
          <View className="footer-bar">
            <Button className="btn btn-danger" onClick={purgeOrder}>
              彻底删除
            </Button>
          </View>
        )
      ) : order.status === 'void' ? (
        <View className="footer-bar">
          <Button className="btn btn-danger" onClick={purgeOrder}>
            彻底删除
          </Button>
        </View>
      ) : null}

      <Canvas type="2d" id="wm-canvas" className="hidden-canvas" />
    </View>
  )
}
