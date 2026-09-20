import { useRef, useState } from 'react'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import { Button, Image, Input, Text, View } from '@tarojs/components'
import type {
  MatchOcrRowResult,
  OcrDraft,
  OcrFromRowResult,
  OcrHeader,
  ProductDetail,
  ProductListItem,
} from '@sm/shared'
import { resolvePurchasePriceCompare } from '../../utils/priceCompare'
import { api, fileUrl } from '../../api/client'
import { DateField } from '../../components/date-field'
import { useAuthGuard } from '../../utils/auth'
import { pickImages, uploadLocalImage, type PickSource } from '../../utils/media'
import { scanBarcode } from '../../utils/scan'
import { fenToYuan, formatFen, formatYuanDisplay, todayString, yuanToFen } from '../../utils/format'
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

/** 同 sku 合并：数量相加、金额相加，进货价=金额/数量（进X送X 不落库，只摊价） */
function blendSameSkuItems(items: ItemRow[]): ItemRow[] {
  const map = new Map<number, { item: ItemRow; qty: number; amountFen: number; merged: boolean }>()
  for (const item of items) {
    const qty = Number(item.qty) || 0
    const priceFen =
      item.unit_price === '' || item.unit_price === null || item.unit_price === undefined
        ? 0
        : yuanToFen(String(item.unit_price))
    const amountFen = Math.round(priceFen) * qty
    const prev = map.get(item.sku_id)
    if (!prev) {
      map.set(item.sku_id, { item, qty, amountFen, merged: false })
    } else {
      map.set(item.sku_id, {
        item: prev.item,
        qty: prev.qty + qty,
        amountFen: prev.amountFen + amountFen,
        merged: true,
      })
    }
  }
  return [...map.values()].map(({ item, qty, amountFen }) => ({
    ...item,
    qty: String(qty),
    unit_price: qty > 0 ? fenToYuan(Math.round(amountFen / qty)) : item.unit_price,
  }))
}

function hasSkuDuplication(items: Array<{ sku_id: number }>): boolean {
  const seen = new Set<number>()
  for (const item of items) {
    if (seen.has(item.sku_id)) return true
    seen.add(item.sku_id)
  }
  return false
}

interface AiPurchaseDraftItem {
  sku_id: number
  productName: string
  specName: string | null
  unit_name: string
  conversion: number
  qty: number
  unit_price_fen: number
}

interface AiPurchaseDraft {
  supplier_name: string | null
  ordered_at: string
  note: string | null
  items: AiPurchaseDraftItem[]
}

interface OcrRowState {
  /** 稳定行 ID：忽略/自动匹配回写都按它，避免删行后下标错位 */
  rowId: string
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
  /** 库内最近进货价（按 SKU 销售单位，可能是箱/提价或件均价，分） */
  latest_purchase_price?: number | null
  /** 命中 SKU 的销售单位，用于价差展示 */
  sku_sale_unit?: string | null
  /** 价差展示时库内价单位 */
  price_lib_unit?: string | null
  /** 单据价与库内价不一致 */
  priceWarn?: boolean
  /** 命中商品是否已下架（商品列表默认不显示） */
  archived?: boolean
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
  const [creatingRowId, setCreatingRowId] = useState<string | null>(null)
  const [candidateRowId, setCandidateRowId] = useState<string | null>(null)
  /** 手动检索弹框：商品码未命中后由用户输入关键词关联商品 */
  const [manualSearch, setManualSearch] = useState<{
    rowId: string
    q: string
    loading: boolean
    items: ProductListItem[]
    searched: boolean
  } | null>(null)
  const [busy, setBusy] = useState(false)
  /** 1=完善商品  2=入库清单 */
  const [step, setStep] = useState<1 | 2>(1)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pageIndexRef = useRef(0)

  /** 单据价 vs 库内进货价：在同一单位下比（库内可能是箱价或件均价） */
  const computePriceCompare = (row: OcrRowState) => {
    return resolvePurchasePriceCompare({
      docUnitPriceFen: row.unit_price === null ? null : yuanToFen(String(row.unit_price)),
      conversion: row.conversion,
      rowUnit: row.unitName || row.unit,
      skuSaleUnit: row.sku_sale_unit,
      latestPurchaseFen: row.latest_purchase_price,
    })
  }

