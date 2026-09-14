import { useState } from 'react'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import { Image, Text, View } from '@tarojs/components'
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

  useDidShow(() => {
    if (!Number.isFinite(id)) return
    api
      .get<PurchaseWithItems>(`/api/purchases/${id}`)
      .then(setPurchase)
      .catch((error) => Taro.showToast({ title: error.message, icon: 'none' }))
  })

  if (!purchase) {
    return <View className="empty">加载中…</View>
  }

  const imageKeys: string[] = purchase.image_keys ? (JSON.parse(purchase.image_keys) as string[]) : []

  return (
    <View className="purchase-detail-page">
      <View className="card">
        <View className="row-between">
          <Text className="detail-no">{purchase.purchase_no}</Text>
          <Text className="tag">{PURCHASE_KIND_LABELS[purchase.kind]}</Text>
        </View>
        <Text className="muted">
          {purchase.supplier_name || '未填供应商'} · 入库日期 {purchase.ordered_at.slice(0, 10)}
        </Text>
        <Text className="muted">
          经办：{purchase.operator_name || '-'} · 录入：{formatDateTime(purchase.created_at)}
        </Text>
        {purchase.note ? <Text className="muted">备注：{purchase.note}</Text> : null}
        <Text className="price-text detail-total">{formatFen(purchase.total_amount)}</Text>
      </View>

      <View className="section-title">商品明细</View>
      <View className="card">
        {purchase.items.map((item) => (
          <View key={item.id} className="item-row">
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
            </View>
            <View className="item-amount">
              <Text className="price-text">{formatFen(item.amount)}</Text>
              {item.price_changed ? <Text className="tag tag-warn">入库价变动</Text> : null}
              {item.retail_updated ? <Text className="tag tag-success">已更新售价</Text> : null}
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
