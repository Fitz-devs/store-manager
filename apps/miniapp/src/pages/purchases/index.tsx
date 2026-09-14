import { useRef, useState } from 'react'
import Taro, { useDidShow, useReachBottom } from '@tarojs/taro'
import { Button, Input, Text, View } from '@tarojs/components'
import type { Purchase } from '@sm/shared'
import { api } from '../../api/client'
import ScanFab from '../../components/scan-fab'
import { useAuthGuard } from '../../utils/auth'
import { formatFen, PURCHASE_KIND_LABELS } from '../../utils/format'
import './index.scss'

export default function Purchases() {
  useAuthGuard()
  const [keyword, setKeyword] = useState('')
  const [items, setItems] = useState<Purchase[]>([])
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
      const data = await api.get<{ items: Purchase[]; total: number }>(`/api/purchases?${query.toString()}`)
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
    <View className="purchases-page">
      <View className="list-header">
        <View className="toolbar">
          <View className="sm-search">
            <Text className="sm-search-icon">🔍</Text>
            <Input
              className="sm-search-input"
              placeholder="搜索入库单号 / 供应商"
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
            onClick={() => Taro.navigateTo({ url: '/pages/purchase-new/index' })}
          >
            <Text>＋入库</Text>
          </View>
        </View>
      </View>

      {items.map((purchase) => (
        <View
          key={purchase.id}
          className="sm-list-card"
          onClick={() => Taro.navigateTo({ url: `/pages/purchase-detail/index?id=${purchase.id}` })}
        >
          <View className="row-between">
            <Text className="sm-list-card-title">{purchase.purchase_no}</Text>
            <Text className={purchase.kind === 'goods_offset' ? 'tag tag-warn' : 'tag tag-muted'}>
              {PURCHASE_KIND_LABELS[purchase.kind]}
            </Text>
          </View>
          <View className="row-between">
            <Text className="muted">
              {purchase.supplier_name || '未填供应商'} · {purchase.ordered_at.slice(0, 10)}
            </Text>
            <Text className="price-text sm-list-card-total">{formatFen(purchase.total_amount)}</Text>
          </View>
          {purchase.operator_name ? <Text className="muted">经办：{purchase.operator_name}</Text> : null}
        </View>
      ))}

      {!loading && !items.length && (
        <View className="sm-empty">
          <Text className="sm-empty-title">暂无入库记录</Text>
          <Text className="sm-empty-sub">进货后记一笔，方便对账与比价</Text>
          <View className="sm-empty-actions">
            <Button
              className="btn btn-primary"
              onClick={() => Taro.navigateTo({ url: '/pages/purchase-new/index' })}
            >
              去入库
            </Button>
          </View>
        </View>
      )}
      {loading && <View className="empty">加载中…</View>}
      {!loading && items.length > 0 && (
        <View className="sm-list-footer">
          {items.length < total ? '上滑加载更多…' : `到底了，共 ${total} 条`}
        </View>
      )}
      <View className="fab-spacer" />
      <ScanFab
        label="入库"
        icon="camera"
        onCustomTap={() => Taro.navigateTo({ url: '/pages/purchase-new/index?ocr=1' })}
      />
    </View>
  )
}
