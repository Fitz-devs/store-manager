import { useRef, useState } from 'react'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import { Button, Image, Input, Text, View } from '@tarojs/components'
import type { OcrRow, PriceChangeResult, ProductDetail, ProductListItem } from '@sm/shared'
import { api, fileUrl } from '../../api/client'
import { DateField } from '../../components/date-field'
import { useAuthGuard } from '../../utils/auth'
import { pickImages, uploadLocalImage } from '../../utils/media'
import { scanBarcode } from '../../utils/scan'
import { fenToYuan, formatFen, todayString, yuanToFen } from '../../utils/format'
import { findLowPriceIssues, promptAfterPurchaseLowPrice } from '../../utils/priceGuard'
import './index.scss'

function normalizePurchaseCost(unitPriceFen: number, conversion: number): number {
  const conv = Number.isFinite(conversion) && conversion > 0 ? conversion : 1
  return Math.round(unitPriceFen / conv)
}

interface ItemRow {
  sku_id: number
  productName: string
  specName: string | null
  unit_name: string
  conversion: string
  qty: string
  unit_price: string
  retail_price?: number | null
  friend_price?: number | null
}

interface OcrRowState extends OcrRow {
  sku_id?: number
  productName?: string
  unitName?: string
  conversion?: number
  retail_price?: number | null
  friend_price?: number | null
  status: 'unmatched' | 'matched'
}

