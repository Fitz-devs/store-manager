import { useRef, useState } from 'react'
import Taro, { useDidShow, usePullDownRefresh, useReachBottom, useRouter } from '@tarojs/taro'
import { Button, Image, Input, Text, View } from '@tarojs/components'
import type { ProductListItem } from '@sm/shared'
import { api, fileUrl } from '../../api/client'
import ScanFab from '../../components/scan-fab'
import { useAuthGuard } from '../../utils/auth'
import { scanBarcode } from '../../utils/scan'
import { scanAndGo } from '../../utils/scanGo'
import { formatFen } from '../../utils/format'
import './index.scss'

interface Query {
  q: string
  stockOnly: boolean
  category: string
  archived: boolean
}

export default function ProductList() {
  useAuthGuard()
  const router = useRouter()
  const initialQ = decodeURIComponent(router.params.q || '')
  const initialStock = router.params.stock === '1'
  const [query, setQuery] = useState<Query>({ q: initialQ, stockOnly: initialStock, category: '', archived: false })
  const [categories, setCategories] = useState<string[]>([])
  const [items, setItems] = useState<ProductListItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const queryRef = useRef(query)
  const requestRef = useRef(0)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const updateQuery = (patch: Partial<Query>) => {
    const next = { ...queryRef.current, ...patch }
    queryRef.current = next
    setQuery(next)
    return next
  }

  const load = async (nextPage: number, append: boolean, params: Query) => {
    const request = requestRef.current + 1
    requestRef.current = request
    if (!append) setLoading(true)
    try {
      const search = new URLSearchParams()
      if (params.q.trim()) search.set('q', params.q.trim())
      if (params.stockOnly) search.set('stock', 'out_of_stock')
      if (params.category) search.set('category', params.category)
      if (params.archived) search.set('status', 'archived')
      search.set('page', String(nextPage))
      search.set('page_size', '20')
      const data = await api.get<{ items: ProductListItem[]; total: number }>(
        `/api/products?${search.toString()}`,
      )
      if (requestRef.current !== request) return
      setItems((previous) => (append ? [...previous, ...data.items] : data.items))
      setTotal(data.total)
      setPage(nextPage)
    } catch (error) {
      if (requestRef.current !== request) return
      Taro.showToast({ title: (error as Error).message, icon: 'none' })
    } finally {
      if (requestRef.current === request) setLoading(false)
    }
  }

  const loadCategories = () => {
    api
      .get<Array<{ id: number; name: string }>>('/api/categories')
      .then((rows) => setCategories(rows.map((row) => row.name)))
      .catch(() => undefined)
  }

  useDidShow(() => {
    loadCategories()
    load(1, false, queryRef.current).catch(() => undefined)
  })

  usePullDownRefresh(() => {
    loadCategories()
    load(1, false, queryRef.current)
      .catch(() => undefined)
      .finally(() => Taro.stopPullDownRefresh())
  })

  useReachBottom(() => {
    if (!loading && items.length < total) {
      load(page + 1, true, queryRef.current).catch(() => undefined)
    }
  })

  const onKeywordInput = (value: string) => {
    const next = updateQuery({ q: value })
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => load(1, false, next).catch(() => undefined), 350)
  }

  const scan = async () => {
    const code = await scanBarcode()
    if (!code) return
    scanAndGo(code)
  }

  const quickAdd = (id: number) => {
    Taro.setStorageSync('sm_quick_add_product', id)
    Taro.switchTab({ url: '/pages/order-new/index' })
  }

  const addProduct = (name?: string) => {
    const suffix = name?.trim() ? `?name=${encodeURIComponent(name.trim())}` : ''
    Taro.navigateTo({ url: `/pages/product-edit/index${suffix}` })
  }

  const showEmptyResult = !loading && !items.length

  return (
    <View className="product-list-page">
      <View className="list-header">
        <View className="toolbar">
          <View className="sm-search">
            <Text className="sm-search-icon">🔍</Text>
            <Input
              className="sm-search-input"
              placeholder="搜名称 / 别名 / 分类 / 商品码"
              value={query.q}
              confirmType="search"
              onInput={(event) => onKeywordInput(event.detail.value)}
              onConfirm={() => {
                if (searchTimer.current) clearTimeout(searchTimer.current)
                load(1, false, queryRef.current).catch(() => undefined)
              }}
            />
            {query.q ? (
              <Text
                className="sm-search-clear"
                onClick={() => {
                  if (searchTimer.current) clearTimeout(searchTimer.current)
                  load(1, false, updateQuery({ q: '' })).catch(() => undefined)
                }}
              >
                ✕
              </Text>
            ) : null}
          </View>
        </View>

        <View className="filter-scroll">
          <View
            className={`sm-chip ${!query.stockOnly && !query.category && !query.archived ? 'sm-chip-active' : ''}`}
            onClick={() => load(1, false, updateQuery({ stockOnly: false, category: '', archived: false })).catch(() => undefined)}
          >
            全部
          </View>
          <View
            className={`sm-chip ${query.stockOnly ? 'sm-chip-active' : ''}`}
            onClick={() => load(1, false, updateQuery({ stockOnly: !queryRef.current.stockOnly })).catch(() => undefined)}
          >
            只看缺货
          </View>
          <View
            className={`sm-chip ${query.archived ? 'sm-chip-active' : ''}`}
            onClick={() => load(1, false, updateQuery({ archived: !queryRef.current.archived })).catch(() => undefined)}
          >
            已下架
          </View>
          {categories.map((name) => (
            <View
              key={name}
              className={`sm-chip ${query.category === name ? 'sm-chip-active' : ''}`}
              onClick={() =>
                load(1, false, updateQuery({ category: queryRef.current.category === name ? '' : name })).catch(
                  () => undefined,
                )
              }
            >
              {name}
            </View>
          ))}
          <Text className="muted sm-chip-total">共 {total} 件</Text>
        </View>
      </View>

      {items.map((product) => (
        <View
          key={product.id}
          className="product-card"
          onClick={() => Taro.navigateTo({ url: `/pages/product-detail/index?id=${product.id}` })}
        >
          {product.image_key ? (
            <Image className="product-thumb" src={fileUrl(product.image_key)} mode="aspectFill" />
          ) : (
            <View className="product-thumb product-thumb-empty">
              <Text>{product.name.slice(0, 1)}</Text>
            </View>
          )}
          <View className="product-info">
            <View className="row-between">
              <Text className="product-name">{product.name}</Text>
              {product.out_of_stock && !query.archived && <Text className="tag tag-danger">缺货</Text>}
              {query.archived && <Text className="tag tag-warn">已下架</Text>}
            </View>
            <Text className="muted product-meta">
              {[product.category, product.brand].filter(Boolean).join(' · ') || '未分类'}
              {product.sku_count > 1 ? ` · ${product.sku_count} 个版本` : ''}
            </Text>
            <View className="row-between product-bottom">
              <Text className="price-text product-price">
                {product.min_retail_price === product.max_retail_price
                  ? formatFen(product.min_retail_price)
                  : `${formatFen(product.min_retail_price)} ~ ${formatFen(product.max_retail_price)}`}
              </Text>
              {!query.archived && (
                <Button
                  className="btn btn-primary quick-add-btn"
                  onClick={(event) => {
                    event.stopPropagation()
                    quickAdd(product.id)
                  }}
                >
                  ＋开单
                </Button>
              )}
            </View>
          </View>
        </View>
      ))}

      {loading && !items.length && <View className="empty">加载中…</View>}

      {showEmptyResult && (
        <View className="sm-empty">
          <Text className="sm-empty-title">
            {query.q.trim() ? `没有找到「${query.q.trim()}」` : '没有符合条件的商品'}
          </Text>
          <Text className="sm-empty-sub">换个关键词，或直接把这件商品录进来</Text>
          <View className="sm-empty-actions">
            <Button className="btn btn-ghost" onClick={scan}>
              扫码试试
            </Button>
            <Button className="btn btn-primary" onClick={() => addProduct(query.q)}>
              新增该商品
            </Button>
          </View>
        </View>
      )}

      {loading && items.length > 0 && <View className="sm-list-footer">加载中…</View>}
      {!loading && items.length > 0 && (
        <View className="sm-list-footer">
          {items.length < total ? '上滑加载更多…' : `到底了，共 ${total} 件`}
        </View>
      )}

      <View className="fab-spacer" />
      <ScanFab />
    </View>
  )
}
