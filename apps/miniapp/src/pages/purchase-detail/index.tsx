import { useState } from 'react'
import Taro, { useDidShow, useRouter, useShareAppMessage } from '@tarojs/taro'
import { Button, Image, Text, View } from '@tarojs/components'
import type { PurchaseWithItems } from '@sm/shared'
import { api, fileUrl } from '../../api/client'
import { useAuthGuard } from '../../utils/auth'
import { formatDateTime, formatFen } from '../../utils/format'
import { pickImages, uploadLocalImage } from '../../utils/media'
import './index.scss'

export default function PurchaseDetail() {
  useAuthGuard()
  const router = useRouter()
  const id = Number(router.params.id)
  const [purchase, setPurchase] = useState<PurchaseWithItems | null>(null)
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(false)

  const load = () => {
    if (!Number.isFinite(id)) {
      setLoadError('入库单不存在')
      return Promise.resolve()
    }
    setLoading(true)
    setLoadError('')
    return api
      .get<PurchaseWithItems>(`/api/purchases/${id}`)
      .then(setPurchase)
      .catch((error) => {
        setLoadError(error.message || '加载失败')
        Taro.showToast({ title: error.message, icon: 'none' })
      })
      .finally(() => setLoading(false))
  }

  useDidShow(() => {
    load()
  })

  // 微信小程序转发给同事
  useShareAppMessage(() => {
    if (!purchase) {
      return { title: '店铺管家', path: '/pages/purchases/index' }
    }
    const total = formatFen(purchase.total_amount)
    const title = `入库单 ${purchase.purchase_no} ${total}`.slice(0, 50)
    return {
      title,
      path: `/pages/purchase-detail/index?id=${purchase.id}`,
    }
  })

  const addImage = async () => {
    try {
      const images = await pickImages({ count: 1, source: 'both' })
      const image = images[0]
      if (!image) return
      Taro.showLoading({ title: '上传中' })
      const uploaded = await uploadLocalImage(image, 'purchases')
      const currentKeys = purchase && purchase.image_keys ? (JSON.parse(purchase.image_keys) as string[]) : []
      const nextKeys = Array.from(new Set([...currentKeys, uploaded.key])).slice(-10)
      const updated = await api.patch<PurchaseWithItems>(`/api/purchases/${id}`, { image_keys: nextKeys })
      Taro.hideLoading()
      Taro.showToast({ title: '已补充上传', icon: 'success' })
      setPurchase(updated)
    } catch (error) {
      Taro.hideLoading()
      const message = (error as Error).message ?? ''
      if (!message.includes('cancel')) Taro.showToast({ title: message || '上传失败', icon: 'none' })
    }
  }

  const purge = async () => {
    const confirm = await Taro.showModal({
      title: '彻底删除入库单',
      content:
        '仅删除这张入库单及其商品行（品种/数量/价格），商品档案、订单与回款记录均不受影响。删除后不可恢复，确定吗？',
      confirmColor: '#dc2626',
    })
    if (!confirm.confirm) return
    try {
      await api.delete(`/api/purchases/${id}/purge`)
      Taro.showToast({ title: '已彻底删除', icon: 'success' })
      setTimeout(() => Taro.navigateBack(), 400)
    } catch (error) {
      Taro.showToast({ title: (error as Error).message, icon: 'none' })
    }
  }

  if (!purchase) {
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
    return <View className="empty">{loading || Number.isFinite(id) ? '加载中…' : '入库单不存在'}</View>
  }

  const imageKeys: string[] = purchase.image_keys ? (JSON.parse(purchase.image_keys) as string[]) : []

  return (
    <View className="purchase-detail-page">
      <View className="card">
        <View className="row-between">
          <Text className="detail-no">{purchase.purchase_no}</Text>
          <Text className="tag tag-muted">入库</Text>
        </View>
        <View className="detail-meta">
          <Text className="muted">
            {purchase.supplier_name || '未填供应商'} · 入库日期 {purchase.ordered_at.slice(0, 10)}
          </Text>
          <Text className="muted">
            经办：{purchase.operator_name || '-'} · 录入：{formatDateTime(purchase.created_at)}
          </Text>
          {purchase.note ? <Text className="muted">备注：{purchase.note}</Text> : null}
        </View>
        <View className="detail-total-row">
          <Text className="muted">合计</Text>
          <Text className="price-text detail-total">{formatFen(purchase.total_amount)}</Text>
        </View>
      </View>

      <View className="section-title">商品明细</View>
      <View className="card">
        {purchase.items.map((item) => (
          <View
            key={item.id}
            className="item-row"
            onClick={() => {
              if (item.product_id) {
                Taro.navigateTo({ url: `/pages/product-detail/index?id=${item.product_id}` })
              }
            }}
          >
            <View className="item-main">
              <Text>
                {item.product_name}
                {item.spec_name ? ` · ${item.spec_name}` : ''}
              </Text>
              <Text className="muted">
                {item.qty}
                {item.unit_name} × {formatFen(item.unit_price)}
                {item.conversion > 1 ? `（1${item.unit_name}=${item.conversion}件）` : ''}
              </Text>
              {item.product_id ? <Text className="muted item-jump">查看商品 ›</Text> : null}
            </View>
            <View className="item-amount">
              <Text className="price-text">{formatFen(item.amount)}</Text>
            </View>
          </View>
        ))}
      </View>

      {!!imageKeys.length && (
        <>
          <View className="section-title">单据照片</View>
          <View className="card image-list">
            {imageKeys.map((key) => (
              <Image
                key={key}
                className="doc-image"
                src={fileUrl(key)}
                mode="aspectFill"
                onClick={() => Taro.previewImage({ current: fileUrl(key), urls: imageKeys.map(fileUrl) })}
              />
            ))}
          </View>
        </>
      )}

      <View className="footer-bar">
        <Button className="btn btn-secondary" onClick={addImage}>
          补充上传照片
        </Button>
        <Button className="btn btn-danger" onClick={purge}>
          彻底删除
        </Button>
      </View>
      <View style={{ height: '120px' }} />
    </View>
  )
}
