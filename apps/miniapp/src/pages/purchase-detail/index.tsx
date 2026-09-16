import { useState } from 'react'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import { Button, Image, Text, View } from '@tarojs/components'
import type { PurchaseWithItems } from '@sm/shared'
import { api, fileUrl } from '../../api/client'
import { useAuthGuard } from '../../utils/auth'
import { formatDateTime, formatFen, PURCHASE_KIND_LABELS } from '../../utils/format'
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
          <Text className={`tag ${purchase.kind === 'goods_offset' ? 'tag-warn' : 'tag-muted'}`}>
            {PURCHASE_KIND_LABELS[purchase.kind]}
          </Text>
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
    </View>
  )
}
