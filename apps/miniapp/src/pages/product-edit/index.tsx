import { useEffect, useRef, useState } from 'react'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import { Button, Image, Input, Switch, Text, Textarea, View } from '@tarojs/components'
import type { Category, LinkedProduct, ProductDetail, ProductListItem, SkuWithBarcodes } from '@sm/shared'
import { api, fileUrl } from '../../api/client'
import { DateRangeField } from '../../components/date-range-field'
import { TagInput } from '../../components/tag-input'
import { useAuthGuard } from '../../utils/auth'
import { pickImages, uploadLocalImage } from '../../utils/media'
import { scanBarcode } from '../../utils/scan'
import { PH } from '../../config/placeholders'
import { fenToYuan, formatFen, yuanToFen } from '../../utils/format'
import { findLowPriceIssues, guardManualLowPrice } from '../../utils/priceGuard'
import './index.scss'

interface PromoDraft {
  content: string
  starts: string
  ends: string
}

interface PromoRow {
  key: string | number
  content: string
  starts: string | null
  ends: string | null
}

interface ProductDraft {
  name: string
  aliasValues: string[]
  category: string
  brand: string
  notes: string
  purchasePrice: string
  codes: string[]
  multiSpec: boolean
  specName: string
  saleUnit: string
  retailPrice: string
  friendPrice: string
  createPromos: PromoDraft[]
}

const DRAFT_KEY = 'sm_product_draft'

function promoLabel(row: PromoRow): string {
  if (row.starts || row.ends) return `${row.starts || '不限'} ~ ${row.ends || '不限'}`
  return '长期有效'
}

function markDirty() {
  Taro.setStorageSync('sm_products_dirty', 1)
}

type ProductPrefill = {
  from?: string
  rowIndex?: number
  name?: string
  box_code?: string
  unit_code?: string
  purchase_price?: string
  sale_unit?: string
  spec?: string
  conversion?: string
  qty?: string
  amount?: string
  prev_latest_purchase_price?: number | null
  prev_retail_price?: number | null
}

/** 防 URL/草稿残留乱码：若像 percent-encoding 则解码 */
function safeText(value: string | undefined | null): string {
  const v = (value ?? '').trim()
  if (!v) return ''
  if (/%[0-9A-Fa-f]{2}/.test(v)) {
    try {
      return decodeURIComponent(v)
    } catch {
      return v
    }
  }
  return v
}