  const computePriceWarn = (row: OcrRowState): boolean => {
    if (row.status !== 'matched') return false
    return !!computePriceCompare(row)?.warn
  }

  const ocrAutoRef = useRef(false)
  /** 「去编辑」打开的行 ID，返回时刷新该行库内价 */
  const editReturnRowIdRef = useRef<string | null>(null)
  const ocrRowsRef = useRef<OcrRowState[]>([])
  ocrRowsRef.current = ocrRows

  const newOcrRowId = (pageIndex: number, seq: number) =>
    `p${pageIndex}-${Date.now()}-${seq}-${Math.random().toString(36).slice(2, 8)}`

  const findOcrIndexByRowId = (rows: OcrRowState[], rowId: string) =>
    rows.findIndex((row) => row.rowId === rowId)

  const patchOcrRowByRowId = (rowId: string, patch: Partial<OcrRowState> | ((row: OcrRowState) => OcrRowState)) => {
    setOcrRows((previous) => {
      const index = findOcrIndexByRowId(previous, rowId)
      if (index < 0) return previous
      const next = [...previous]
      const current = next[index]!
      next[index] =
        typeof patch === 'function' ? patch(current) : { ...current, ...patch }
      return next
    })
  }

  const ignoreOcrRow = (rowId: string) => {
    setOcrRows((previous) => previous.filter((row) => row.rowId !== rowId))
    setManualSearch((prev) => (prev?.rowId === rowId ? null : prev))
    setCandidateRowId((prev) => (prev === rowId ? null : prev))
    Taro.showToast({ title: '已忽略该行', icon: 'none' })
  }

  /** 编辑商品返回后：以库内当前价刷新该行并重算价差提示 */
  const refreshRowFromServer = async (rowId: string) => {
    const row = ocrRowsRef.current.find((item) => item.rowId === rowId)
    if (!row?.product_id) return
    try {
      const detail = await api.get<ProductDetail>(`/api/products/${row.product_id}`)
      const sku = detail.skus.find((item) => item.id === row.sku_id) ?? detail.skus[0]
      patchOcrRowByRowId(rowId, (target) => {
        const latest = sku?.latest_purchase_price ?? null
        const next: OcrRowState = {
          ...target,
          productName: detail.product.name,
          unitName: sku?.sale_unit ?? target.unitName,
          retail_price: sku?.retail_price ?? null,
          friend_price: sku?.friend_price ?? null,
          latest_purchase_price: latest,
          sku_sale_unit: sku?.sale_unit ?? target.sku_sale_unit ?? null,
          archived: detail.product.status === 'archived' || sku?.status === 'archived',
          status: 'matched',
        }
        const cmp = resolvePurchasePriceCompare({
          docUnitPriceFen: next.unit_price === null ? null : yuanToFen(String(next.unit_price)),
          conversion: next.conversion,
          rowUnit: next.unitName || next.unit,
          skuSaleUnit: next.sku_sale_unit,
          latestPurchaseFen: latest,
        })
        next.priceWarn = !!cmp?.warn
        next.price_lib_unit = cmp?.libDisplayUnit ?? null
        return next
      })
      const after = ocrRowsRef.current.find((item) => item.rowId === rowId)
      if (after?.priceWarn) {
        void showPriceWarnModal([after], { showCancel: false, confirmText: '知道了' })
      }
    } catch {
      // ignore
    }
  }

  const applyAiPurchaseDraft = (draft: AiPurchaseDraft) => {
    setItems(
      draft.items.map((item) => ({
        sku_id: item.sku_id,
        productName: item.productName,
        specName: item.specName,
        unit_name: item.unit_name || '件',
        conversion: String(item.conversion || 1),
        qty: String(item.qty),
        unit_price: fenToYuan(item.unit_price_fen),
      })),
    )
    setSupplier(draft.supplier_name || '')
    setOrderedAt(draft.ordered_at || todayString())
    setNote(draft.note || '')
    setStep(2)
    Taro.showToast({ title: '已导入 AI 入库草稿', icon: 'none' })
  }