export default function PurchaseNew() {
  useAuthGuard()
  const router = useRouter()
  const [supplier, setSupplier] = useState('')
  const [orderedAt, setOrderedAt] = useState(todayString())
  const [note, setNote] = useState('')
  const [items, setItems] = useState<ItemRow[]>([])
  const [keyword, setKeyword] = useState('')
  const [results, setResults] = useState<ProductListItem[]>([])
  const [ocrRows, setOcrRows] = useState<OcrRowState[]>([])
  const [imageKeys, setImageKeys] = useState<string[]>([])
  const [ocrLoading, setOcrLoading] = useState(false)
  const [candidateRow, setCandidateRow] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const ocrAutoRef = useRef(false)
  useDidShow(() => {
    if (router.params.ocr === '1' && !ocrAutoRef.current) {
      ocrAutoRef.current = true
      takePhoto()
    }
  })

  const search = async (value?: string) => {
    const q = (value ?? keyword).trim()
    if (!q) {
      setResults([])
      return
    }
    try {
      const data = await api.get<{ items: ProductListItem[] }>(
        `/api/products?q=${encodeURIComponent(q)}&page_size=20`,
      )
      setResults(data.items)
    } catch (error) {
      Taro.showToast({ title: (error as Error).message, icon: 'none' })
    }
  }

  const pickSku = async (productId: number): Promise<ProductDetail | null> => {
    const detail = await api.get<ProductDetail>(`/api/products/${productId}`)
    return detail
  }

  const appendSku = (detail: ProductDetail, skuId: number) => {
    const sku = detail.skus.find((item) => item.id === skuId)
    if (!sku) return
    setItems((previous) => [
      ...previous,
      {
        sku_id: sku.id,
        productName: detail.product.name,
        specName: sku.spec_name,
        unit_name: sku.sale_unit,
        conversion: '1',
        qty: '1',
        unit_price: sku.latest_purchase_price ? fenToYuan(sku.latest_purchase_price) : '',
        retail_price: sku.retail_price,
        friend_price: sku.friend_price,
      },
    ])
    setResults([])
    setKeyword('')
  }

  const addByProductId = async (productId: number): Promise<void> => {
    const detail = await pickSku(productId)
    if (!detail) return
    const active = detail.skus.filter((sku) => sku.status === 'active')
    if (!active.length) {
      Taro.showToast({ title: '该商品没有可用版本', icon: 'none' })
      return
    }
    if (active.length === 1) {
      appendSku(detail, active[0]!.id)
      return
    }
    const sheet = await Taro.showActionSheet({
      itemList: active.map((sku) => `${sku.spec_name ?? '默认'} ${formatFen(sku.latest_purchase_price)}`),
    })
    const sku = active[sheet.tapIndex]
    if (sku) appendSku(detail, sku.id)
  }

  const scan = async () => {
    const code = await scanBarcode()
    if (!code) return
    try {
      const lookup = await api.get<{ product?: ProductDetail; matched_sku_ids?: number[] }>(
        `/api/barcodes/lookup?code=${encodeURIComponent(code)}`,
      )
      if (lookup.product) {
        const matched = lookup.product.skus.filter((sku) => lookup.matched_sku_ids?.includes(sku.id))
        const candidates = matched.length ? matched : lookup.product.skus.filter((sku) => sku.status === 'active')
        if (candidates.length === 1) {
          appendSku(lookup.product, candidates[0]!.id)
          return
        }
        const sheet = await Taro.showActionSheet({
          itemList: candidates.map((sku) => `${sku.spec_name ?? '默认'} ${formatFen(sku.latest_purchase_price)}`),
        })
        const sku = candidates[sheet.tapIndex]
        if (sku) appendSku(lookup.product, sku.id)
        return
      }
      const confirm = await Taro.showModal({ title: '条码未录入', content: '是否先去录入商品？' })
      if (confirm.confirm) {
        Taro.navigateTo({ url: `/pages/product-edit/index?barcode=${encodeURIComponent(code)}` })
      }
    } catch (error) {
      const message = (error as Error).message ?? ''
      if (!message.includes('cancel')) Taro.showToast({ title: message || '扫码失败', icon: 'none' })
    }
  }

  const updateItem = (index: number, patch: Partial<ItemRow>) => {
    setItems((previous) => {
      const next = [...previous]
      next[index] = { ...next[index]!, ...patch }
      return next
    })
  }

  const onKeywordInput = (value: string) => {
    setKeyword(value)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => search(value), 350)
  }

  const total = items.reduce((sum, item) => sum + (yuanToFen(item.unit_price) * (Number(item.qty) || 0)), 0)

  const runPriceCheck = async (): Promise<PriceChangeResult[]> => {
    const payload = items
      .filter((item) => item.unit_price !== '')
      .map((item) => ({
        sku_id: item.sku_id,
        unit_name: item.unit_name || '件',
        conversion: Number(item.conversion) || 1,
        unit_price: yuanToFen(item.unit_price),
      }))
    if (!payload.length) return []
    return api.post<PriceChangeResult[]>('/api/purchases/check-prices', { items: payload })
  }

  const submit = async () => {
    if (busy) return
    if (!items.length) {
      Taro.showToast({ title: '请先添加入库商品', icon: 'none' })
      return
    }
    const invalid = items.find((item) => item.unit_price === '' || Number(item.qty) <= 0)
    if (invalid) {
      Taro.showToast({ title: `请完善数量与单价：${invalid.productName}`, icon: 'none' })
      return
    }
    setBusy(true)
    try {
      let priceUpdates: Array<{ sku_id: number; retail_price: number }> = []
      const changes = (await runPriceCheck()).filter((change) => change.changed)
      if (changes.length) {
        const content = changes
          .slice(0, 5)
          .map(
            (change) =>
              `${change.product_name}${change.spec_name ? `·${change.spec_name}` : ''}：${formatFen(change.old_price)} → ${formatFen(change.new_price)}/${change.unit_name}`,
          )
          .join('\n')
        const confirm = await Taro.showModal({
          title: '入库价有变化，是否同步零售价？',
          content,
          confirmText: '同步零售价',
          cancelText: '仅记录',
        })
        if (confirm.confirm) {
          priceUpdates = changes.map((change) => ({ sku_id: change.sku_id, retail_price: change.new_price }))
        }
      }

      const purchase = await api.post<{ id: number; purchase_no: string }>('/api/purchases', {
        supplier_name: supplier.trim() || null,
        ordered_at: orderedAt,
        note: note.trim() || null,
        image_keys: imageKeys,
        items: items.map((item) => ({
          sku_id: item.sku_id,
          unit_name: item.unit_name || '件',
          conversion: Number(item.conversion) || 1,
          qty: Number(item.qty) || 1,
          unit_price: yuanToFen(item.unit_price),
        })),
        price_updates: priceUpdates,
      })
      Taro.showToast({ title: `入库成功 ${purchase.purchase_no}`, icon: 'success' })
      // Batch/OCR: allow the purchase to land first, then nudge about unprofitable sell prices.
      const syncedRetail = new Map(priceUpdates.map((update) => [update.sku_id, update.retail_price]))
      const lowPriceLines = items.map((item) => {
        const cost = normalizePurchaseCost(yuanToFen(item.unit_price), Number(item.conversion) || 1)
        const retail = syncedRetail.get(item.sku_id) ?? item.retail_price ?? null
        return {
          label: `${item.productName}${item.specName ? `·${item.specName}` : ''}`,
          issues: findLowPriceIssues({
            retail,
            friend: item.friend_price ?? null,
            purchase: cost,
          }),
        }
      })
      setItems([])
      setOcrRows([])
      setImageKeys([])
      await promptAfterPurchaseLowPrice(lowPriceLines)
      setTimeout(() => Taro.redirectTo({ url: `/pages/purchase-detail/index?id=${purchase.id}` }), 300)
    } catch (error) {
      Taro.showToast({ title: (error as Error).message, icon: 'none' })
    } finally {
      setBusy(false)
    }
  }

  const takePhoto = async () => {
    try {
      const images = await pickImages({ count: 3, camera: true })
      if (!images.length) return
      setOcrLoading(true)
      const keys: string[] = []
      let rows: OcrRowState[] = []
      for (const image of images) {
        Taro.showLoading({ title: '上传识别中' })
        const uploaded = await uploadLocalImage(image, 'purchases')
        keys.push(uploaded.key)
        const result = await api.post<{ rows: OcrRow[]; model: string }>('/api/ocr/purchase', {
          image_key: uploaded.key,
        })
        rows = rows.concat(result.rows.map((row) => ({ ...row, status: 'unmatched' as const })))
      }
      setImageKeys((previous) => [...previous, ...keys])
      setOcrRows((previous) => [...previous, ...rows])
      Taro.hideLoading()
      Taro.showToast({ title: `识别到 ${rows.length} 行，请核对`, icon: 'none' })
    } catch (error) {
      Taro.hideLoading()
      const message = (error as Error).message ?? ''
      if (!message.includes('cancel')) {
        Taro.showToast({ title: message || '识别失败', icon: 'none' })
      }
    } finally {
      setOcrLoading(false)
    }
  }

  const matchRow = async (index: number) => {
    const row = ocrRows[index]
    if (!row) return
    setCandidateRow(index)
    try {
      const data = await api.get<{ items: ProductListItem[] }>(
        `/api/products?q=${encodeURIComponent(row.name)}&page_size=8`,
      )
      if (!data.items.length) {
        Taro.showToast({ title: '没有相似商品，请先去录入', icon: 'none' })
        return
      }
      const sheet = await Taro.showActionSheet({ itemList: data.items.map((item) => item.name) })
      const product = data.items[sheet.tapIndex]
      if (!product) return
      const detail = await pickSku(product.id)
      if (!detail) return
      const active = detail.skus.filter((sku) => sku.status === 'active')
      let skuId: number | undefined
      if (active.length === 1) {
        skuId = active[0]!.id
      } else {
        const skuSheet = await Taro.showActionSheet({
          itemList: active.map((sku) => `${sku.spec_name ?? '默认'} ${formatFen(sku.latest_purchase_price)}`),
        })
        skuId = active[skuSheet.tapIndex]?.id
      }
      if (!skuId) return
      const matchedSku = detail.skus.find((sku) => sku.id === skuId)
      setOcrRows((previous) => {
        const next = [...previous]
        next[index] = {
          ...next[index]!,
          sku_id: skuId,
          productName: detail.product.name,
          unitName: next[index]!.unit || matchedSku?.sale_unit || '件',
          retail_price: matchedSku?.retail_price ?? null,
          friend_price: matchedSku?.friend_price ?? null,
          status: 'matched',
        }
        return next
      })
    } catch (error) {
      const message = (error as Error).message ?? ''
      if (!message.includes('cancel')) Taro.showToast({ title: message, icon: 'none' })
    } finally {
      setCandidateRow(null)
    }
  }

  const updateOcrRow = (index: number, patch: Partial<OcrRowState>) => {
    setOcrRows((previous) => {
      const next = [...previous]
      next[index] = { ...next[index]!, ...patch }
      return next
    })
  }

  const moveRowToItems = (index: number) => {
    const row = ocrRows[index]
    if (!row?.sku_id) {
      Taro.showToast({ title: '请先匹配商品', icon: 'none' })
      return
    }
    setItems((previous) => [
      ...previous,
      {
        sku_id: row.sku_id!,
        productName: row.productName ?? row.name,
        specName: null,
        unit_name: row.unitName || '件',
        conversion: '1',
        qty: String(row.qty || 1),
        unit_price: row.unit_price === null ? '' : String(row.unit_price),
        retail_price: row.retail_price ?? null,
        friend_price: row.friend_price ?? null,
      },
    ])
    setOcrRows((previous) => previous.filter((_, i) => i !== index))
  }

  return (
    <View className="purchase-new-page">
      <View className="card">
        <View className="field-row">
          <View className="field half">
            <Text className="field-label">供应商</Text>
            <Input className="input" placeholder="如 城北批发部" value={supplier} onInput={(event) => setSupplier(event.detail.value)} />
          </View>
          <View className="field half">
            <Text className="field-label">入库日期</Text>
            <DateField value={orderedAt} onChange={setOrderedAt} />
          </View>
        </View>
        <View className="field">
          <Text className="field-label">备注</Text>
          <Input className="input" placeholder="如 送货单号" value={note} onInput={(event) => setNote(event.detail.value)} />
        </View>
        <Button className="btn btn-primary full-btn" loading={ocrLoading} onClick={takePhoto}>
          拍进货单识别
        </Button>
      </View>

      {!!ocrRows.length && (
        <>
          <View className="section-title">识别结果 · 核对后加入清单</View>
          <View className="card">
            {ocrRows.map((row, index) => (
              <View key={index} className="ocr-row">
                <View className="row-between">
                  <Input
                    className="ocr-name"
                    value={row.name}
                    onInput={(event) => updateOcrRow(index, { name: event.detail.value })}
                  />
                  {row.status === 'matched' ? (
                    <Text className="tag tag-success">{row.productName}</Text>
                  ) : (
                    <Text className={`tag tag-warn ${candidateRow === index ? 'tag-loading' : ''}`} onClick={() => matchRow(index)}>
                      匹配商品
                    </Text>
                  )}
                </View>
                <View className="field-row">
                  <Input
                    className="input ocr-small"
                    type="digit"
                    placeholder="数量"
                    value={String(row.qty)}
                    onInput={(event) => updateOcrRow(index, { qty: Number(event.detail.value) || 0 })}
                  />
                  <Input
                    className="input ocr-small"
                    placeholder="单位"
                    value={row.unit ?? ''}
                    onInput={(event) => updateOcrRow(index, { unit: event.detail.value })}
                  />
                  <Input
                    className="input ocr-small"
                    type="digit"
                    placeholder="单价（元）"
                    value={row.unit_price === null ? '' : String(row.unit_price)}
                    onInput={(event) =>
                      updateOcrRow(index, {
                        unit_price: event.detail.value === '' ? null : Number(event.detail.value),
                      })
                    }
                  />
                </View>
                <View className="inline-actions">
                  <Button className="btn btn-ghost small-btn" onClick={() => setOcrRows((previous) => previous.filter((_, i) => i !== index))}>
                    删除
                  </Button>
                  <Button className="btn btn-primary small-btn" onClick={() => moveRowToItems(index)}>
                    加入入库清单
                  </Button>
                </View>
              </View>
            ))}
          </View>
        </>
      )}

      <View className="card">
        <View className="scan-hero scan-hero-small" onClick={scan}>
          <View className="scan-hero-icon">
            <View className="scan-hero-bar" />
            <View className="scan-hero-bar scan-hero-bar-wide" />
            <View className="scan-hero-bar" />
          </View>
          <View className="scan-hero-text">
            <Text className="scan-hero-title">扫码入库</Text>
            <Text className="scan-hero-sub">扫商品条码快速加入清单</Text>
          </View>
          <Text className="scan-hero-arrow">›</Text>
        </View>
        <View className="search-row">
          <Input
            className="input search-input"
            placeholder="搜索商品名称 / 商品码"
            value={keyword}
            confirmType="search"
            onInput={(event) => onKeywordInput(event.detail.value)}
            onConfirm={() => search()}
          />
        </View>
        {results.map((product) => (
          <View key={product.id} className="search-item" onClick={() => addByProductId(product.id)}>
            {product.image_key ? <Image className="search-thumb" src={fileUrl(product.image_key)} mode="aspectFill" /> : null}
            <View className="search-info">
              <Text>{product.name}</Text>
              <Text className="muted">
                零售价 {formatFen(product.min_retail_price)} · {product.sku_count} 版本
              </Text>
            </View>
          </View>
        ))}
      </View>

      <View className="section-title">入库清单（{items.length}）</View>
      {!items.length && (
        <View className="card">
          <View className="empty">扫码或搜索添加要入库的商品</View>
        </View>
      )}
      {items.map((item, index) => (
        <View key={index} className="card item-card">
          <View className="row-between">
            <Text className="item-name">
              {item.productName}
              {item.specName ? ` · ${item.specName}` : ''}
            </Text>
            <Text className="danger-text" onClick={() => setItems((previous) => previous.filter((_, i) => i !== index))}>
              删除
            </Text>
          </View>
          <View className="item-inputs">
            <View className="item-field">
              <Text className="item-field-label">数量</Text>
              <Input
                className="input"
                type="digit"
                value={item.qty}
                onInput={(event) => updateItem(index, { qty: event.detail.value })}
              />
            </View>
            <View className="item-field item-field-unit">
              <Text className="item-field-label">单位</Text>
              <Input
                className="input"
                value={item.unit_name}
                onInput={(event) => updateItem(index, { unit_name: event.detail.value })}
              />
            </View>
            <View className="item-field item-field-price">
              <Text className="item-field-label">单价（元）</Text>
              <Input
                className="input"
                type="digit"
                value={item.unit_price}
                onInput={(event) => updateItem(index, { unit_price: event.detail.value })}
              />
            </View>
          </View>
          <View className="row-between item-line-total">
            <Text className="muted">
              {item.qty || 0} {item.unit_name} × {item.unit_price || '0'} 元
            </Text>
            <Text className="price-text">
              {formatFen(yuanToFen(item.unit_price) * (Number(item.qty) || 0))}
            </Text>
          </View>
        </View>
      ))}

      <View className="footer-bar">
        <View className="footer-total">
          <Text className="muted">合计</Text>
          <Text className="price-text footer-value">{formatFen(total)}</Text>
        </View>
        <Button className="btn btn-primary" loading={busy} onClick={submit}>
          提交入库
        </Button>
      </View>
    </View>
  )
}
