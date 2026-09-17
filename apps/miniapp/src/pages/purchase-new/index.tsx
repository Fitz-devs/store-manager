import { useRef, useState } from 'react'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import { Button, Image, Input, Text, View } from '@tarojs/components'
import type {
  OcrDraft,
  OcrFromRowResult,
  OcrHeader,
  ProductDetail,
  ProductListItem,
} from '@sm/shared'
import { api, fileUrl } from '../../api/client'
import { DateField } from '../../components/date-field'
import { useAuthGuard } from '../../utils/auth'
import { pickImages, uploadLocalImage, type PickSource } from '../../utils/media'
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

interface OcrRowState {
  box_code: string | null
  unit_code: string | null
  name: string
  specHint?: string | null
  qty: number
  unit: string
  unit_price: number | null
  amount: number | null
  conversion: number
  image_key: string
  page_index: number
  sku_id?: number
  product_id?: number
  productName?: string
  unitName?: string
  retail_price?: number | null
  friend_price?: number | null
  /** 库内最近进货价（件均价，分） */
  latest_purchase_price?: number | null
  /** 单据价与库内价不一致 */
  priceWarn?: boolean
  status: 'unmatched' | 'matched' | 'created' | 'missing'
}

interface PurchaseOcrResponse {
  rows: Array<{
    name: string
    spec: string | null
    qty: number
    unit: string | null
    unit_price: number | null
    amount: number | null
  }>
  draft: OcrDraft
  headers?: OcrHeader[]
  model: string
  raw: string
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
  const [ocrRaw, setOcrRaw] = useState('')
  const [ocrLoading, setOcrLoading] = useState(false)
  const [ocrProgress, setOcrProgress] = useState<{ total: number; done: number; failed: number } | null>(null)
  const [creatingRow, setCreatingRow] = useState<number | null>(null)
  const [candidateRow, setCandidateRow] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  /** 1=完善商品  2=入库清单 */
  const [step, setStep] = useState<1 | 2>(1)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pageIndexRef = useRef(0)

  /** 单据价 vs 库内进货价：按单位是否已是「件」决定是否再除以规格 */
  const computePriceWarn = (row: OcrRowState): boolean => {
    if (row.status !== 'matched' || row.unit_price === null || row.latest_purchase_price == null) {
      return false
    }
    const conv = Number(row.conversion) || 1
    const unitIsPiece = /^(件|个|支|瓶|袋|盒|罐)$/.test(row.unit || '')
    // 单据单价已是件价 → 直接比；若是箱/提等 → 折成件价再比
    const docBaseFen = Math.round(
      (row.unit_price * 100) / (unitIsPiece ? 1 : Math.max(conv, 1)),
    )
    return Math.abs(docBaseFen - row.latest_purchase_price) >= 1
  }

  const ocrAutoRef = useRef(false)
  /** 「去编辑」打开的行下标，返回时刷新该行库内价 */
  const editReturnIndexRef = useRef<number | null>(null)
  const ocrRowsRef = useRef<OcrRowState[]>([])
  ocrRowsRef.current = ocrRows

  /** 编辑商品返回后：以库内当前价刷新该行并重算价差提示 */
  const refreshRowFromServer = async (index: number) => {
    const row = ocrRowsRef.current[index]
    if (!row?.product_id) return
    try {
      const detail = await api.get<ProductDetail>(`/api/products/${row.product_id}`)
      const sku = detail.skus.find((item) => item.id === row.sku_id) ?? detail.skus[0]
      setOcrRows((previous) => {
        const next = [...previous]
        const target = next[index]
        if (!target) return previous
        const conv = Number(target.conversion) || 1
        const unitIsPiece = /^(件|个|支|瓶|袋|盒|罐)$/.test(target.unit || '')
        const docBaseFen =
          target.unit_price === null
            ? null
            : Math.round((target.unit_price * 100) / (unitIsPiece ? 1 : Math.max(conv, 1)))
        const latest = sku?.latest_purchase_price ?? null
        next[index] = {
          ...target,
          productName: detail.product.name,
          unitName: sku?.sale_unit ?? target.unitName,
          retail_price: sku?.retail_price ?? null,
          friend_price: sku?.friend_price ?? null,
          latest_purchase_price: latest,
          priceWarn: docBaseFen !== null && latest !== null && Math.abs(docBaseFen - latest) >= 1,
          status: 'matched',
        }
        return next
      })
    } catch {
      // ignore
    }
  }