export default function ProductEdit() {
  useAuthGuard()
  const router = useRouter()
  const editId = router.params.id ? Number(router.params.id) : null

  const [name, setName] = useState('')
  const [aliasValues, setAliasValues] = useState<string[]>([])
  const [category, setCategory] = useState('')
  const [categoryIds, setCategoryIds] = useState<number[]>([])
  const [categoryOptions, setCategoryOptions] = useState<Category[]>([])
  const [showCategoryPicker, setShowCategoryPicker] = useState(false)
  const [categoryKeyword, setCategoryKeyword] = useState('')
  const [brand, setBrand] = useState('')
  const [notes, setNotes] = useState('')
  const [imageKey, setImageKey] = useState('')
  const [purchasePrice, setPurchasePrice] = useState('')
  const [codes, setCodes] = useState<string[]>([])
  const [multiSpec, setMultiSpec] = useState(false)
  const [specName, setSpecName] = useState('')
  const [saleUnit, setSaleUnit] = useState('件')
  /** OCR 预填的箱→件换算；用于 latest_purchase_price 存件均价 */
  const [createConversion, setCreateConversion] = useState(1)
  /** 入库预填带来的库内旧价（分），用于对比展示 */
  const [prevPurchaseFen, setPrevPurchaseFen] = useState<number | null>(null)
  /** 本次进货单价（元），编辑已有商品时用于对比 */
  const [incomingPurchasePrice, setIncomingPurchasePrice] = useState('')
  /** 本次识别带来的其他字段，编辑时展示在对应输入旁 */
  const [incomingName, setIncomingName] = useState('')
  const [incomingCodes, setIncomingCodes] = useState<string[]>([])
  const [incomingSpec, setIncomingSpec] = useState('')
  const [incomingUnit, setIncomingUnit] = useState('')
  void prevPurchaseFen
  const [retailPrice, setRetailPrice] = useState('')
  const [friendPrice, setFriendPrice] = useState('')
  const [createPromos, setCreatePromos] = useState<PromoDraft[]>([])
  const [busy, setBusy] = useState(false)
  const [tried, setTried] = useState(false)
  const [draftNotice, setDraftNotice] = useState(false)
  const draftRestoredRef = useRef(false)
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [detail, setDetail] = useState<ProductDetail | null>(null)
  const [selectedSkuId, setSelectedSkuId] = useState<number | null>(null)
  const [selSpec, setSelSpec] = useState('')
  const [selUnit, setSelUnit] = useState('件')
  const [selRetail, setSelRetail] = useState('')
  const [selPurchase, setSelPurchase] = useState('')
  const [selFriend, setSelFriend] = useState('')
  const [showSkuManager, setShowSkuManager] = useState(false)
  const [newSpecName, setNewSpecName] = useState('')
  const [savingPrices, setSavingPrices] = useState(false)
  const [linkKeyword, setLinkKeyword] = useState('')
  const [linkResults, setLinkResults] = useState<ProductListItem[]>([])
  const [step, setStep] = useState(1)
  const [editCode, setEditCode] = useState('')
  const [codeDraft, setCodeDraft] = useState('')
  const [savingCode, setSavingCode] = useState(false)

  const selectedSku = detail?.skus.find((sku) => sku.id === selectedSkuId) ?? detail?.skus[0] ?? null
  const multiSku = (detail?.skus.length ?? 1) > 1

  const priceValue = editId ? selRetail : retailPrice
  const nameError = tried && !name.trim() ? '请填写商品名称' : ''
  const priceError =
    tried && (!priceValue.trim() || yuanToFen(priceValue) <= 0) ? '请填写有效的零售价' : ''

  const createPurchaseFen = purchasePrice.trim() ? yuanToFen(purchasePrice) : null
  const createRetailFen = retailPrice.trim() ? yuanToFen(retailPrice) : null
  const createFriendFen = friendPrice.trim() ? yuanToFen(friendPrice) : null
  const createRetailLow =
    createPurchaseFen != null && createPurchaseFen > 0 && createRetailFen != null && createRetailFen > 0 && createRetailFen < createPurchaseFen
  const createFriendLow =
    createPurchaseFen != null && createPurchaseFen > 0 && createFriendFen != null && createFriendFen > 0 && createFriendFen < createPurchaseFen

  const editPurchaseFen = selPurchase.trim()
    ? yuanToFen(selPurchase)
    : (selectedSku?.latest_purchase_price ?? null)
  const editRetailFen = selRetail.trim() ? yuanToFen(selRetail) : null
  const editFriendFen = selFriend.trim() ? yuanToFen(selFriend) : null
  const editRetailLow =
    editPurchaseFen != null && editPurchaseFen > 0 && editRetailFen != null && editRetailFen > 0 && editRetailFen < editPurchaseFen
  const editFriendLow =
    editPurchaseFen != null && editPurchaseFen > 0 && editFriendFen != null && editFriendFen > 0 && editFriendFen < editPurchaseFen

  useEffect(() => {
    if (editId) return
    if (draftTimer.current) clearTimeout(draftTimer.current)
    const snapshot: ProductDraft = {
      name,
      aliasValues,
      category,
      brand,
      notes,
      purchasePrice,
      codes,
      multiSpec,
      specName,
      saleUnit,
      retailPrice,
      friendPrice,
      createPromos,
    }
    draftTimer.current = setTimeout(() => {
      try {
        Taro.setStorageSync(DRAFT_KEY, snapshot)
      } catch {
        // 草稿保存失败不打扰录入
      }
    }, 500)
    return () => {
      if (draftTimer.current) clearTimeout(draftTimer.current)
    }
  }, [
    editId,
    name,
    aliasValues,
    category,
    brand,
    notes,
    purchasePrice,
    codes,
    multiSpec,
    specName,
    saleUnit,
    retailPrice,
    friendPrice,
    createPromos,
  ])

  const applyDraft = (draft: ProductDraft) => {
    setName(draft.name || '')
    setAliasValues(draft.aliasValues || [])
    setCategory(draft.category || '')
    setBrand(draft.brand || '')
    setNotes(draft.notes || '')
    setPurchasePrice(draft.purchasePrice || '')
    setCodes((draft.codes || []).slice(0, 1))
    setMultiSpec(!!draft.multiSpec)
    setSpecName(draft.specName || '')
    setSaleUnit(draft.saleUnit || '件')
    setRetailPrice(draft.retailPrice || '')
    setFriendPrice(draft.friendPrice || '')
    setCreatePromos(draft.createPromos || [])
    setDraftNotice(true)
  }

  const clearDraft = () => {
    try {
      Taro.removeStorageSync(DRAFT_KEY)
    } catch {
      // ignore
    }
    setName('')
    setAliasValues([])
    setCategory('')
    setBrand('')
    setNotes('')
    setPurchasePrice('')
    setCodes([])
    setMultiSpec(false)
    setSpecName('')
    setSaleUnit('件')
    setRetailPrice('')
    setFriendPrice('')
    setCreatePromos([])
    setTried(false)
    setDraftNotice(false)
  }

  const load = async (preferSkuId?: number) => {
    // 从入库「去编辑/去创建」进入时，两边都要读本次进货对照
    let purchasePrefill: ProductPrefill | null = null
    try {
      const raw = Taro.getStorageSync('sm_product_prefill') as ProductPrefill | '' | undefined
      if (raw && typeof raw === 'object' && raw.from === 'purchase') {
        purchasePrefill = raw
        Taro.removeStorageSync('sm_product_prefill')
      }
    } catch {
      // ignore
    }
    if (purchasePrefill?.purchase_price) {
      setIncomingPurchasePrice(safeText(purchasePrefill.purchase_price))
    }
    if (purchasePrefill?.name) setIncomingName(safeText(purchasePrefill.name))
    const incCodes = [purchasePrefill?.box_code, purchasePrefill?.unit_code]
      .map((c) => safeText(c))
      .filter(Boolean)
    if (incCodes.length) setIncomingCodes(incCodes)
    if (purchasePrefill?.spec) setIncomingSpec(safeText(purchasePrefill.spec))
    if (purchasePrefill?.sale_unit) setIncomingUnit(safeText(purchasePrefill.sale_unit))
    if (purchasePrefill?.prev_latest_purchase_price != null) {
      setPrevPurchaseFen(Number(purchasePrefill.prev_latest_purchase_price))
    }

    if (!editId) {
      // 入库 OCR → 创建商品：预填走 storage，避免 URL 编码乱码
      const prefill = purchasePrefill
      const prefilledBarcode = router.params.barcode
      const fromPurchase = router.params.from === 'purchase' || prefill?.from === 'purchase'
      const prefilledName = safeText(prefill?.name || router.params.name)
      const prefilledPrice = safeText(prefill?.purchase_price || router.params.purchase_price)
      const prefilledUnit = safeText(prefill?.sale_unit || router.params.sale_unit) || '件'
      const prefilledSpec = safeText(prefill?.spec || router.params.spec)
      const prefilledBox = safeText(prefill?.box_code || router.params.box_code)
      const prefilledUnitCode = safeText(prefill?.unit_code || router.params.unit_code)

      if (fromPurchase) {
        setStep(1)
        // 丢弃旧草稿，避免上次 URL 乱码写回销售单位
        try {
          Taro.removeStorageSync(DRAFT_KEY)
        } catch {
          // ignore
        }
        setDraftNotice(false)
      }
      if (prefilledPrice) setPurchasePrice(prefilledPrice)
      if (prefilledUnit) setSaleUnit(prefilledUnit)
      if (prefilledSpec) setSpecName(prefilledSpec)
      if (prefill?.conversion) {
        const conv = Number(prefill.conversion)
        if (Number.isFinite(conv) && conv > 1) setCreateConversion(conv)
      }
      if (prefill?.prev_latest_purchase_price != null) {
        setPrevPurchaseFen(Number(prefill.prev_latest_purchase_price))
      }
      if (prefilledBox || prefilledUnitCode) {
        const seed = [prefilledBox, prefilledUnitCode].filter(Boolean) as string[]
        setCodes(seed)
      }
      if (prefilledBarcode) {
        setCodes((prev) => (prev.length ? prev : [prefilledBarcode]))
      }
      if (prefilledName) setName(prefilledName)
      if (fromPurchase) {
        // 入库预填路径：不恢复旧草稿，预填已足够
        draftRestoredRef.current = true
        return
      }
      if (!draftRestoredRef.current) {
        draftRestoredRef.current = true
        try {
          const draft = Taro.getStorageSync(DRAFT_KEY) as ProductDraft | '' | undefined
          if (draft && (draft.name || draft.codes?.length || draft.retailPrice)) {
            applyDraft({
              ...draft,
              name: prefilledName || draft.name,
              saleUnit: safeText(draft.saleUnit) || draft.saleUnit || '件',
            })
          }
        } catch {
          // 无草稿时正常录入
        }
      }
      return
    }
    const data = await api.get<ProductDetail>(`/api/products/${editId}`)
    setDetail(data)
    setName(data.product.name)
    setAliasValues(data.product.aliases ?? [])
    setCategory(data.product.category ?? '')
    setCategoryIds(data.product.category_ids ?? [])
    setBrand(data.product.brand ?? '')
    setNotes(data.product.notes ?? '')
    setImageKey(data.product.image_key ?? '')
    const preferredId = preferSkuId ?? selectedSkuId
    const first = data.skus.find((sku) => sku.id === preferredId) ?? data.skus[0]
    if (first) {
      setSelectedSkuId(first.id)
      setSelSpec(first.spec_name ?? '')
      setSelUnit(first.sale_unit)
      setSelRetail(fenToYuan(first.retail_price))
      setSelPurchase(first.latest_purchase_price === null ? '' : fenToYuan(first.latest_purchase_price))
      setSelFriend(first.friend_price === null ? '' : fenToYuan(first.friend_price))
      // 库内进货价以当前 SKU 为准；识别字段只存 incoming，不自动覆盖
      if (first.latest_purchase_price !== null) {
        setPrevPurchaseFen(first.latest_purchase_price)
      }
      if (purchasePrefill?.from === 'purchase' || router.params.from === 'purchase') {
        setStep(1)
      }
    }
    const codeSet = new Set<string>()
    for (const sku of data.skus) {
      for (const barcode of sku.barcodes) {
        if (!codeSet.has(barcode.code)) {
          codeSet.add(barcode.code)
          setEditCode(barcode.code)
          setCodeDraft(barcode.code)
          break
        }
      }
      if (codeSet.size) break
    }
    if (!codeSet.size) {
      setEditCode('')
      setCodeDraft('')
    }
  }

  useDidShow(() => {
    api.get<Category[]>('/api/categories').then(setCategoryOptions).catch(() => undefined)
    load().catch((error) => Taro.showToast({ title: error.message, icon: 'none' }))
  })

  const addCategory = (id: number) => {
    setCategoryIds((previous) => (previous.includes(id) ? previous : [...previous, id]))
    setShowCategoryPicker(false)
    setCategoryKeyword('')
  }

  const removeCategory = (id: number) => {
    setCategoryIds((previous) => previous.filter((item) => item !== id))
  }

  const selectedCategories = categoryOptions.filter((item) => categoryIds.includes(item.id))
  const pickerCategories = categoryOptions.filter(
    (item) =>
      !categoryIds.includes(item.id) &&
      (!categoryKeyword.trim() || item.name.includes(categoryKeyword.trim())),
  )

  const pickImage = async () => {
    try {
      const images = await pickImages({ count: 1 })
      const image = images[0]
      if (!image) return
      Taro.showLoading({ title: '上传中' })
      const uploaded = await uploadLocalImage(image, 'products')
      setImageKey(uploaded.key)
      Taro.hideLoading()
    } catch (error) {
      Taro.hideLoading()
      const message = (error as Error).message ?? ''
      if (!message.includes('cancel')) {
        Taro.showToast({ title: message || '上传失败', icon: 'none' })
      }
    }
  }

  const scanIntoBarcodes = async () => {
    const scanned = await scanBarcode()
    if (!scanned) return
    setCodes([scanned])
  }

  const setSingleCode = (value: string) => {
    setCodes(value.trim() ? [value] : [])
  }

  const addSpec = async () => {
    if (!editId) return
    if (!newSpecName.trim() || !selRetail.trim() || yuanToFen(selRetail) <= 0) {
      Taro.showToast({ title: '请填写版本名和有效的零售价', icon: 'none' })
      return
    }
    const retailFen = yuanToFen(selRetail)
    const friendFen = selFriend.trim() ? yuanToFen(selFriend) : null
    const purchaseFen = selPurchase.trim() ? yuanToFen(selPurchase) : null
    const lowIssues = findLowPriceIssues({
      retail: retailFen,
      friend: friendFen,
      purchase: purchaseFen,
    })
    if (!(await guardManualLowPrice(lowIssues))) return
    setSavingPrices(true)
    try {
      const created = await api.post<SkuWithBarcodes>(`/api/products/${editId}/skus`, {
        spec_name: newSpecName.trim(),
        sale_unit: detail?.skus[0]?.sale_unit || '件',
        retail_price: retailFen,
        friend_price: friendFen,
        latest_purchase_price: purchaseFen,
      })
      Taro.showToast({ title: '版本已添加', icon: 'success' })
      setNewSpecName('')
      setSelRetail('')
      setSelPurchase('')
      setSelFriend('')
      setShowSkuManager(false)
      setSelectedSkuId(created.id)
      setSelSpec(created.spec_name ?? '')
      markDirty()
      await load(created.id)
    } catch (error) {
      Taro.showToast({ title: (error as Error).message, icon: 'none' })
    } finally {
      setSavingPrices(false)
    }
  }

  const archiveSpec = async (skuId: number) => {
    const activeCount = (detail?.skus ?? []).filter((sku) => sku.status === 'active').length
    if (activeCount <= 1) {
      Taro.showToast({ title: '至少保留一个版本', icon: 'none' })
      return
    }
    const confirm = await Taro.showModal({
      title: '删除版本',
      content: '删除后不再用于开单/入库，历史订单不受影响。确定吗？',
    })
    if (!confirm.confirm) return
    try {
      await api.post(`/api/skus/${skuId}/archive`)
      Taro.showToast({ title: '已删除', icon: 'success' })
      markDirty()
      setSelectedSkuId(null)
      await load()
    } catch (error) {
      Taro.showToast({ title: (error as Error).message, icon: 'none' })
    }
  }

  const searchLinks = async () => {
    const q = linkKeyword.trim()
    if (!q) {
      setLinkResults([])
      return
    }
    try {
      const data = await api.get<{ items: ProductListItem[] }>(
        `/api/products?q=${encodeURIComponent(q)}&page_size=10`,
      )
      setLinkResults(data.items.filter((item) => item.id !== editId))
    } catch (error) {
      Taro.showToast({ title: (error as Error).message, icon: 'none' })
    }
  }

  const addLink = async (linkedId: number) => {
    if (!editId) return
    try {
      await api.post(`/api/products/${editId}/links`, { linked_product_id: linkedId })
      Taro.showToast({ title: '已关联', icon: 'success' })
      setLinkKeyword('')
      setLinkResults([])
      load()
    } catch (error) {
      Taro.showToast({ title: (error as Error).message, icon: 'none' })
    }
  }

  const removeLink = async (link: LinkedProduct) => {
    const confirm = await Taro.showModal({ title: '取消关联', content: `确定取消与「${link.name}」的关联吗？` })
    if (!confirm.confirm) return
    try {
      await api.delete(`/api/products/links/${link.link_id}`)
      load()
    } catch (error) {
      Taro.showToast({ title: (error as Error).message, icon: 'none' })
    }
  }

  const selectSku = (sku: SkuWithBarcodes) => {
    setSelectedSkuId(sku.id)
    setSelSpec(sku.spec_name ?? '')
    setSelUnit(sku.sale_unit)
    setSelRetail(fenToYuan(sku.retail_price))
    setSelPurchase(sku.latest_purchase_price === null ? '' : fenToYuan(sku.latest_purchase_price))
    setSelFriend(sku.friend_price === null ? '' : fenToYuan(sku.friend_price))
    setShowSkuManager(false)
  }

  const saveSkuPrices = async () => {
    if (!editId) return
    if (showSkuManager) {
      await addSpec()
      return
    }
    if (!selectedSku) return
    if (!selRetail.trim() || yuanToFen(selRetail) <= 0) {
      Taro.showToast({ title: '请填写有效的零售价', icon: 'none' })
      return
    }
    const retailFen = yuanToFen(selRetail)
    const friendFen = selFriend.trim() ? yuanToFen(selFriend) : null
    const purchaseFen = selPurchase.trim() ? yuanToFen(selPurchase) : selectedSku.latest_purchase_price
    const lowIssues = findLowPriceIssues({
      retail: retailFen,
      friend: friendFen,
      purchase: purchaseFen,
    })
    if (!(await guardManualLowPrice(lowIssues))) return
    setSavingPrices(true)
    try {
      await api.patch(`/api/skus/${selectedSku.id}`, {
        spec_name: multiSku ? selSpec.trim() || null : selectedSku.spec_name,
        sale_unit: multiSku ? selectedSku.sale_unit : selUnit.trim() || '件',
        retail_price: retailFen,
        friend_price: friendFen,
        latest_purchase_price: selPurchase.trim() ? yuanToFen(selPurchase) : null,
        reason: '商品编辑',
      })
      markDirty()
      Taro.showToast({ title: '价格已保存', icon: 'success' })
      load()
    } catch (error) {
      Taro.showToast({ title: (error as Error).message, icon: 'none' })
    } finally {
      setSavingPrices(false)
    }
  }

  const saveProductCode = async () => {
    if (!editId) return
    const next = codeDraft.trim()
    setSavingCode(true)
    try {
      const existing: number[] = []
      const seen = new Set<string>()
      for (const sku of detail?.skus ?? []) {
        for (const barcode of sku.barcodes) {
          if (seen.has(barcode.code)) continue
          seen.add(barcode.code)
          existing.push(barcode.id)
        }
      }
      if (next) {
        const sku = detail?.skus.find((item) => item.status === 'active') ?? detail?.skus[0]
        if (!sku) {
          Taro.showToast({ title: '请先保存版本信息', icon: 'none' })
          return
        }
        await api.post(`/api/products/${editId}/barcodes`, {
          sku_id: sku.id,
          code: next,
          is_primary: true,
        })
      }
      // delete old codes only after the new one succeeds
      let deleteFailed = false
      for (const barcodeId of existing) {
        try {
          await api.delete(`/api/barcodes/${barcodeId}`)
        } catch {
          deleteFailed = true
        }
      }
      setEditCode(next)
      markDirty()
      Taro.showToast({
        title: deleteFailed ? '商品码已保存，旧码清理有失败' : '商品码已保存',
        icon: deleteFailed ? 'none' : 'success',
      })
      await load()
    } catch (error) {
      Taro.showToast({ title: (error as Error).message, icon: 'none' })
    } finally {
      setSavingCode(false)
    }
  }

  const saveBasicInfo = async () => {
    setTried(true)
    if (!editId) {
      if (!name.trim() || !retailPrice.trim() || yuanToFen(retailPrice) <= 0) {
        Taro.showToast({ title: !name.trim() ? '请填写商品名称' : '请填写有效的零售价', icon: 'none' })
        return
      }
      const retailFen = yuanToFen(retailPrice)
      const friendFen = friendPrice.trim() ? yuanToFen(friendPrice) : null
      const purchaseFen = purchasePrice.trim() ? yuanToFen(purchasePrice) : null
      // 销售单位是箱/提且有换算时，latest_purchase_price 存「件均价」，与入库 normalize 一致
      const conv = createConversion > 1 ? createConversion : 1
      const basePurchaseFen =
        purchaseFen === null
          ? null
          : conv > 1
            ? Math.round(purchaseFen / conv)
            : purchaseFen
      const lowIssues = findLowPriceIssues({
        retail: retailFen,
        friend: friendFen,
        purchase: basePurchaseFen,
      })
      if (!(await guardManualLowPrice(lowIssues))) return
      setBusy(true)
      try {
        const created = await api.post<ProductDetail>('/api/products', {
          name: name.trim(),
          aliases: aliasValues,
          category_ids: categoryIds,
          brand: brand.trim() || null,
          notes: notes.trim() || null,
          image_key: imageKey || null,
          purchase_price: basePurchaseFen,
          sku: {
            spec_name: null,
            sale_unit: saleUnit.trim() || '件',
            retail_price: yuanToFen(retailPrice),
            friend_price: friendPrice.trim() ? yuanToFen(friendPrice) : null,
            latest_purchase_price: basePurchaseFen,
          },
          barcodes: codes
            .filter((code) => code.trim())
            .slice(0, 2)
            .map((code, index) => ({
              code: code.trim(),
              is_primary: index === 0,
            })),
        })
        try {
          Taro.removeStorageSync(DRAFT_KEY)
        } catch {
          // ignore
        }
        markDirty()
        Taro.showToast({ title: '商品已创建', icon: 'success' })
        const sku = created.skus?.[0]
        if (router.params.from === 'purchase') {
          try {
            const prev = Taro.getStorageSync('sm_purchase_bind_row') as
              | { rowId?: string; rowIndex?: number; pending?: boolean }
              | ''
              | undefined
            const rowId =
              (typeof prev === 'object' && prev && typeof prev.rowId === 'string' && prev.rowId) ||
              (typeof router.params.rowId === 'string' ? router.params.rowId : '')
            Taro.setStorageSync('sm_purchase_bind_row', {
              rowId,
              pending: true,
              sku_id: sku?.id ?? null,
              productName: created.product.name,
              unitName: sku?.sale_unit || '件',
              retail_price: sku?.retail_price ?? null,
              friend_price: sku?.friend_price ?? null,
            })
          } catch {
            // ignore
          }
          setTimeout(() => {
            Taro.navigateBack().catch(() => {
              Taro.redirectTo({ url: '/pages/purchase-new/index' })
            })
          }, 300)
          return
        }
        setTimeout(() => {
          Taro.redirectTo({ url: `/pages/product-edit/index?id=${created.product.id}` })
        }, 400)
      } catch (error) {
        Taro.showToast({ title: (error as Error).message, icon: 'none' })
      } finally {
        setBusy(false)
      }
      return
    }

    if (!name.trim()) {
      Taro.showToast({ title: '请填写商品名称', icon: 'none' })
      return
    }
    setBusy(true)
    try {
      await api.patch(`/api/products/${editId}`, {
        name: name.trim(),
        aliases: aliasValues,
        category_ids: categoryIds,
        brand: brand.trim() || null,
        image_key: imageKey || null,
      })
      markDirty()
      Taro.showToast({ title: '常用信息已保存', icon: 'success' })
      await load()
    } catch (error) {
      Taro.showToast({ title: (error as Error).message, icon: 'none' })
    } finally {
      setBusy(false)
    }
  }

  const saveOtherInfo = async () => {
    if (!editId) {
      Taro.showToast({ title: '请先创建商品', icon: 'none' })
      return
    }
    setBusy(true)
    try {
      await api.patch(`/api/products/${editId}`, {
        aliases: aliasValues,
        notes: notes.trim() || null,
      })
      markDirty()
      Taro.showToast({ title: '其他信息已保存', icon: 'success' })
      await load()
    } catch (error) {
      Taro.showToast({ title: (error as Error).message, icon: 'none' })
    } finally {
      setBusy(false)
    }
  }

  const steps = [
    { id: 1, label: '常用' },
    { id: 2, label: '优惠' },
    { id: 3, label: '其他' },
  ]

  return (
    <View className="edit-page">
      <View className="stepper">
        {steps.map((item, index) => (
          <View key={item.id} className="step-node-wrap">
            <View className="step-node" onClick={() => setStep(item.id)}>
              <View
                className={`step-dot ${step === item.id ? 'step-dot-active' : ''} ${step > item.id ? 'step-dot-done' : ''}`}
              >
                <Text>{step > item.id ? '✓' : String(item.id)}</Text>
              </View>
              <Text className={`step-label ${step === item.id ? 'step-label-active' : ''}`}>
                {item.label}
              </Text>
            </View>
            {index < steps.length - 1 ? <View className="step-line" /> : null}
          </View>
        ))}
      </View>

      {step === 1 && (
        <>
          {draftNotice && !editId && (
            <View className="draft-notice">
              <Text>已恢复上次未完成的录入</Text>
              <Text className="draft-clear" onClick={clearDraft}>
                清空
              </Text>
            </View>
          )}
          <View className="card">
            <View className="photo-row" onClick={pickImage}>
              {imageKey ? (
                <Image className="photo-thumb" src={fileUrl(imageKey)} mode="aspectFill" />
              ) : (
                <View className="photo-thumb photo-empty">
                  <Text>+</Text>
                </View>
              )}
              <View className="photo-text">
                <Text>{imageKey ? '更换商品图片' : '添加商品图片'}</Text>
              </View>
            </View>
            <View className="field">
              <Text className="field-label">商品码</Text>
              {editId ? (
                <>
                  <View className="barcode-line">
                    <Input
                      className="input barcode-code"
                      placeholder={PH.barcode}
                      value={codeDraft}
                      onInput={(event) => setCodeDraft(event.detail.value)}
                    />
                    <Text
                      className="barcode-action"
                      onClick={async () => {
                        const scanned = await scanBarcode()
                        if (!scanned) return
                        setCodeDraft(scanned)
                      }}
                    >
                      扫码
                    </Text>
                    <Text className="barcode-action" onClick={saveProductCode}>
                      保存
                    </Text>
                  </View>
                  {(() => {
                    if (!editId || !incomingCodes.length) return null
                    const joined = incomingCodes.join(' / ')
                    if (joined === codeDraft || joined === editCode) return null
                    return (
                      <Text
                        className="field-warn"
                        onClick={() => {
                          setCodeDraft(joined)
                        }}
                      >
                        本次识别码 {joined} · 点此采用
                      </Text>
                    )
                  })()}
                </>
              ) : (
                <>
                  <View className="barcode-line">
                    <Input
                      className="input barcode-code"
                      placeholder={PH.barcode}
                      value={codes[0] || ''}
                      onInput={(event) => setSingleCode(event.detail.value)}
                    />
                    <Text className="barcode-action" onClick={scanIntoBarcodes}>
                      扫码
                    </Text>
                  </View>
                  <Text className="muted">扫一下可自动带出名称</Text>
                </>
              )}
            </View>
            <View className="field">
              <Text className="field-label">
                商品名称 <Text className="required-star">*</Text>
              </Text>
              <Input className="input" placeholder={PH.productName} value={name} onInput={(event) => setName(event.detail.value)} />
              {(() => {
                if (!editId || !incomingName) return null
                if (incomingName === name) return null
                return (
                  <Text className="field-warn" onClick={() => setName(incomingName)}>
                    本次识别「{incomingName}」 · 点此采用
                  </Text>
                )
              })()}
              {nameError ? <Text className="field-error">{nameError}</Text> : null}
            </View>
            <View className="field">
              <Text className="field-label">分类</Text>
              <View className="chip-row">
                {selectedCategories.map((item) => (
                  <View key={item.id} className="chip chip-selected">
                    <Text>{item.name}</Text>
                    <Text className="chip-delete" onClick={() => removeCategory(item.id)}>
                      ×
                    </Text>
                  </View>
                ))}
                <View className="chip chip-add" onClick={() => setShowCategoryPicker((value) => !value)}>
                  ＋ 添加分类
                </View>
              </View>
              {!categoryOptions.length && (
                <Text className="muted">还没有分类，可先到「我的 → 分类管理」添加</Text>
              )}
              {showCategoryPicker && (
                <View className="category-picker-mask" onClick={() => setShowCategoryPicker(false)}>
                  <View className="category-picker" onClick={(event) => event.stopPropagation?.()}>
                    <View className="row-between category-picker-head">
                      <Text className="field-label" style={{ marginBottom: 0 }}>
                        选择分类
                      </Text>
                      <Text className="muted" onClick={() => setShowCategoryPicker(false)}>
                        关闭
                      </Text>
                    </View>
                    <Input
                      className="input"
                      placeholder="搜索分类名称"
                      value={categoryKeyword}
                      onInput={(event) => setCategoryKeyword(event.detail.value)}
                    />
                    <View className="category-picker-list">
                      {!pickerCategories.length && (
                        <Text className="muted">没有可添加的分类</Text>
                      )}
                      {pickerCategories.map((item) => (
                        <View
                          key={item.id}
                          className="category-picker-item"
                          onClick={() => addCategory(item.id)}
                        >
                          <Text>{item.name}</Text>
                          <Text className="primary-text">添加</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                </View>
              )}
            </View>
            <View className="field-row">
              <View className="field half">
                <Text className="field-label">品牌</Text>
                <Input className="input" placeholder={PH.brand} value={brand} onInput={(event) => setBrand(event.detail.value)} />
              </View>
            </View>
            {!editId && (
              <>
                <View className="field-row">
                  <View className="field half">
                    <Text className="field-label">
                      零售价（元） <Text className="required-star">*</Text>
                    </Text>
                    <Input className="input" type="digit" placeholder={PH.retailPrice} value={retailPrice} onInput={(event) => setRetailPrice(event.detail.value)} />
                    {priceError ? <Text className="field-error">{priceError}</Text> : null}
                    {createRetailLow ? <Text className="field-warn">! 低于进货价</Text> : null}
                  </View>
                  <View className="field half">
                    <Text className="field-label">销售单位</Text>
                    <Input className="input" placeholder={PH.saleUnit} value={saleUnit} onInput={(event) => setSaleUnit(event.detail.value)} />
                  </View>
                </View>
                <View className="field-row">
                  <View className="field half">
                    <Text className="field-label">进货价（元）</Text>
                    <Input className="input" type="digit" placeholder={PH.purchasePrice} value={purchasePrice} onInput={(event) => setPurchasePrice(event.detail.value)} />
                  </View>
                  <View className="field half">
                    <Text className="field-label">友情价（元）</Text>
                    <Input className="input" type="digit" placeholder={PH.friendPrice} value={friendPrice} onInput={(event) => setFriendPrice(event.detail.value)} />
                    {createFriendLow ? <Text className="field-warn">! 低于进货价</Text> : null}
                  </View>
                </View>
              </>
            )}
            {editId && (
              <View className="muted" style={{ marginTop: '8px' }}>
                价格与版本请在下方「价格」区维护
              </View>
            )}
          </View>

          {editId && (
            <>
              <View className="section-title">价格</View>
              <View className="card">
                {detail && (
                  <View className="chip-row">
                    {detail.skus.map((sku) => (
                      <View
                        key={sku.id}
                        className={`chip ${selectedSku?.id === sku.id && !showSkuManager ? 'chip-active' : ''}`}
                      >
                        <Text onClick={() => selectSku(sku)}>{sku.spec_name || '默认版本'}</Text>
                        {multiSku && !showSkuManager ? (
                          <Text
                            className="chip-delete"
                            onClick={(event) => {
                              event.stopPropagation?.()
                              archiveSpec(sku.id)
                            }}
                          >
                            ×
                          </Text>
                        ) : null}
                      </View>
                    ))}
                  </View>
                )}
                {showSkuManager && (
                  <View className="field">
                    <Text className="field-label">
                      版本名 <Text className="required-star">*</Text>
                    </Text>
                    <Input
                      className="input"
                      placeholder={PH.versionName}
                      value={newSpecName}
                      onInput={(event) => setNewSpecName(event.detail.value)}
                    />
                  </View>
                )}
                {!showSkuManager && multiSku && (
                  <View className="field">
                    <Text className="field-label">版本名</Text>
                    <Input
                      className="input"
                      placeholder={PH.versionName}
                      value={selSpec}
                      onInput={(event) => setSelSpec(event.detail.value)}
                    />
                    {(() => {
                      if (!editId || !incomingSpec) return null
                      if (incomingSpec === selSpec) return null
                      return (
                        <Text className="field-warn" onClick={() => setSelSpec(incomingSpec)}>
                          本次识别「{incomingSpec}」 · 点此采用
                        </Text>
                      )
                    })()}
                  </View>
                )}
                <View className="field-row">
                  <View className="field half">
                    <Text className="field-label">
                      零售价（元） <Text className="required-star">*</Text>
                    </Text>
                    <Input className="input" type="digit" value={selRetail} onInput={(event) => setSelRetail(event.detail.value)} />
                    {editRetailLow ? <Text className="field-warn">! 低于进货价</Text> : null}
                  </View>
                  <View className="field half">
                    <Text className="field-label">进货价（元）</Text>
                    <Input className="input" type="digit" value={selPurchase} onInput={(event) => setSelPurchase(event.detail.value)} />
                    {(() => {
                      // 仅当本次进货价与当前编辑框不同才提示；42 与 42.00 视为相同
                      if (!incomingPurchasePrice || !editId) return null
                      const incomingFen = yuanToFen(incomingPurchasePrice)
                      const currentFen = selPurchase.trim() ? yuanToFen(selPurchase) : null
                      if (currentFen === incomingFen) return null
                      return (
                        <Text
                          className="field-warn"
                          onClick={() => setSelPurchase(fenToYuan(incomingFen))}
                        >
                          本次进货 ¥{incomingPurchasePrice} · 点此采用
                        </Text>
                      )
                    })()}
                  </View>
                </View>
                <View className="field-row">
                  <View className="field half">
                    <Text className="field-label">友情价（元）</Text>
                    <Input className="input" type="digit" value={selFriend} onInput={(event) => setSelFriend(event.detail.value)} />
                    {editFriendLow ? <Text className="field-warn">! 低于进货价</Text> : null}
                  </View>
                  {!multiSku && !showSkuManager && (
                    <View className="field half">
                      <Text className="field-label">销售单位</Text>
                      <Input className="input" placeholder={PH.saleUnit} value={selUnit} onInput={(event) => setSelUnit(event.detail.value)} />
                      {(() => {
                        if (!editId || !incomingUnit) return null
                        if (incomingUnit === selUnit) return null
                        return (
                          <Text className="field-warn" onClick={() => setSelUnit(incomingUnit)}>
                            本次识别「{incomingUnit}」 · 点此采用
                          </Text>
                        )
                      })()}
                    </View>
                  )}
                </View>
                <View className="inline-actions">
                  {showSkuManager ? (
                    <Button
                      className="btn btn-ghost"
                      onClick={() => {
                        setShowSkuManager(false)
                        if (selectedSku) selectSku(selectedSku)
                      }}
                    >
                      取消
                    </Button>
                  ) : (
                    <Button
                      className="btn btn-ghost"
                      onClick={() => {
                        setShowSkuManager(true)
                        setNewSpecName('')
                        setSelRetail('')
                        setSelPurchase('')
                        setSelFriend('')
                      }}
                    >
                      添加版本
                    </Button>
                  )}
                  <Button className="btn btn-primary" loading={savingPrices} onClick={saveSkuPrices}>
                    {showSkuManager ? '保存版本' : '保存价格'}
                  </Button>
                </View>
              </View>
            </>
          )}

          <View className="footer-bar">
            <Button className="btn btn-primary" loading={busy || savingCode} onClick={saveBasicInfo}>
              {editId ? '保存常用信息' : '创建商品'}
            </Button>
          </View>
        </>
      )}

      {step === 2 && (
        <>
          <View className="card">
            {!editId ? (
              <Text className="muted">请先在「常用」创建商品，再添加优惠</Text>
            ) : (() => {
              const sharedSku = detail?.skus.find((item) => item.status === 'active') ?? detail?.skus[0] ?? null
              return sharedSku ? (
                <PromotionRows
                  rows={sharedSku.promotions.map((item) => ({
                    key: item.id,
                    content: item.content,
                    starts: item.starts_at,
                    ends: item.ends_at,
                  }))}
                  onAdd={async (input) => {
                    await api.post(`/api/skus/${sharedSku.id}/promotions`, input)
                    markDirty()
                    load()
                  }}
                  onRemove={async (key) => {
                    await api.delete(`/api/skus/promotions/${key}`)
                    markDirty()
                    load()
                  }}
                  onUpdate={async (key, input) => {
                    await api.patch(`/api/skus/promotions/${key}`, input)
                    markDirty()
                    load()
                  }}
                />
              ) : (
                <Text className="muted">暂无版本</Text>
              )
            })()}
          </View>
        </>
      )}

      {step === 3 && (
        <>
          {editId && detail && (
            <View className="card">
              <View className="row-between">
                <Text className="field-label">在售状态</Text>
                <Switch
                  checked={detail.product.status === 'active'}
                  onChange={async (event) => {
                    const next = event.detail.value ? 'active' : 'archived'
                    const label = next === 'active' ? '上架' : '下架'
                    if (next === 'archived') {
                      const confirm = await Taro.showModal({
                        title: '下架商品',
                        content: '下架后商品列表默认不显示，开单搜索也不会出现；条码仍可能被入库匹配到，会标记为「已下架」。确定吗？',
                      })
                      if (!confirm.confirm) return
                    }
                    try {
                      await api.patch(`/api/products/${editId}`, { status: next })
                      setDetail({
                        ...detail,
                        product: { ...detail.product, status: next },
                      })
                      Taro.setStorageSync('sm_products_dirty', 1)
                      Taro.showToast({ title: `已${label}`, icon: 'success' })
                    } catch (error) {
                      Taro.showToast({ title: (error as Error).message || '操作失败', icon: 'none' })
                    }
                  }}
                />
              </View>
              <Text className="muted">
                {detail.product.status === 'active'
                  ? '当前在售：列表与开单可检索'
                  : '当前已下架：商品列表需打开「已下架」筛选才能看到；入库条码匹配会显示「已下架」标识'}
              </Text>
            </View>
          )}
          <View className="card">
            <View className="field">
              <Text className="field-label">别名</Text>
              <TagInput values={aliasValues} onChange={setAliasValues} placeholder={PH.productAlias} />
            </View>
            <View className="field">
              <Text className="field-label">备注</Text>
              <Textarea
                className="notes-input"
                value={notes}
                maxlength={200}
                height={200}
                style={{ height: '200px', minHeight: '200px' }}
                onInput={(event) => setNotes(event.detail.value)}
              />
            </View>
          </View>
          {editId && (
            <>
              <View className="section-title">关联商品</View>
              <View className="card">
                {(detail?.linked_products ?? []).map((link) => (
                  <View key={link.link_id} className="list-row">
                    <View
                      className="list-row-main"
                      onClick={() => Taro.navigateTo({ url: `/pages/product-detail/index?id=${link.id}` })}
                    >
                      <Text>{link.name}</Text>
                      <Text className="muted">
                        {formatFen(link.min_retail_price)}
                        {link.min_retail_price !== link.max_retail_price ? ` ~ ${formatFen(link.max_retail_price)}` : ''}
                      </Text>
                    </View>
                    <Text className="danger-text" onClick={() => removeLink(link)}>
                      取消关联
                    </Text>
                  </View>
                ))}
                <View className="search-row">
                  <Input
                    className="input search-input"
                    placeholder="搜索要关联的商品"
                    value={linkKeyword}
                    confirmType="search"
                    onInput={(event) => setLinkKeyword(event.detail.value)}
                    onConfirm={searchLinks}
                  />
                  <Button className="btn btn-ghost scan-btn" onClick={searchLinks}>
                    搜索
                  </Button>
                </View>
                {linkResults.map((item) => (
                  <View key={item.id} className="list-row" onClick={() => addLink(item.id)}>
                    <View className="list-row-main">
                      <Text>{item.name}</Text>
                      <Text className="muted">{formatFen(item.min_retail_price)}</Text>
                    </View>
                    <Text className="primary-text">关联</Text>
                  </View>
                ))}
              </View>
            </>
          )}
          <View className="footer-bar">
            <Button className="btn btn-primary" loading={busy} onClick={saveOtherInfo}>
              {editId ? '保存其他信息' : '请先创建商品'}
            </Button>
          </View>
        </>
      )}
    </View>
  )
}

function PromotionRows({
  rows,
  onAdd,
  onRemove,
  onUpdate,
}: {
  rows: Array<{ key: string | number; content: string; starts: string | null; ends: string | null }>
  onAdd: (input: { content: string; starts_at: string | null; ends_at: string | null }) => void | Promise<void>
  onRemove: (key: string | number) => void | Promise<void>
  onUpdate?: (
    key: string | number,
    input: { content: string; starts_at: string | null; ends_at: string | null },
  ) => void | Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [editingKey, setEditingKey] = useState<string | number | null>(null)
  const [content, setContent] = useState('')
  const [starts, setStarts] = useState('')
  const [ends, setEnds] = useState('')

  const resetForm = () => {
    setOpen(false)
    setEditingKey(null)
    setContent('')
    setStarts('')
    setEnds('')
  }

  const startEdit = (row: { key: string | number; content: string; starts: string | null; ends: string | null }) => {
    setEditingKey(row.key)
    setOpen(true)
    setContent(row.content)
    setStarts(row.starts || '')
    setEnds(row.ends || '')
  }

  const submit = async () => {
    if (!content.trim()) {
      Taro.showToast({ title: '请填写优惠内容', icon: 'none' })
      return
    }
    const payload = { content: content.trim(), starts_at: starts || null, ends_at: ends || null }
    if (editingKey != null && onUpdate) {
      await onUpdate(editingKey, payload)
    } else {
      await onAdd(payload)
    }
    resetForm()
  }

  const removeRow = async (key: string | number) => {
    const ok = await Taro.showModal({ title: '删除优惠', content: '确定删除这条优惠吗？' })
    if (!ok.confirm) return
    await onRemove(key)
  }

  return (
    <View>
      {rows.map((row) => (
        <View key={row.key} className="list-row">
          <View className="list-row-main">
            <Text>{row.content}</Text>
            <Text className="muted">{promoLabel(row)}</Text>
          </View>
          <View className="row-actions">
            <Text className="primary-text" onClick={() => startEdit(row)}>
              编辑
            </Text>
            <Text className="danger-text" onClick={() => removeRow(row.key)}>
              删除
            </Text>
          </View>
        </View>
      ))}
      {!rows.length && !open && <Text className="muted">暂无优惠</Text>}
      {!open ? (
        <Button className="btn btn-ghost full-btn" onClick={() => setOpen(true)}>
          添加优惠
        </Button>
      ) : (
        <View className="inline-form">
          <Input
            className="input field"
            placeholder={PH.promotion}
            value={content}
            onInput={(event) => setContent(event.detail.value)}
          />
          <View className="field-row">
            <DateRangeField start={starts} end={ends} onStartChange={setStarts} onEndChange={setEnds} />
          </View>
          <View className="inline-actions">
            <Button className="btn btn-ghost" onClick={resetForm}>
              取消
            </Button>
            <Button className="btn btn-primary" onClick={submit}>
              {editingKey != null ? '保存修改' : '保存优惠'}
            </Button>
          </View>
        </View>
      )}
    </View>
  )
}
