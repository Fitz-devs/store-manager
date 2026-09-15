import { useRef, useState } from 'react'
import Taro, { useDidShow, usePullDownRefresh, useReachBottom } from '@tarojs/taro'
import { Button, Text, View } from '@tarojs/components'
import type { Purchase } from '@sm/shared'
import { api } from '../../api/client'
import ScanFab from '../../components/scan-fab'
import { EmptyState } from '../../components/empty-state'
import { ListLoading } from '../../components/list-loading'
import { SearchBox } from '../../components/search-box'
import { StatusTag } from '../../components/status-tag'
import { useAuthGuard } from '../../utils/auth'
import { formatFen, PURCHASE_KIND_LABELS } from '../../utils/format'
import './index.scss'

export default function Purchases() {
  useAuthGuard()
  const [keyword, setKeyword] = useState('')
  const keywordRef = useRef('')
  const [items, setItems] = useState<Purchase[]>([])
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
      const data = await api.get<{ items: Purchase[]; total: number }>(`/api/purchases?${query.toString()}`)
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
    <View className="purchases-page">
      <View className="list-header">
        <View className="toolbar">
          <SearchBox
            value={keyword}
            onChange={onKeywordChange}
            onSearch={() => load(1)}
            placeholder="搜索入库单号 / 供应商"
          />
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
            <StatusTag tone={purchase.kind === 'goods_offset' ? 'warn' : 'muted'}>
              {PURCHASE_KIND_LABELS[purchase.kind]}
            </StatusTag>
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
        <EmptyState
          title="暂无入库记录"
          sub="进货后记一笔，方便对账与比价"
          actions={[
            {
              label: '去入库',
              primary: true,
              onClick: () => Taro.navigateTo({ url: '/pages/purchase-new/index' }),
            },
          ]}
        />
      )}
      <ListLoading
        loading={loading}
        hasItems={items.length > 0}
        shown={items.length}
        total={total}
      />
      <View className="fab-spacer" />
      <ScanFab
        label="入库"
        icon="camera"
        onCustomTap={() => Taro.navigateTo({ url: '/pages/purchase-new/index?ocr=1' })}
      />
    </View>
  )
}
