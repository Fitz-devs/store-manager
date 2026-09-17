import { useMemo, useState } from 'react'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import { Button, Image, Input, Text, View } from '@tarojs/components'
import type { PriceType, ProductDetail, SkuWithBarcodes } from '@sm/shared'
import { api, fileUrl } from '../../api/client'
import PriceLineChart from '../../components/price-line-chart'
import EyeIcon from '../../components/eye-icon'
import { useAuthGuard } from '../../utils/auth'
import { formatDateTime, formatFen, PRICE_TYPE_LABELS, yuanToFen } from '../../utils/format'
import './index.scss'

type Tab = 'overview' | 'stats'

function buildTrend(entriesIn: Array<{ id: number; created_at: string; old_value: number | null; new_value: number }>) {
  const entries = entriesIn.slice(0, 12).reverse()
  if (entries.length < 2) return []
  const values = entries.map((entry) => entry.new_value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  return entries.map((entry, index) => {
    const prev = index > 0 ? entries[index - 1]!.new_value : null
    const comparable = prev !== null && entry.old_value != null
    const delta = comparable ? entry.new_value - prev! : 0
    return {
      entry,
      ratio: max === min ? 0.7 : 0.2 + (0.8 * (entry.new_value - min)) / (max - min),
      delta,
      comparable,
      isLatest: index === entries.length - 1,
    }
  })
}

export default function ProductDetailPage() {
  useAuthGuard()
  const router = useRouter()
  const id = Number(router.params.id)
  const [detail, setDetail] = useState<ProductDetail | null>(null)
  const [loadError, setLoadError] = useState('')
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [tab, setTab] = useState<Tab>('overview')
  const [holdSkuId, setHoldSkuId] = useState<number | null>(null)
  const [showSkuForm, setShowSkuForm] = useState(false)
  const [skuSpec, setSkuSpec] = useState('')
  const [skuRetail, setSkuRetail] = useState('')
  const [statsSkuId, setStatsSkuId] = useState<number | null>(null)

  const priceIssues = useMemo(() => {
    if (!detail) return [] as Array<{ skuId: number; skuName: string; kind: 'retail' | 'friend'; sell: number; cost: number }>
    const issues: Array<{ skuId: number; skuName: string; kind: 'retail' | 'friend'; sell: number; cost: number }> = []
    for (const sku of detail.skus) {
      if (sku.status !== 'active') continue
      const cost = sku.latest_purchase_price
      if (cost == null || cost <= 0) continue
      const skuName = sku.spec_name || '默认版本'
      if (sku.retail_price < cost) {
        issues.push({ skuId: sku.id, skuName, kind: 'retail', sell: sku.retail_price, cost })
      }
      if (sku.friend_price != null && sku.friend_price < cost) {
        issues.push({ skuId: sku.id, skuName, kind: 'friend', sell: sku.friend_price, cost })
      }
    }
    return issues
  }, [detail])

  /** SKUs whose friend price is under cost — mark only inside the held sensitive panel. */
  const friendLowSkuIds = useMemo(
    () => new Set(priceIssues.filter((issue) => issue.kind === 'friend').map((issue) => issue.skuId)),
    [priceIssues],
  )

  /** Any SKU with retail or friend under cost — badge visible without opening the eye. */
  const lowPriceSkuIds = useMemo(
    () => new Set(priceIssues.map((issue) => issue.skuId)),
    [priceIssues],
  )

  const productBarcodes = useMemo(() => {
    if (!detail) return [] as Array<{ id: number; code: string }>
    const seen = new Set<string>()
    const list: Array<{ id: number; code: string }> = []
    for (const sku of detail.skus) {
      for (const barcode of sku.barcodes) {
        if (seen.has(barcode.code)) continue
        seen.add(barcode.code)
        list.push({ id: barcode.id, code: barcode.code })
      }
    }
    return list
  }, [detail])

  const primaryCode = productBarcodes[0]?.code || ''

  const load = async () => {
    if (!Number.isFinite(id)) {
      setLoadError('商品不存在')
      return
    }
    setLoadingDetail(true)
    setLoadError('')
    try {
      const data = await api.get<ProductDetail>(`/api/products/${id}`)
      setDetail(data)
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

  const beginSensitive = (skuId: number) => {
    setHoldSkuId(skuId)
  }

  const endSensitive = () => {
    setHoldSkuId(null)
  }

  const trends = useMemo(() => {
    if (!detail) {
      return {
        purchase: [],
        retail: [],
        friend: [],
        rows: [],
      } as {
        purchase: ReturnType<typeof buildTrend>
        retail: ReturnType<typeof buildTrend>
        friend: ReturnType<typeof buildTrend>
        rows: ProductDetail['price_history']
      }
    }
    const preferred = statsSkuId ?? detail.skus[0]?.id ?? null
    const rows = detail.price_history.filter((entry) => preferred == null || entry.sku_id === preferred)
    const byType = (type: PriceType) => buildTrend(rows.filter((entry) => entry.price_type === type))
    return {
      purchase: byType('purchase'),
      retail: byType('retail'),
      friend: byType('friend'),
      rows,
    }
  }, [detail, statsSkuId])

  const chartSeries = useMemo(() => {
    const toPoints = (rows: ReturnType<typeof buildTrend>) =>
      (rows || []).map((row) => ({
        date: row.entry.created_at.slice(5, 10),
        value: row.entry.new_value,
      }))
    return [
      { key: 'purchase', label: '入库价', color: '#2563eb', points: toPoints(trends.purchase) },
      { key: 'retail', label: '零售价', color: '#dc2626', points: toPoints(trends.retail) },
      { key: 'friend', label: '友情价', color: '#059669', points: toPoints(trends.friend) },
    ]
  }, [trends])

  const toggleStock = async (sku: SkuWithBarcodes) => {
    try {
      await api.post(`/api/skus/${sku.id}/stock-status`, {
        status: sku.stock_status === 'out_of_stock' ? 'in_stock' : 'out_of_stock',
      })
      Taro.showToast({ title: sku.stock_status === 'out_of_stock' ? '已恢复在售' : '已标记缺货', icon: 'success' })
      load()
    } catch (error) {
      Taro.showToast({ title: (error as Error).message, icon: 'none' })
    }
  }

  const addSku = async () => {
    if (!skuRetail.trim() || yuanToFen(skuRetail) <= 0) {
      Taro.showToast({ title: '请填写有效的零售价', icon: 'none' })
      return
    }
    const baseUnit = detail?.skus[0]?.sale_unit || '件'
    try {
      await api.post(`/api/products/${id}/skus`, {
        spec_name: skuSpec.trim() || null,
        sale_unit: baseUnit,
        retail_price: yuanToFen(skuRetail),
      })
      Taro.showToast({ title: '版本已添加', icon: 'success' })
      setShowSkuForm(false)
      setSkuSpec('')
      setSkuRetail('')
      load()
    } catch (error) {
      Taro.showToast({ title: (error as Error).message, icon: 'none' })
    }
  }

  const archive = async () => {
    const confirm = await Taro.showModal({ title: '下架商品', content: '下架后不再用于开单/入库，历史订单不受影响。确定吗？' })
    if (!confirm.confirm) return
    try {
      await api.delete(`/api/products/${id}`)
      Taro.showToast({ title: '已下架', icon: 'success' })
      Taro.setStorageSync('sm_products_dirty', 1)
      setTimeout(() => Taro.navigateBack(), 400)
    } catch (error) {
      Taro.showToast({ title: (error as Error).message, icon: 'none' })
    }
  }

  const purge = async () => {
    const archived = detail?.product.status === 'archived'
    const confirm = await Taro.showModal({
      title: '彻底删除商品',
      content: archived
        ? '商品、规格、条码将被永久删除且不可恢复；历史订单与入库记录保留。确定吗？'
        : '该商品仍在售，删除后立即从商品列表消失且不可恢复；历史订单与入库记录保留。确定吗？',
      confirmColor: '#dc2626',
    })
    if (!confirm.confirm) return
    try {
      await api.delete(`/api/products/${id}/purge`)
      Taro.showToast({ title: '已彻底删除', icon: 'success' })
      Taro.setStorageSync('sm_products_dirty', 1)
      setTimeout(() => Taro.navigateBack(), 400)
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
    return <View className="empty">{loadingDetail || Number.isFinite(id) ? '加载中…' : '商品不存在'}</View>
  }

  const { product, skus } = detail

  return (
    <View className="detail-page">
      <View className="detail-header card">
        {product.image_key ? (
          <Image className="detail-image" src={fileUrl(product.image_key)} mode="aspectFill" />
        ) : (
          <View className="detail-image detail-image-empty">
            <Text>{product.name.slice(0, 1)}</Text>
          </View>
        )}
        <View className="detail-head-info">
          <View className="row-between">
            <Text className="detail-name">{product.name}</Text>
            {product.status === 'archived' && <Text className="tag tag-warn">已下架</Text>}
          </View>
          <Text className="muted">商品码 {primaryCode || '未设置'}</Text>
          {product.aliases.length > 0 && (
            <Text className="muted">别名：{product.aliases.join(' / ')}</Text>
          )}
          <Text className="muted">{[product.category, product.brand].filter(Boolean).join(' · ') || '未分类'}</Text>
          {product.notes ? <Text className="muted">{product.notes}</Text> : null}
        </View>
      </View>

      <View className="detail-tabs">
        <View
          className={`detail-tab ${tab === 'overview' ? 'detail-tab-active' : ''}`}
          onClick={() => setTab('overview')}
        >
          概览
        </View>
        <View
          className={`detail-tab ${tab === 'stats' ? 'detail-tab-active' : ''}`}
          onClick={() => setTab('stats')}
        >
          统计
        </View>
      </View>

      {tab === 'overview' && (
        <>
          <View className="section-title">价格与优惠</View>
          <View className="card">
            {skus.map((sku) => (
              <View key={sku.id} className="sku-card">
                <View className="row-between">
                  <Text className="sku-name">
                    {sku.spec_name || '默认版本'}
                    {sku.status !== 'active' ? '（已停用）' : ''}
                  </Text>
                  <Text
                    className={`stock-pill ${sku.stock_status === 'out_of_stock' ? 'stock-pill-danger' : 'stock-pill-ok'}`}
                    onClick={() => toggleStock(sku)}
                  >
                    {sku.stock_status === 'out_of_stock' ? '缺货中' : '在售'}
                  </Text>
                </View>
                {lowPriceSkuIds.has(sku.id) && (
                  <Text className="sku-price-warn">有售价低于进货价，建议调整</Text>
                )}
                <View className="price-row">
                  <View className="price-cell">
                    <Text className="muted">零售价</Text>
                    <Text className="price-text">{formatFen(sku.retail_price)}</Text>
                  </View>
                  <View
                    className={`eye-btn ${holdSkuId === sku.id ? 'eye-btn-active' : ''}`}
                    onTouchStart={() => beginSensitive(sku.id)}
                    onTouchEnd={endSensitive}
                    onTouchCancel={endSensitive}
                    onMouseDown={() => beginSensitive(sku.id)}
                    onMouseUp={endSensitive}
                    onMouseLeave={endSensitive}
                  >
                    <EyeIcon open={holdSkuId === sku.id} />
                  </View>
                </View>
                {holdSkuId === sku.id && (
                  <View className="price-grid">
                    <View className="price-cell">
                      <Text className="muted">友情价</Text>
                      <Text className={friendLowSkuIds.has(sku.id) ? 'price-warn-value' : undefined}>
                        {friendLowSkuIds.has(sku.id) ? '! ' : ''}
                        {formatFen(sku.friend_price)}
                      </Text>
                    </View>
                    <View className="price-cell">
                      <Text className="muted">最近入库价</Text>
                      <Text>{formatFen(sku.latest_purchase_price)}</Text>
                    </View>
                  </View>
                )}
              </View>
            ))}
            {(() => {
              const promoMap = new Map<number, (typeof skus)[0]['promotions'][0]>()
              for (const sku of skus) {
                for (const promo of sku.promotions) promoMap.set(promo.id, promo)
              }
              const promotions = [...promoMap.values()]
              if (!promotions.length) return null
              return (
                <View className="product-rewards">
                  <View className="promo-list">
                    {promotions.map((promo) => (
                      <View key={promo.id} className="promo-chip">
                        <Text className="promo-chip-text">🎁 {promo.content}</Text>
                        {(promo.starts_at || promo.ends_at) && (
                          <Text className="promo-chip-date">
                            {promo.starts_at || '不限'} ~ {promo.ends_at || '不限'}
                          </Text>
                        )}
                      </View>
                    ))}
                  </View>
                </View>
              )
            })()}
            {skus.length > 1 ? null : (
              showSkuForm ? (
                <View className="inline-form">
                  <Input className="input field" placeholder="如 本地版 / 外地版" value={skuSpec} onInput={(event) => setSkuSpec(event.detail.value)} />
                  <Input className="input field" type="digit" placeholder="零售价（元）" value={skuRetail} onInput={(event) => setSkuRetail(event.detail.value)} />
                  {!skuRetail.trim() || yuanToFen(skuRetail) <= 0 ? (
                    <Text className="field-error">请填写有效的零售价</Text>
                  ) : null}
                  <View className="inline-actions">
                    <Button className="btn btn-ghost" onClick={() => setShowSkuForm(false)}>取消</Button>
                    <Button className="btn btn-primary" onClick={addSku}>保存版本</Button>
                  </View>
                </View>
              ) : (
                <Text className="muted more-link" onClick={() => setShowSkuForm(true)}>
                  还有同商品码不同售价？添加版本 ›
                </Text>
              )
            )}
          </View>

          {!!detail.linked_products.length && (
            <>
              <View className="section-title">关联商品</View>
              <View className="card">
                {detail.linked_products.map((linked) => (
                  <View
                    key={linked.link_id}
                    className="linked-row"
                    onClick={() => Taro.navigateTo({ url: `/pages/product-detail/index?id=${linked.id}` })}
                  >
                    <View className="linked-main">
                      <Text className="linked-name">{linked.name}</Text>
                      <Text className="muted">
                        {linked.min_retail_price === linked.max_retail_price
                          ? formatFen(linked.min_retail_price)
                          : `${formatFen(linked.min_retail_price)} ~ ${formatFen(linked.max_retail_price)}`}
                        {linked.out_of_stock ? ' · 缺货' : ''}
                      </Text>
                    </View>
                    <Text className="primary-text">查看 ›</Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </>
      )}

      {tab === 'stats' && (
        <>
          {detail.skus.length > 1 && (
            <View className="stats-sku-row">
              {detail.skus.map((sku) => {
                const activeId = statsSkuId ?? detail.skus[0]?.id
                return (
                  <View
                    key={sku.id}
                    className={`sm-chip ${activeId === sku.id ? 'sm-chip-active' : ''}`}
                    onClick={() => setStatsSkuId(sku.id)}
                  >
                    {sku.spec_name || '默认版本'}
                  </View>
                )
              })}
            </View>
          )}
          <View className="section-title">价格趋势</View>
          <PriceLineChart title="价格趋势" series={chartSeries} />

          <View className="section-title">价格变更明细</View>
          <View className="card">
            {!(trends.rows || []).length && <View className="empty">暂无变更记录</View>}
            {(trends.rows || []).slice(0, 30).map((entry) => (
              <View key={entry.id} className="history-row">
                <View className="row-between">
                  <Text>
                    {PRICE_TYPE_LABELS[entry.price_type]} {formatFen(entry.old_value)} → {formatFen(entry.new_value)}
                  </Text>
                  <Text className="muted">{formatDateTime(entry.created_at)}</Text>
                </View>
                <Text className="muted">
                  {entry.source === 'purchase' ? '入库同步' : entry.source === 'init' ? '首次录入' : '手动修改'}
                  {entry.reason ? ` · ${entry.reason}` : ''}
                  {entry.operator_name ? ` · ${entry.operator_name}` : ''}
                </Text>
              </View>
            ))}
          </View>

          <View className="section-title">入库记录</View>
          <View className="card">
            {!detail.purchases.length && <View className="empty">暂无入库记录</View>}
            {detail.purchases.map((purchase) => (
              <View
                key={purchase.id}
                className="purchase-row"
                onClick={() => Taro.navigateTo({ url: `/pages/purchase-detail/index?id=${purchase.id}` })}
              >
                <View className="row-between">
                  <Text>{purchase.purchase_no}</Text>
                  <Text className="muted">{purchase.ordered_at.slice(0, 10)}</Text>
                </View>
                {purchase.items.map((item) => (
                  <Text key={item.id} className="muted">
                    {item.product_name}
                    {item.spec_name ? ` · ${item.spec_name}` : ''} {item.qty}
                    {item.unit_name} × {formatFen(item.unit_price)}
                    {item.price_changed ? '（入库价有变动）' : ''}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        </>
      )}

      <View className="footer-bar">
        {product.status !== 'archived' && (
          <Button className="btn btn-ghost" onClick={archive}>
            下架
          </Button>
        )}
        <Button className="btn btn-danger" onClick={purge}>
          彻底删除
        </Button>
        <Button className="btn btn-primary" onClick={() => Taro.navigateTo({ url: `/pages/product-edit/index?id=${id}` })}>
          编辑商品
        </Button>
      </View>
    </View>
  )
}