  useDidShow(() => {
    if (router.params.ocr === '1' && !ocrAutoRef.current) {
      ocrAutoRef.current = true
      takePhoto()
    }
    if (editReturnIndexRef.current !== null) {
      const index = editReturnIndexRef.current
      editReturnIndexRef.current = null
      void refreshRowFromServer(index)
    }
    // 从创建商品页返回：把新建 sku 绑到对应 OCR 行
    try {
      const bind = Taro.getStorageSync('sm_purchase_bind_row') as
        | {
            rowIndex?: number
            pending?: boolean
            sku_id?: number | null
            productName?: string
            unitName?: string
            retail_price?: number | null
            friend_price?: number | null
          }
        | ''
        | undefined
      if (bind && typeof bind === 'object' && bind.pending && bind.sku_id) {
        const rowIndex = bind.rowIndex ?? -1
        if (rowIndex >= 0) {
          setOcrRows((previous) => {
            const next = [...previous]
            if (!next[rowIndex]) return previous
            next[rowIndex] = {
              ...next[rowIndex]!,
              sku_id: bind.sku_id!,
              productName: bind.productName || next[rowIndex]!.name,
              unitName: bind.unitName || next[rowIndex]!.unit,
              retail_price: bind.retail_price ?? null,
              friend_price: bind.friend_price ?? null,
              status: 'created',
            }
            return next
          })
        }
        Taro.showToast({ title: `已完善 ${bind.productName || '商品'}`, icon: 'none' })
        Taro.removeStorageSync('sm_purchase_bind_row')
      }
    } catch {
      // ignore
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
    Taro.showLoading({ title: '查询中', mask: true })
    try {
      const lookup = await api.get<{ product?: ProductDetail; matched_sku_ids?: number[] }>(
        `/api/barcodes/lookup?code=${encodeURIComponent(code)}`,
      )
      Taro.hideLoading()
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
      Taro.hideLoading()
      const message = (error as Error).message ?? ''
      if (!message.includes('cancel')) Taro.showToast({ title: message || '扫码失败', icon: 'none' })
    } finally {
      Taro.hideLoading()
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

  const submit = async () => {
    if (busy) {
      Taro.showToast({ title: '正在入库，请稍候', icon: 'none' })
      return
    }
    if (!items.length) {
      Taro.showToast({ title: '请先添加入库商品', icon: 'none' })
      return
    }
    const invalid = items.find(
      (item) => item.unit_price === '' || !Number.isFinite(Number(item.unit_price)) || Number(item.qty) <= 0,
    )
    if (invalid) {
      Taro.showToast({ title: `请完善数量与单价：${invalid.productName}`, icon: 'none' })
      return
    }
    setBusy(true)
    try {
      Taro.showLoading({ title: '入库中' })
      const purchase = await api.post<{ id: number; purchase_no: string }>('/api/purchases', {
        supplier_name: supplier.trim() || null,
        ordered_at: orderedAt,
        note: note.trim() || null,
        image_keys: imageKeys,
        ocr_raw: ocrRaw || null,
        items: items.map((item) => ({
          sku_id: item.sku_id,
          unit_name: item.unit_name || '件',
          conversion: Number(item.conversion) || 1,
          qty: Number(item.qty) || 1,
          unit_price: yuanToFen(String(item.unit_price)),
        })),
      })
      Taro.hideLoading()
      Taro.showToast({ title: `入库成功 ${purchase.purchase_no}`, icon: 'success' })
      const lowPriceLines = items.map((item) => {
        const cost = normalizePurchaseCost(yuanToFen(String(item.unit_price)), Number(item.conversion) || 1)
        const retail = item.retail_price ?? null
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
      setOcrRaw('')
      // 低价提示不阻塞跳转：入库已成功，避免弹层异常时卡住页面
      void promptAfterPurchaseLowPrice(lowPriceLines).catch(() => undefined)
      setTimeout(() => Taro.redirectTo({ url: `/pages/purchase-detail/index?id=${purchase.id}` }), 300)
    } catch (error) {
      try {
        Taro.hideLoading()
      } catch {
        // ignore
      }
      Taro.showToast({ title: (error as Error).message || '入库失败', icon: 'none' })
    } finally {
      setBusy(false)
    }
  }

  const takePhoto = async (source: PickSource = 'both') => {
    try {
      const images = await pickImages({ count: 9, source })
      if (!images.length) return
      setOcrLoading(true)
      const total = images.length
      setOcrProgress({ total, done: 0, failed: 0 })

      // 1) 全部并行上传，立刻进 R2（溯源/临时草稿）
      const uploads = await Promise.allSettled(
        images.map((image) => uploadLocalImage(image, 'purchases')),
      )
      const okUploads: Array<{ key: string; pageIndex: number }> = []
      let failCount = 0
      for (const result of uploads) {
        if (result.status === 'fulfilled') {
          const pageIndex = pageIndexRef.current++
          okUploads.push({ key: result.value.key, pageIndex })
        } else {
          failCount += 1
        }
      }
      if (okUploads.length) {
        setImageKeys((previous) => [
          ...previous,
          ...okUploads.map((item) => item.key),
        ])
      }
      if (!okUploads.length) {
        setOcrProgress(null)
        Taro.showToast({ title: '图片上传失败', icon: 'none' })
        return
      }

      // 2) 并行 OCR，边完成边出结果，不阻塞整页
      const applyHeader = (header: OcrHeader | undefined) => {
        if (!header) return
        // 供货商用抬头公司；不要用「客户名称」（那是我们自己）
        setSupplier((prev) => prev || header.supplier_name || '')
        setOrderedAt((prev) => prev || header.date || prev)
        if (header.order_no) setNote((prev) => prev || header.order_no)
      }

      let doneCount = 0
      let failedCount = failCount
      let recognized = 0
      let lastError: string | null = failCount ? '部分图片上传失败' : null

      await Promise.all(
        okUploads.map(async ({ key, pageIndex }) => {
          try {
            const result = await api.post<PurchaseOcrResponse>(
              `/api/ocr/purchase?page_index=${pageIndex}`,
              { image_key: key },
            )
            setOcrRaw((previous) =>
              previous ? `${previous}\n${result.raw}` : result.raw,
            )
            applyHeader(result.draft.headers?.[0])
            const nextRows: OcrRowState[] = result.draft.rows.map((draftRow) => ({
              box_code: draftRow.box_code,
              unit_code: draftRow.unit_code,
              name: draftRow.name,
              specHint: draftRow.spec_hint,
              qty: draftRow.qty,
              unit: draftRow.unit || '箱',
              unit_price:
                draftRow.unit_price_fen === null
                  ? null
                  : draftRow.unit_price_fen / 100,
              amount:
                draftRow.amount_fen === null ? null : draftRow.amount_fen / 100,
              conversion: draftRow.conversion_guess || 1,
              image_key: key,
              page_index: pageIndex,
              status: 'unmatched',
            }))
            setOcrRows((previous) => {
              const start = previous.length
              const merged = [...previous, ...nextRows]
              // 识别完自动查库（不阻塞后续页）
              void autoLookupAll(nextRows, start)
              return merged
            })
            recognized += nextRows.length
          } catch (error) {
            failedCount += 1
            lastError = (error as Error).message || '识别失败'
            // 原图已保留，继续其他页
          } finally {
            doneCount += 1
            setOcrProgress({
              total,
              done: doneCount,
              failed: failedCount,
            })
          }
        }),
      )

      if (recognized > 0) {
        Taro.showToast({
          title: `识别完成 ${recognized} 行，请核对`,
          icon: 'none',
        })
      } else if (lastError) {
        Taro.showToast({ title: lastError, icon: 'none' })
      }
    } catch (error) {
      const message = (error as Error).message ?? ''
      if (!message.includes('cancel')) {
        Taro.showToast({ title: message || '识别失败', icon: 'none' })
      }
    } finally {
      setOcrLoading(false)
      // 进度条稍后再收，避免闪烁
      setTimeout(() => setOcrProgress(null), 800)
    }
  }

  const bindMatchToRow = (
    index: number,
    payload: {
      sku_id: number
      product_id?: number
      productName: string
      unitName?: string | null
      retail_price?: number | null
      friend_price?: number | null
      latest_purchase_price?: number | null
    },
    rowSnapshot?: OcrRowState,
  ) => {
    setOcrRows((previous) => {
      const next = [...previous]
      const row = next[index]
      if (!row) return previous
      const conv = Number(row.conversion) || 1
      const unitIsPiece = /^(件|个|支|瓶|袋|盒|罐)$/.test(row.unit || '')
      const docBaseFen =
        row.unit_price === null
          ? null
          : Math.round((row.unit_price * 100) / (unitIsPiece ? 1 : Math.max(conv, 1)))
      const latest = payload.latest_purchase_price ?? null
      const warn =
        docBaseFen !== null && latest !== null && Math.abs(docBaseFen - latest) >= 1
      next[index] = {
        ...row,
        sku_id: payload.sku_id,
        product_id: payload.product_id,
        productName: payload.productName,
        unitName: payload.unitName || row.unitName || row.unit,
        retail_price: payload.retail_price ?? null,
        friend_price: payload.friend_price ?? null,
        latest_purchase_price: latest,
        priceWarn: warn,
        status: 'matched',
      }
      return next
    })
    void rowSnapshot
  }

  /** 自动查库：条码优先，未命中则名称搜索，不弹选择 */
  const autoLookupRow = async (index: number, row: OcrRowState, silent = true) => {
    if (!row || row.sku_id) return false
    setCandidateRow(index)
    try {
      for (const code of [row.box_code, row.unit_code]) {
        if (!code) continue
        try {
          const lookup = await api.get<{
            product?: ProductDetail
            matched_sku_ids?: number[]
          }>(`/api/barcodes/lookup?code=${encodeURIComponent(code)}`)
          const product = lookup.product
          const matched = lookup.matched_sku_ids ?? []
          if (product && matched.length) {
            const skuId = matched[0]!
            const sku = product.skus.find((item) => item.id === skuId)
            bindMatchToRow(index, {
              sku_id: skuId,
              product_id: product.product.id,
              productName: product.product.name,
              unitName: sku?.sale_unit ?? null,
              retail_price: sku?.retail_price ?? null,
              friend_price: sku?.friend_price ?? null,
              latest_purchase_price: sku?.latest_purchase_price ?? null,
            })
            if (!silent) Taro.showToast({ title: `已匹配 ${product.product.name}`, icon: 'none' })
            return true
          }
        } catch {
          // 继续下一个码
        }
      }
      if (row.name) {
        const data = await api.get<{ items: ProductListItem[] }>(
          `/api/products?q=${encodeURIComponent(row.name)}&page_size=5`,
        )
        const hit = data.items.find((item) => item.name === row.name) || data.items[0]
        if (hit) {
          const detail = await pickSku(hit.id)
          if (detail) {
            const active = detail.skus.filter((sku) => sku.status === 'active')
            const sku =
              active.find((s) => (s.sale_unit || '') === (row.unit || '')) || active[0]
            if (sku) {
              bindMatchToRow(index, {
                sku_id: sku.id,
                product_id: detail.product.id,
                productName: detail.product.name,
                unitName: sku.sale_unit,
                retail_price: sku.retail_price,
                friend_price: sku.friend_price,
                latest_purchase_price: sku.latest_purchase_price,
              })
              if (!silent) {
                Taro.showToast({ title: `已匹配 ${detail.product.name}`, icon: 'none' })
              }
              return true
            }
          }
        }
      }
      setOcrRows((previous) => {
        const next = [...previous]
        if (next[index] && !next[index]!.sku_id) {
          next[index] = { ...next[index]!, status: 'missing' }
        }
        return next
      })
      if (!silent) Taro.showToast({ title: '商品不在库，请创建', icon: 'none' })
      return false
    } catch {
      return false
    } finally {
      setCandidateRow(null)
    }
  }

  const autoLookupAll = async (rows: OcrRowState[], startIndex: number) => {
    await Promise.all(
      rows.map((row, i) =>
        autoLookupRow(startIndex + i, row, true).then(() => undefined).catch(() => undefined),
      ),
    )
  }

  const matchRow = async (index: number) => {
    const row = ocrRows[index]
    if (!row) return
    const found = await autoLookupRow(index, row, false)
    if (found) return
    setCandidateRow(index)
    try {
      const data = await api.get<{ items: ProductListItem[] }>(
        `/api/products?q=${encodeURIComponent(row.name)}&page_size=8`,
      )
      if (!data.items.length) {
        Taro.showToast({ title: '没有相似商品，请创建', icon: 'none' })
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
      bindMatchToRow(index, {
        sku_id: skuId,
        product_id: detail.product.id,
        productName: detail.product.name,
        unitName: matchedSku?.sale_unit ?? null,
        retail_price: matchedSku?.retail_price ?? null,
        friend_price: matchedSku?.friend_price ?? null,
        latest_purchase_price: matchedSku?.latest_purchase_price ?? null,
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
      const row = { ...next[index]!, ...patch }
      if (row.status === 'matched') {
        row.priceWarn = computePriceWarn(row)
      }
      next[index] = row
      return next
    })
  }

  const createPairFromRow = async (index: number) => {
    const row = ocrRows[index]
    if (!row) return
    setCreatingRow(index)
    try {
      const result = await api.post<OcrFromRowResult>('/api/products/from-ocr-row', {
        name: row.name,
        box_code: row.box_code,
        unit_code: row.unit_code,
        conversion: Number(row.conversion) || 1,
        unit_price_fen: row.unit_price === null ? null : yuanToFen(String(row.unit_price)),
        spec_hint: null,
        sale_unit: row.unit || '箱',
      })
      setOcrRows((previous) => {
        const next = [...previous]
        next[index] = {
          ...next[index]!,
          sku_id: result.box.sku_id,
          productName: result.box.name,
          unitName: result.box.sale_unit,
          retail_price: 0,
          friend_price: null,
          status: 'created',
        }
        return next
      })
      Taro.showToast({ title: '已创建箱装/单件并关联', icon: 'success' })
    } catch (error) {
      Taro.showToast({ title: (error as Error).message, icon: 'none' })
    } finally {
      setCreatingRow(null)
    }
  }

  const boundCount = ocrRows.filter((row) => row.sku_id).length
  const unmatchedCount = ocrRows.filter((row) => !row.sku_id).length

  /** 去创建 / 去编辑；预填走 storage，避免 URL 中文编码问题 */
  const openCreateFromOcrRow = (index: number, isEdit = false) => {
    const row = ocrRows[index]
    if (!row) return
    if (isEdit && row.product_id) {
      // 编辑已有商品：把识别到的全部字段带过去，便于核对/更新；返回后刷新该行
      editReturnIndexRef.current = index
      try {
        Taro.setStorageSync('sm_product_prefill', {
          from: 'purchase',
          rowIndex: index,
          name: row.name,
          box_code: row.box_code ?? '',
          unit_code: row.unit_code ?? '',
          purchase_price: row.unit_price === null ? '' : String(row.unit_price),
          sale_unit: row.unit || '件',
          spec: row.specHint || String(row.conversion || 1),
          conversion: String(row.conversion || 1),
          qty: String(row.qty || 1),
          amount: row.amount === null ? '' : String(row.amount),
          prev_latest_purchase_price: row.latest_purchase_price ?? null,
          prev_retail_price: row.retail_price ?? null,
        })
      } catch {
        // ignore
      }
      Taro.navigateTo({
        url: `/pages/product-edit/index?id=${row.product_id}&from=purchase`,
      })
      return
    }
    try {
      Taro.setStorageSync('sm_product_prefill', {
        from: 'purchase',
        rowIndex: index,
        name: row.name,
        box_code: row.box_code ?? '',
        unit_code: row.unit_code ?? '',
        purchase_price: row.unit_price === null ? '' : String(row.unit_price),
        sale_unit: row.unit || '箱',
        spec: row.specHint || '',
        conversion: String(row.conversion || 1),
        prev_latest_purchase_price: row.latest_purchase_price ?? null,
        prev_retail_price: row.retail_price ?? null,
      })
      Taro.setStorageSync('sm_purchase_bind_row', {
        rowIndex: index,
        pending: true,
        sku_id: null,
        productName: row.name,
      })
    } catch {
      // ignore
    }
    Taro.navigateTo({
      url: '/pages/product-edit/index?from=purchase',
    })
  }

  /** 第一步 → 第二步：把已绑定商品整批灌进入库清单 */
  const goStep2 = () => {
    const bound = ocrRows.filter((row) => row.sku_id)
    if (!bound.length) {
      Taro.showToast({ title: '请先完善商品（匹配或一键双建）', icon: 'none' })
      return
    }
    const nextItems: ItemRow[] = bound.map((row) => ({
      sku_id: row.sku_id!,
      productName: row.productName ?? row.name,
      specName: row.specHint || null,
      unit_name: row.unitName || row.unit || '箱',
      conversion: String(row.conversion || 1),
      qty: String(row.qty || 1),
      unit_price: row.unit_price === null ? '' : String(row.unit_price),
      retail_price: row.retail_price ?? null,
      friend_price: row.friend_price ?? null,
    }))
    // 保留用户在第二步手动加过的、且 sku 不在 OCR 里的人工行
    const ocrSkus = new Set(bound.map((row) => row.sku_id))
    const manual = items.filter((item) => !ocrSkus.has(item.sku_id))
    setItems([...nextItems, ...manual])
    setStep(2)
  }

  const previewSourceImage = (key: string) => {
    if (!key) return
    const urls = imageKeys.map(fileUrl)
    Taro.previewImage({ current: fileUrl(key), urls: urls.length ? urls : [fileUrl(key)] })
  }

  return (
    <View className="purchase-new-page">
      <View className="card ocr-step-bar">
        <View className={`ocr-step ${step === 1 ? 'active' : ''}`}>
          <Text className="ocr-step-num">1</Text>
          <Text>完善商品</Text>
        </View>
        <View className="ocr-step-line" />
        <View className={`ocr-step ${step === 2 ? 'active' : ''}`}>
          <Text className="ocr-step-num">2</Text>
          <Text>入库清单</Text>
        </View>
      </View>

      {step === 1 ? (
        <>
          <View className="card">
            <View className="section-title" style={{ marginTop: 0 }}>
              ① 拍照识别，完善商品信息
            </View>
            <Text className="muted step-hint">
              识别后匹配已有商品或一键双建；确认无误再进入入库清单。
            </Text>
            <Button className="btn btn-primary full-btn" loading={ocrLoading && !ocrProgress} onClick={() => takePhoto('camera')}>
              拍进货单识别
            </Button>
            <Button className="btn btn-ghost full-btn" style={{ marginTop: 12 }} onClick={() => takePhoto('album')}>
              从相册选择（可多张，后台识别）
            </Button>
            {ocrProgress ? (
              <View className="ocr-progress">
                <Text className="muted">
                  识别中 {ocrProgress.done}/{ocrProgress.total}
                  {ocrProgress.failed ? `（失败 ${ocrProgress.failed}）` : ''}，可先处理已出结果
                </Text>
              </View>
            ) : null}
            {!!imageKeys.length && (
              <View className="ocr-image-strip">
                {imageKeys.map((key) => (
                  <Image
                    key={key}
                    className="ocr-thumb"
                    src={fileUrl(key)}
                    mode="aspectFill"
                    onClick={() => previewSourceImage(key)}
                  />
                ))}
                <Text className="muted ocr-image-count">已存 {imageKeys.length} 张原图</Text>
              </View>
            )}
          </View>

          {!!ocrRows.length ? (
            <>
              <View className="section-title">
                识别商品（{boundCount} 已完善 / {unmatchedCount} 待处理）
              </View>
              <View className="card">
                {ocrRows.map((row, index) => (
                  <View key={index} className="ocr-row">
                    <View className="row-between">
                      <Input
                        className="ocr-name"
                        value={row.name}
                        placeholder="商品名称"
                        onInput={(event) => updateOcrRow(index, { name: event.detail.value })}
                      />
                      <Text className="muted ocr-page-tag" onClick={() => previewSourceImage(row.image_key)}>
                        页{row.page_index + 1}
                      </Text>
                    </View>
                    <View className="row-between">
                      {row.status === 'matched' ? (
                        <Text className={`tag ${row.priceWarn ? 'tag-warn' : 'tag-primary'}`}>
                          {row.priceWarn ? `已匹配 · ${row.productName} · 价差` : `已完善 · ${row.productName}`}
                        </Text>
                      ) : row.status === 'created' ? (
                        <Text className="tag tag-primary">已完善 · {row.productName}</Text>
                      ) : row.status === 'missing' ? (
                        <Text className="tag tag-warn">库内无此商品，请创建</Text>
                      ) : (
                        <Text
                          className={`tag tag-warn ${candidateRow === index ? 'tag-loading' : ''}`}
                          onClick={() => matchRow(index)}
                        >
                          查询中/匹配
                        </Text>
                      )}
                    </View>
                    <View className="field-row">
                      <View className="field">
                        <Text className="field-label">箱码</Text>
                        <Input
                          className="input"
                          type="number"
                          placeholder="整箱条码"
                          value={row.box_code ?? ''}
                          onInput={(event) => {
                            const v = event.detail.value.trim()
                            updateOcrRow(index, { box_code: v || null })
                          }}
                        />
                      </View>
                      <View className="field">
                        <Text className="field-label">件码</Text>
                        <Input
                          className="input"
                          type="number"
                          placeholder="单件条码"
                          value={row.unit_code ?? ''}
                          onInput={(event) => {
                            const v = event.detail.value.trim()
                            updateOcrRow(index, { unit_code: v || null })
                          }}
                        />
                      </View>
                    </View>
                    <View className="field-row">
                      <View className="field quarter">
                        <Text className="field-label">规格</Text>
                        <Input
                          className="input"
                          type="number"
                          placeholder="如 10、16"
                          value={String(row.conversion)}
                          onInput={(event) =>
                            updateOcrRow(index, { conversion: Number(event.detail.value) || 1 })
                          }
                        />
                      </View>
                      <View className="field quarter">
                        <Text className="field-label">
                          进货价{row.priceWarn ? ' !' : ''}
                        </Text>
                        <Input
                          className={`input ${row.priceWarn ? 'input-warn' : ''}`}
                          type="digit"
                          placeholder="元"
                          value={row.unit_price === null ? '' : String(row.unit_price)}
                          onInput={(event) =>
                            updateOcrRow(index, {
                              unit_price: event.detail.value === '' ? null : Number(event.detail.value),
                            })
                          }
                        />
                        {row.priceWarn && row.latest_purchase_price !== null ? (
                          <Text className="field-hint warn-text">
                            库内 {formatFen(row.latest_purchase_price)}
                          </Text>
                        ) : null}
                      </View>
                      <View className="field quarter">
                        <Text className="field-label">数量</Text>
                        <Input
                          className="input"
                          type="digit"
                          placeholder="进货数"
                          value={String(row.qty)}
                          onInput={(event) => updateOcrRow(index, { qty: Number(event.detail.value) || 0 })}
                        />
                      </View>
                      <View className="field quarter">
                        <Text className="field-label">单位</Text>
                        <Input
                          className="input"
                          placeholder="件/箱"
                          value={row.unit}
                          onInput={(event) => updateOcrRow(index, { unit: event.detail.value })}
                        />
                      </View>
                    </View>
                    <View className="inline-actions">
                      <Button
                        className="btn btn-ghost small-btn"
                        onClick={() => setOcrRows((previous) => previous.filter((_, i) => i !== index))}
                      >
                        忽略
                      </Button>
                      {row.sku_id && row.status === 'matched' ? (
                        <Button
                          className="btn btn-ghost small-btn"
                          onClick={() => openCreateFromOcrRow(index, true)}
                        >
                          去编辑
                        </Button>
                      ) : null}
                      {(row.status === 'unmatched' || row.status === 'missing') ? (
                        <>
                          <Button
                            className="btn btn-primary small-btn"
                            onClick={() => openCreateFromOcrRow(index, false)}
                          >
                            去创建商品
                          </Button>
                          {!!row.box_code && !!row.unit_code ? (
                            <Text
                              className={`tag tag-primary ${creatingRow === index ? 'tag-loading' : ''}`}
                              onClick={() => createPairFromRow(index)}
                            >
                              一键双建
                            </Text>
                          ) : null}
                        </>
                      ) : null}
                      {row.status === 'matched' && row.sku_id ? (
                        <Text className="muted" style={{ alignSelf: 'center' }}>
                          {row.priceWarn ? '价差请确认' : '已就绪，将进入入库清单'}
                        </Text>
                      ) : null}
                      {row.status === 'created' && row.sku_id ? (
                        <Text className="muted" style={{ alignSelf: 'center' }}>
                          已就绪，将进入入库清单
                        </Text>
                      ) : null}
                    </View>
                  </View>
                ))}
              </View>
            </>
          ) : (
            <View className="card">
              <View className="empty">先拍或选进货单，识别后在这里完善商品</View>
            </View>
          )}

          <View className="footer-bar">
            <View className="footer-total">
              <Text className="muted">已完善</Text>
              <Text className="price-text footer-value">{boundCount}</Text>
              <Text className="muted">项商品</Text>
            </View>
            <Button
              className="btn btn-primary"
              disabled={boundCount ? undefined : true}
              onClick={goStep2}
            >
              下一步：入库清单
            </Button>
          </View>
        </>
      ) : (
        <>
          <View className="card">
            <View className="row-between">
              <Text className="section-title" style={{ marginTop: 0 }}>
                ② 入库信息与清单
              </Text>
              <Text className="muted" onClick={() => setStep(1)}>
                ← 返回完善商品
              </Text>
            </View>
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
          </View>

          <View className="card">
            <View className="scan-hero scan-hero-small" onClick={scan}>
              <View className="scan-hero-icon">
                <View className="scan-hero-bar" />
                <View className="scan-hero-bar scan-hero-bar-wide" />
                <View className="scan-hero-bar" />
              </View>
              <View className="scan-hero-text">
                <Text className="scan-hero-title">扫码补录</Text>
                <Text className="scan-hero-sub">补充未拍照的商品</Text>
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
                {product.image_key ? (
                  <Image className="search-thumb" src={fileUrl(product.image_key)} mode="aspectFill" />
                ) : null}
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
              <View className="empty">返回第一步完善商品，或扫码/搜索添加</View>
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
                <View className="item-field item-conversion">
                  <Text className="item-field-label">规格换算</Text>
                  <Input
                    className="input"
                    type="number"
                    value={item.conversion}
                    onInput={(event) => updateItem(index, { conversion: event.detail.value })}
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
                <Text className="price-text">{formatFen(yuanToFen(item.unit_price) * (Number(item.qty) || 0))}</Text>
              </View>
            </View>
          ))}

          {!!imageKeys.length && (
            <View className="card">
              <Text className="muted">单据原图 {imageKeys.length} 张将随入库单保存</Text>
              <View className="ocr-image-strip">
                {imageKeys.map((key) => (
                  <Image
                    key={key}
                    className="ocr-thumb"
                    src={fileUrl(key)}
                    mode="aspectFill"
                    onClick={() => previewSourceImage(key)}
                  />
                ))}
              </View>
            </View>
          )}

          <View className="footer-bar">
            <View className="footer-total">
              <Text className="muted">合计</Text>
              <Text className="price-text footer-value">{formatFen(total)}</Text>
            </View>
            <Button className="btn btn-primary" loading={busy} onClick={submit}>
              确认入库
            </Button>
          </View>
        </>
      )}
    </View>
  )
}
