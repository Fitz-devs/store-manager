import { useRef, useState } from 'react'
import Taro, { useDidShow, usePullDownRefresh } from '@tarojs/taro'
import { Input, Text, View } from '@tarojs/components'
import type { HomeReport, ProductListItem } from '@sm/shared'
import { api } from '../../api/client'
import ScanFab from '../../components/scan-fab'
import { useAuthGuard } from '../../utils/auth'
import { scanBarcode } from '../../utils/scan'
import { scanAndGo } from '../../utils/scanGo'
import { formatFen, orderRemaining } from '../../utils/format'
import { setPendingOrdersFilter } from '../../utils/orderFilter'
import './index.scss'

export default function Products() {
  useAuthGuard()
  const [keyword, setKeyword] = useState('')
  const [suggests, setSuggests] = useState<ProductListItem[]>([])
  const [report, setReport] = useState<HomeReport | null>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadReport = () => {
    api.get<HomeReport>('/api/reports/home').then(setReport).catch(() => undefined)
  }

  useDidShow(() => {
    loadReport()
    setKeyword('')
    setSuggests([])
  })

  usePullDownRefresh(() => {
    loadReport()
    Taro.stopPullDownRefresh()
  })

  const onKeywordInput = (value: string) => {
    setKeyword(value)
    if (!value.trim()) {
      setSuggests([])
      return
    }
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      api
        .get<{ items: ProductListItem[] }>(`/api/products?q=${encodeURIComponent(value.trim())}&page_size=8`)
        .then((data) => setSuggests(data.items))
        .catch(() => undefined)
    }, 350)
  }

  const openList = (q?: string) => {
    const query = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''
    Taro.navigateTo({ url: `/pages/product-list/index${query}` })
  }

  const openStockList = () => {
    Taro.navigateTo({ url: '/pages/product-list/index?stock=1' })
  }

  const scan = async () => {
    const code = await scanBarcode()
    if (!code) return
    scanAndGo(code)
  }

  const addProduct = () => {
    Taro.navigateTo({ url: '/pages/product-edit/index' })
  }

  return (
    <View className="products-page">
      <View className="search-header">
        <View className="toolbar">
          <View
            className="sm-search"
            onClick={() => openList()}
          >
            <Text className="sm-search-icon">🔍</Text>
            <Input
              className="sm-search-input"
              placeholder="搜名称 / 别名 / 分类 / 商品码"
              value={keyword}
              confirmType="search"
              onInput={(event) => onKeywordInput(event.detail.value)}
              onConfirm={() => openList(keyword)}
            />
          </View>
        </View>
      </View>

      <View className="home-guide">
        {report ? (
          <View className="card home-stats">
            <View
              className="home-stat"
              onClick={() => {
                setPendingOrdersFilter('unpaid')
                Taro.switchTab({ url: '/pages/orders/index' })
              }}
            >
              <Text className="home-stat-value warn-text">{formatFen(report.unpaid_total)}</Text>
              <Text className="muted">待收款 {report.unpaid_order_count} 单</Text>
            </View>
            <View className="home-stat">
              <Text className="home-stat-value">{formatFen(report.today_sales)}</Text>
              <Text className="muted">今日销售 {report.today_order_count} 单</Text>
            </View>
            <View className="home-stat" onClick={openStockList}>
              <Text className="home-stat-value danger-text">{report.out_of_stock_count}</Text>
              <Text className="muted">缺货商品</Text>
            </View>
          </View>
        ) : (
          <View className="card home-stats">
            <View className="home-stat">
              <Text className="home-stat-value muted">--</Text>
              <Text className="muted">待收款</Text>
            </View>
            <View className="home-stat">
              <Text className="home-stat-value muted">--</Text>
              <Text className="muted">今日销售</Text>
            </View>
            <View className="home-stat">
              <Text className="home-stat-value muted">--</Text>
              <Text className="muted">缺货商品</Text>
            </View>
          </View>
        )}

        <View className="guide-actions">
          <View
            className="guide-tile guide-tile-primary"
            onClick={() => Taro.switchTab({ url: '/pages/order-new/index' })}
          >
            <Text className="guide-tile-title">开单</Text>
          </View>
          <View className="guide-tile" onClick={scan}>
            <Text className="guide-tile-title">扫码查价</Text>
          </View>
          <View className="guide-tile" onClick={addProduct}>
            <Text className="guide-tile-title">新增商品</Text>
          </View>
          <View className="guide-tile" onClick={() => openList()}>
            <Text className="guide-tile-title">全部商品</Text>
          </View>
        </View>

        {!!suggests.length && (
          <View className="card">
            <View className="row-between">
              <Text className="card-title">搜索结果</Text>
              <Text className="primary-text" onClick={() => openList(keyword)}>
                全部 ›
              </Text>
            </View>
            {suggests.map((product) => (
              <View
                key={product.id}
                className="guide-order"
                onClick={() => Taro.navigateTo({ url: `/pages/product-detail/index?id=${product.id}` })}
              >
                <View className="guide-order-main">
                  <Text className="guide-order-no">{product.name}</Text>
                  <Text className="muted">
                    {[product.category, product.brand].filter(Boolean).join(' · ') || '未分类'}
                  </Text>
                </View>
                <Text className="price-text">
                  {product.min_retail_price === product.max_retail_price
                    ? formatFen(product.min_retail_price)
                    : `${formatFen(product.min_retail_price)} ~ ${formatFen(product.max_retail_price)}`}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <View className="fab-spacer" />
      <ScanFab />
    </View>
  )
}