  useDidShow(() => {
    if (router.params.ocr === '1' && !ocrAutoRef.current) {
      ocrAutoRef.current = true
      takePhoto()
    }
    if (editReturnRowIdRef.current) {
      const rowId = editReturnRowIdRef.current
      editReturnRowIdRef.current = null
      void refreshRowFromServer(rowId)
    }
    // 从创建商品页返回：把新建 sku 绑到对应 OCR 行
    try {
      const bind = Taro.getStorageSync('sm_purchase_bind_row') as
        | {
            rowId?: string
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
        const rowId = bind.rowId || ''
        if (rowId) {
          patchOcrRowByRowId(rowId, (prev) => ({
            ...prev,
            sku_id: bind.sku_id!,
            productName: bind.productName || prev.name,
            unitName: bind.unitName || prev.unit,
            retail_price: bind.retail_price ?? null,
            friend_price: bind.friend_price ?? null,
            status: 'created',
          }))
        }
        Taro.showToast({ title: `已完善 ${bind.productName || '商品'}`, icon: 'none' })
        Taro.removeStorageSync('sm_purchase_bind_row')
      }
    } catch {
      // ignore
    }
    const aiDraft = Taro.getStorageSync('sm_ai_purchase_draft') as AiPurchaseDraft | ''
    if (aiDraft && Array.isArray(aiDraft.items) && aiDraft.items.length) {
      Taro.removeStorageSync('sm_ai_purchase_draft')
      if (items.length === 0 && ocrRows.length === 0) {
        applyAiPurchaseDraft(aiDraft)
      } else {
        Taro.showModal({
          title: 'AI 入库草稿',
          content: `发现 AI 生成的入库草稿（${aiDraft.items.length} 行），是否替换当前明细？`,
          success: (res) => {
            if (res.confirm) applyAiPurchaseDraft(aiDraft)
          },
        })
      }
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
    const row: ItemRow = {
      sku_id: sku.id,
      productName: detail.product.name,
      specName: sku.spec_name,
      unit_name: sku.sale_unit,
      conversion: '1',
      qty: '1',
      unit_price: sku.latest_purchase_price ? fenToYuan(sku.latest_purchase_price) : '',
      retail_price: sku.retail_price,
      friend_price: sku.friend_price,
    }
    // 同 sku 再次添加：合并数量/金额，避免清单里出现重复行
    setItems((previous) => blendSameSkuItems([...previous, row]))
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
      // 提交前合并同 sku（进X送X：多行数量/总价合在一起摊进价）
      const blended = blendSameSkuItems(items)
      const purchase = await api.post<{ id: number; purchase_no: string }>('/api/purchases', {
        supplier_name: supplier.trim() || null,
        ordered_at: orderedAt,
        note: note.trim() || null,
        image_keys: imageKeys,
        ocr_raw: ocrRaw || null,
        items: blended.map((item) => ({
          sku_id: item.sku_id,
          unit_name: item.unit_name || '件',
          conversion: Number(item.conversion) || 1,
          qty: Number(item.qty) || 1,
          unit_price: yuanToFen(String(item.unit_price)),
        })),
      })
      Taro.hideLoading()
      Taro.showToast({ title: `入库成功 ${purchase.purchase_no}`, icon: 'success' })
      const lowPriceLines = blended.map((item) => {
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
            const nextRows: OcrRowState[] = result.draft.rows.map((draftRow, seq) => ({
              rowId: newOcrRowId(pageIndex, seq),
              box_code: draftRow.box_code,
              unit_code: draftRow.unit_code,
              name: draftRow.name,
              specHint: draftRow.spec_hint,
              qty: draftRow.qty,
              unit: draftRow.unit || '箱',
              unit_price:
                draftRow.unit_price_fen === null
                  ? null
                  : Number(fenToYuan(draftRow.unit_price_fen)),
              amount:
                draftRow.amount_fen === null ? null : draftRow.amount_fen / 100,
              conversion: draftRow.conversion_guess || 1,
              image_key: key,
              page_index: pageIndex,
              status: 'unmatched',
            }))
            setOcrRows((previous) => [...previous, ...nextRows])
            // 识别完自动查库（按 rowId 回写，忽略删行后不会错位）
            void autoLookupAll(nextRows)
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
    rowId: string,
    payload: {
      sku_id: number
      product_id?: number
      productName: string
      unitName?: string | null
      retail_price?: number | null
      friend_price?: number | null
      latest_purchase_price?: number | null
      sku_sale_unit?: string | null
      archived?: boolean
    },
  ) => {
    const docUnitPrice =
      ocrRowsRef.current.find((item) => item.rowId === rowId)?.unit_price ?? null
    const cmp = resolvePurchasePriceCompare({
      docUnitPriceFen: docUnitPrice === null ? null : yuanToFen(String(docUnitPrice)),
      conversion: ocrRowsRef.current.find((item) => item.rowId === rowId)?.conversion ?? 1,
      rowUnit:
        payload.unitName ||
        ocrRowsRef.current.find((item) => item.rowId === rowId)?.unit ||
        '',
      skuSaleUnit: payload.sku_sale_unit,
      latestPurchaseFen: payload.latest_purchase_price,
    })
    patchOcrRowByRowId(rowId, (row) => {
      const latest = payload.latest_purchase_price ?? null
      const next: OcrRowState = {
        ...row,
        sku_id: payload.sku_id,
        product_id: payload.product_id,
        productName: payload.productName,
        unitName: payload.unitName || row.unitName || row.unit,
        retail_price: payload.retail_price ?? null,
        friend_price: payload.friend_price ?? null,
        latest_purchase_price: latest,
        sku_sale_unit: payload.sku_sale_unit ?? row.sku_sale_unit ?? null,
        archived: !!payload.archived,
        status: 'matched',
      }
      next.priceWarn = !!cmp?.warn
      next.price_lib_unit = cmp?.libDisplayUnit ?? null
      return next
    })
    return !!cmp?.warn
  }

  const priceWarnLine = (row: OcrRowState) => {
    const doc =
      row.unit_price === null || row.unit_price === undefined
        ? '-'
        : formatYuanDisplay(row.unit_price)
    const lib =
      row.latest_purchase_price === null || row.latest_purchase_price === undefined
        ? '-'
        : formatFen(row.latest_purchase_price)
    return `${row.productName || row.name || '商品'}：单据 ${doc} 元 / 库内 ${lib}`
  }

  /** 价差弹框：匹配命中或进入清单前，明确提示 */
  const showPriceWarnModal = async (
    rows: OcrRowState[],
    options?: { title?: string; confirmText?: string; showCancel?: boolean },
  ) => {
    if (!rows.length) return true
    const lines = rows.slice(0, 6).map(priceWarnLine)
    const more = rows.length > 6 ? `\n…等共 ${rows.length} 行` : ''
    const res = await Taro.showModal({
      title:
        options?.title ||
        (rows.length === 1 ? '进货价与库内不一致' : `有 ${rows.length} 行进货价与库内不一致`),
      content: `${lines.join('\n')}${more}\n\n请核对单据价与库内价；确认无误可继续。`,
      confirmText: options?.confirmText || '知道了',
      cancelText: '返回核对',
      showCancel: options?.showCancel !== false,
    })
    return !!(res.confirm || options?.showCancel === false)
  }

  const collectPriceWarns = (rowIds?: Set<string>) => {
    return ocrRowsRef.current.filter(
      (row) => row.priceWarn && (!rowIds || rowIds.has(row.rowId)),
    )
  }

  const applyMatchHit = (rowId: string, hit: NonNullable<MatchOcrRowResult['hit']>) => {
    const warned = bindMatchToRow(rowId, {
      sku_id: hit.sku_id,
      product_id: hit.product_id,
      productName: hit.product_name,
      unitName: hit.sale_unit,
      retail_price: hit.retail_price,
      friend_price: hit.friend_price,
      latest_purchase_price: hit.latest_purchase_price,
      sku_sale_unit: hit.sale_unit,
      archived: hit.product_status === 'archived' || hit.sku_status === 'archived',
    })
    return warned
  }

  const markRowMissing = (rowId: string) => {
    patchOcrRowByRowId(rowId, (row) =>
      row.sku_id ? row : { ...row, status: 'missing' },
    )
  }

  /** 自动查库：仅商品码（箱码→件码）；未命中不扫品名 */
  const autoLookupRow = async (rowId: string, silent = true) => {
    const row = ocrRowsRef.current.find((item) => item.rowId === rowId)
    if (!row || row.sku_id) return false
    setCandidateRowId(rowId)
    try {
      const data = await api.post<{ results: MatchOcrRowResult[] }>('/api/products/match-ocr', {
        rows: [{ box_code: row.box_code || null, unit_code: row.unit_code || null }],
      })
      const result = data.results?.[0]
      // 行可能已被忽略
      const still = ocrRowsRef.current.find((item) => item.rowId === rowId)
      if (!still) return false
      if (result?.status === 'matched' && result.hit) {
        const warned = applyMatchHit(rowId, result.hit)
        if (!silent) {
          Taro.showToast({ title: `已匹配 ${result.hit.product_name}`, icon: 'none' })
          if (warned) {
            void showPriceWarnModal(
              [
                {
                  rowId,
                  productName: result.hit.product_name,
                  name: result.hit.product_name,
                  unit_price: still.unit_price,
                  latest_purchase_price: result.hit.latest_purchase_price,
                  unit: still.unit,
                  conversion: still.conversion,
                  status: 'matched',
                  box_code: still.box_code,
                  unit_code: still.unit_code,
                  qty: still.qty,
                  amount: still.amount,
                  image_key: still.image_key,
                  page_index: still.page_index,
                },
              ],
              { showCancel: false, confirmText: '知道了' },
            )
          }
        }
        return true
      }
      markRowMissing(rowId)
      if (!silent) Taro.showToast({ title: '商品码未入库，请检索或创建', icon: 'none' })
      return false
    } catch {
      return false
    } finally {
      setCandidateRowId((prev) => (prev === rowId ? null : prev))
    }
  }

  const autoLookupAll = async (rows: OcrRowState[]) => {
    if (!rows.length) return
    const chunkSize = 50
    const idSet = new Set(rows.map((row) => row.rowId))
    for (let offset = 0; offset < rows.length; offset += chunkSize) {
      const slice = rows.slice(offset, offset + chunkSize)
      try {
        const data = await api.post<{ results: MatchOcrRowResult[] }>('/api/products/match-ocr', {
          rows: slice.map((row) => ({
            box_code: row.box_code || null,
            unit_code: row.unit_code || null,
          })),
        })
        const results = data.results ?? []
        slice.forEach((row, i) => {
          const result = results[i]
          if (result?.status === 'matched' && result.hit) {
            applyMatchHit(row.rowId, result.hit)
          } else {
            markRowMissing(row.rowId)
          }
        })
      } catch {
        slice.forEach((row) => markRowMissing(row.rowId))
      }
    }
    // 批量匹配结束后，价差用弹框集中提示（行内标记不够明显）
    const warns = collectPriceWarns(idSet)
    if (warns.length) {
      void showPriceWarnModal(warns, { showCancel: false, confirmText: '知道了' })
    }
  }

  const openManualSearchModal = (rowId: string) => {
    setManualSearch({ rowId, q: '', loading: false, items: [], searched: false })
  }

  const searchInManualModal = async () => {
    if (!manualSearch) return
    const keyword = manualSearch.q.trim()
    if (!keyword) {
      Taro.showToast({ title: '请输入品名或条码', icon: 'none' })
      return
    }
    setManualSearch((s) => (s ? { ...s, loading: true } : s))
    try {
      const data = await api.get<{ items: ProductListItem[] }>(
        `/api/products?q=${encodeURIComponent(keyword)}&page_size=10&status=all`,
      )
      setManualSearch((s) =>
        s ? { ...s, loading: false, items: data.items || [], searched: true } : s,
      )
    } catch (error) {
      setManualSearch((s) => (s ? { ...s, loading: false, searched: true } : s))
      Taro.showToast({ title: (error as Error).message || '检索失败', icon: 'none' })
    }
  }

  const bindSkuFromSearch = async (product: ProductListItem) => {
    const rowId = manualSearch?.rowId
    if (!rowId) return
    const detail = await pickSku(product.id)
    if (!detail) return
    const active = detail.skus.filter((sku) => sku.status === 'active')
    const pool = active.length ? active : detail.skus
    let skuId: number | undefined
    if (pool.length === 1) {
      skuId = pool[0]!.id
    } else if (pool.length > 1) {
      const skuSheet = await Taro.showActionSheet({
        itemList: pool.map((sku) => `${sku.spec_name ?? '默认'} ${formatFen(sku.latest_purchase_price)}`),
      })
      skuId = pool[skuSheet.tapIndex]?.id
    }
    if (!skuId) return
    const matchedSku = detail.skus.find((sku) => sku.id === skuId)
    const warned = bindMatchToRow(rowId, {
      sku_id: skuId,
      product_id: detail.product.id,
      productName: detail.product.name,
      unitName: matchedSku?.sale_unit ?? null,
      retail_price: matchedSku?.retail_price ?? null,
      friend_price: matchedSku?.friend_price ?? null,
      latest_purchase_price: matchedSku?.latest_purchase_price ?? null,
      sku_sale_unit: matchedSku?.sale_unit ?? null,
      archived: detail.product.status === 'archived' || matchedSku?.status === 'archived',
    })
    setManualSearch(null)
    if (warned) {
      const cur = ocrRowsRef.current.find((item) => item.rowId === rowId)
      void showPriceWarnModal(
        [
          {
            rowId,
            productName: detail.product.name,
            name: detail.product.name,
            unit_price: cur?.unit_price ?? null,
            latest_purchase_price: matchedSku?.latest_purchase_price ?? null,
            unit: cur?.unit || '',
            conversion: cur?.conversion || 1,
            status: 'matched',
            box_code: cur?.box_code ?? null,
            unit_code: cur?.unit_code ?? null,
            qty: cur?.qty || 0,
            amount: cur?.amount ?? null,
            image_key: cur?.image_key || '',
            page_index: cur?.page_index || 0,
          },
        ],
        { showCancel: false, confirmText: '知道了' },
      )
    }
  }

  const matchRow = async (rowId: string) => {
    const row = ocrRowsRef.current.find((item) => item.rowId === rowId)
    if (!row) return
    const found = await autoLookupRow(rowId, false)
    if (found) return
    // 码未命中：弹出明显检索弹框，由用户输入关键词
    openManualSearchModal(rowId)
  }

  const updateOcrRow = (rowId: string, patch: Partial<OcrRowState>) => {
    patchOcrRowByRowId(rowId, (row) => {
      const next = { ...row, ...patch }
      if (next.status === 'matched') {
        const cmp = resolvePurchasePriceCompare({
          docUnitPriceFen: next.unit_price === null ? null : yuanToFen(String(next.unit_price)),
          conversion: next.conversion,
          rowUnit: next.unitName || next.unit,
          skuSaleUnit: next.sku_sale_unit,
          latestPurchaseFen: next.latest_purchase_price,
        })
        next.priceWarn = !!cmp?.warn
        next.price_lib_unit = cmp?.libDisplayUnit ?? null
      }
      return next
    })
  }

  const createPairFromRow = async (rowId: string) => {
    const row = ocrRowsRef.current.find((item) => item.rowId === rowId)
    if (!row) return
    setCreatingRowId(rowId)
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
      patchOcrRowByRowId(rowId, (prev) => ({
        ...prev,
        sku_id: result.box.sku_id,
        productName: result.box.name,
        unitName: result.box.sale_unit,
        retail_price: 0,
        friend_price: null,
        status: 'created',
      }))
      Taro.showToast({ title: '已创建箱装/单件并关联', icon: 'success' })
    } catch (error) {
      Taro.showToast({ title: (error as Error).message, icon: 'none' })
    } finally {
      setCreatingRowId((prev) => (prev === rowId ? null : prev))
    }
  }

  const boundCount = ocrRows.filter((row) => row.sku_id).length
  const unmatchedCount = ocrRows.filter((row) => !row.sku_id).length

  /** 去创建 / 去编辑；预填走 storage，避免 URL 中文编码问题 */
  const openCreateFromOcrRow = (rowId: string, isEdit = false) => {
    const row = ocrRowsRef.current.find((item) => item.rowId === rowId)
    if (!row) return
    if (isEdit && row.product_id) {
      // 编辑已有商品：把识别到的全部字段带过去，便于核对/更新；返回后刷新该行
      editReturnRowIdRef.current = rowId
      try {
        Taro.setStorageSync('sm_product_prefill', {
          from: 'purchase',
          rowId,
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
        rowId,
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
        rowId,
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
  const goStep2 = async () => {
    const bound = ocrRows.filter((row) => row.sku_id)
    if (!bound.length) {
      Taro.showToast({ title: '请先完善商品（匹配或一键双建）', icon: 'none' })
      return
    }
    const warnRows = bound.filter((row) => row.priceWarn)
    if (warnRows.length) {
      const ok = await showPriceWarnModal(warnRows, {
        title: `有 ${warnRows.length} 行进货价与库内不一致`,
        confirmText: '仍去入库清单',
        showCancel: true,
      })
      if (!ok) return
    }
    const nextItems: ItemRow[] = bound.map((row) => ({
      sku_id: row.sku_id!,
      productName: row.productName ?? row.name,
      specName: row.specHint || null,
      unit_name: row.unitName || row.unit || '箱',
      conversion: String(row.conversion || 1),
      qty: String(row.qty || 1),
      unit_price:
        row.unit_price === null || row.unit_price === undefined
          ? ''
          : formatYuanDisplay(row.unit_price),
      retail_price: row.retail_price ?? null,
      friend_price: row.friend_price ?? null,
    }))
    // 保留用户在第二步手动加过的、且 sku 不在 OCR 里的人工行
    const ocrSkus = new Set(bound.map((row) => row.sku_id))
    const manual = items.filter((item) => !ocrSkus.has(item.sku_id))
    const combined = [...nextItems, ...manual]
    // 同 sku（含进X送X 拆成多行）合并数量与总价，摊进货价
    const merged = blendSameSkuItems(combined)
    if (hasSkuDuplication(combined)) {
      Taro.showToast({ title: '同商品已合并数量与金额', icon: 'none' })
    }
    setItems(merged)
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
                  <View key={row.rowId} className="ocr-row">
                    <View className="row-between">
                      <Input
                        className="ocr-name"
                        value={row.name}
                        placeholder="商品名称"
                        onInput={(event) => updateOcrRow(row.rowId, { name: event.detail.value })}
                      />
                      <Text className="muted ocr-page-tag" onClick={() => previewSourceImage(row.image_key)}>
                        页{row.page_index + 1}
                      </Text>
                    </View>
                    <View className="row-between">
                      {row.status === 'matched' ? (
                        row.archived ? (
                          <Text className="tag tag-warn">
                            已下架 · {row.productName} · 商品列表默认不显示
                          </Text>
                        ) : row.priceWarn ? (
                          <Text
                            className="tag tag-danger"
                            onClick={() => {
                              void showPriceWarnModal([row], { showCancel: false })
                            }}
                          >
                            价差待确认 · {row.productName} · 点击看弹框
                          </Text>
                        ) : (
                          <Text className="tag tag-primary">
                            已完善 · {row.productName}
                          </Text>
                        )
                      ) : row.status === 'created' ? (
                        <Text className="tag tag-primary">已完善 · {row.productName}</Text>
                      ) : row.status === 'missing' ? (
                        <Text
                          className={`tag tag-warn ${candidateRowId === row.rowId ? 'tag-loading' : ''}`}
                          onClick={() => matchRow(row.rowId)}
                        >
                          商品码未命中 · 点此检索
                        </Text>
                      ) : (
                        <Text
                          className={`tag tag-warn ${candidateRowId === row.rowId ? 'tag-loading' : ''}`}
                          onClick={() => matchRow(row.rowId)}
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
                            updateOcrRow(row.rowId, { box_code: v || null })
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
                            updateOcrRow(row.rowId, { unit_code: v || null })
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
                            updateOcrRow(row.rowId, { conversion: Number(event.detail.value) || 1 })
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
                          value={
                            row.unit_price === null || row.unit_price === undefined
                              ? ''
                              : formatYuanDisplay(row.unit_price)
                          }
                          onInput={(event) =>
                            updateOcrRow(row.rowId, {
                              unit_price: event.detail.value === '' ? null : Number(event.detail.value),
                            })
                          }
                        />
                        {row.priceWarn && row.latest_purchase_price !== null ? (
                          <Text className="field-hint warn-text">
                            库内 {formatFen(row.latest_purchase_price)} · 与单据单价直接对比
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
                          onInput={(event) => updateOcrRow(row.rowId, { qty: Number(event.detail.value) || 0 })}
                        />
                      </View>
                      <View className="field quarter">
                        <Text className="field-label">单位</Text>
                        <Input
                          className="input"
                          placeholder="件/箱"
                          value={row.unit}
                          onInput={(event) => updateOcrRow(row.rowId, { unit: event.detail.value })}
                        />
                      </View>
                    </View>
                    <View className="inline-actions">
                      <Button
                        className="btn btn-ghost small-btn"
                        onClick={() => ignoreOcrRow(row.rowId)}
                      >
                        忽略
                      </Button>
                      {row.sku_id && row.status === 'matched' ? (
                        <Button
                          className="btn btn-ghost small-btn"
                          onClick={() => openCreateFromOcrRow(row.rowId, true)}
                        >
                          去编辑
                        </Button>
                      ) : null}
                      {(row.status === 'unmatched' || row.status === 'missing') ? (
                        <>
                          <Button
                            className="btn btn-ghost small-btn"
                            onClick={() => matchRow(row.rowId)}
                          >
                            检索匹配
                          </Button>
                          <Button
                            className="btn btn-primary small-btn"
                            onClick={() => openCreateFromOcrRow(row.rowId, false)}
                          >
                            去创建商品
                          </Button>
                          {!!row.box_code && !!row.unit_code ? (
                            <Text
                              className={`tag tag-primary ${creatingRowId === row.rowId ? 'tag-loading' : ''}`}
                              onClick={() => createPairFromRow(row.rowId)}
                            >
                              一键双建
                            </Text>
                          ) : null}
                        </>
                      ) : null}
                      {row.status === 'matched' && row.sku_id ? (
                        <Text className="muted" style={{ alignSelf: 'center' }}>
                          {row.archived
                            ? '商品已下架，入库前请先上架'
                            : row.priceWarn
                              ? '价差请确认'
                              : '已就绪，将进入入库清单'}
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
              onClick={() => {
                void goStep2()
              }}
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

          <View className="section-title">
            入库清单（{items.length}）
            {hasSkuDuplication(items) ? ' · 存在同商品多行，提交时会合并' : ''}
          </View>
          {!items.length && (
            <View className="card">
              <View className="empty">返回第一步完善商品，或扫码/搜索添加</View>
            </View>
          )}
          {items.map((item, index) => (
            <View key={item.sku_id} className="card item-card">
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
                  {item.qty || 0} {item.unit_name} × {formatYuanDisplay(item.unit_price)} 元
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

      {manualSearch ? (
        <View className="search-modal-mask" onClick={() => setManualSearch(null)}>
          <View className="search-modal" onClick={(e) => e.stopPropagation()}>
            <View className="search-modal-title">检索关联商品</View>
            <Text className="search-modal-desc">
              商品码未命中。请自行输入品名或条码后查询，再从结果里选择店内商品。
            </Text>
            <View className="search-modal-input-row">
              <Input
                className="input search-modal-input"
                placeholder="例如：金典 或 690799…"
                value={manualSearch.q}
                focus
                onInput={(event) =>
                  setManualSearch((s) => (s ? { ...s, q: event.detail.value } : s))
                }
                onConfirm={() => void searchInManualModal()}
              />
              <Button
                className="btn btn-primary search-modal-btn"
                loading={manualSearch.loading}
                onClick={() => void searchInManualModal()}
              >
                查询
              </Button>
            </View>
            {manualSearch.searched ? (
              manualSearch.items.length ? (
                <View className="search-modal-list">
                  {manualSearch.items.map((item) => (
                    <View
                      key={item.id}
                      className="search-modal-item"
                      onClick={() => void bindSkuFromSearch(item)}
                    >
                      <View className="search-modal-item-main">
                        <Text className="search-modal-item-name">
                          {item.name}
                          {item.status === 'archived' ? '（已下架）' : ''}
                        </Text>
                        <Text className="muted">
                          零售价 {formatFen(item.min_retail_price)} · {item.sku_count} 版本
                        </Text>
                      </View>
                      <Text className="search-modal-item-action">选择</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text className="muted search-modal-empty">没有匹配商品，可关闭后点「去创建商品」</Text>
              )
            ) : null}
            <Button className="btn btn-ghost full-btn" style={{ marginTop: 20 }} onClick={() => setManualSearch(null)}>
              取消
            </Button>
          </View>
        </View>
      ) : null}
    </View>
  )
}
