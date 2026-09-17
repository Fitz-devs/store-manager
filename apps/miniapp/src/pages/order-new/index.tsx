import { useEffect, useMemo, useRef, useState } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { Button, Image, Input, Switch, Text, View } from '@tarojs/components'
import type {
  CustomerAddress,
  CustomerListItem,
  HomeReport,
  ProductDetail,
  ProductListItem,
  SkuWithBarcodes,
} from '@sm/shared'
import { api, fileUrl, getUser } from '../../api/client'
import { PH } from '../../config/placeholders'
import { DateTimeField } from '../../components/datetime-field'
import { Stepper } from '../../components/stepper'
import { useAuthGuard } from '../../utils/auth'
import { pickMapLocation, hasCoords, formatPickedAddress } from '../../utils/map'
import { pickImages, uploadLocalImage } from '../../utils/media'
import { TAB_PAGE_FOOTER_STYLE } from '../../utils/env'
import { scanBarcode } from '../../utils/scan'
import { setPendingOrdersFilter } from '../../utils/orderFilter'
import { fenToYuan, formatFen, todayString, yuanToFen } from '../../utils/format'
import './index.scss'

interface CartItem {
  lineId: string
  sku: SkuWithBarcodes
  productName: string
  unitName: string
  conversion: number
  qty: number
  price: number
}

type PayMethod = 'cash' | 'wechat' | 'alipay' | 'other'

const PAY_METHODS: Array<{ value: PayMethod; label: string }> = [
  { value: 'cash', label: '现金' },
  { value: 'wechat', label: '微信' },
  { value: 'alipay', label: '支付宝' },
  { value: 'other', label: '其他' },
]

const METHOD_LABELS: Record<PayMethod, string> = Object.fromEntries(
  PAY_METHODS.map((method) => [method.value, method.label]),
) as Record<PayMethod, string>

interface PaymentEntry {
  id: string
  method: PayMethod
  /** 元字符串草稿，现金/微信/支付宝/其他用 */
  amount: string
  /** 是否手动改过金额（首笔自动填合计用） */
  edited: boolean
  /** 其他-抵扣原因 */
  reason: string
  note: string
  /** 凭证照片 key */
  photoKey: string
}

let entrySeq = 0
const newPaymentEntry = (method: PayMethod = 'cash'): PaymentEntry => ({
  id: `pe_${Date.now()}_${entrySeq++}`,
  method,
  amount: '',
  edited: false,
  reason: '',
  note: '',
  photoKey: '',
})

const entryAmount = (entry: PaymentEntry): number => yuanToFen(entry.amount)

export default function OrderNew() {
  useAuthGuard()
  const [report, setReport] = useState<HomeReport | null>(null)
  const [keyword, setKeyword] = useState('')
  const [results, setResults] = useState<ProductListItem[]>([])
  const [searching, setSearching] = useState(false)
  const [cart, setCart] = useState<CartItem[]>([])
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({})
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [customer, setCustomer] = useState<CustomerListItem | null>(null)
  const [addresses, setAddresses] = useState<CustomerAddress[]>([])

  const [deliveryOn, setDeliveryOn] = useState(false)
  const [address, setAddress] = useState('')
  const [addressLat, setAddressLat] = useState<number | null>(null)
  const [addressLng, setAddressLng] = useState<number | null>(null)
  const [contact, setContact] = useState('')
  const [phone, setPhone] = useState('')
  const [deliveryDate, setDeliveryDate] = useState(todayString())
  const [deliveryTime, setDeliveryTime] = useState(
    new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(11, 16),
  )
  const [saveAddress, setSaveAddress] = useState(true)

  const [paid, setPaid] = useState(true)
  const [entries, setEntries] = useState<PaymentEntry[]>(() => [newPaymentEntry()])
  const [expandedId, setExpandedId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [step, setStep] = useState(1)

  const canLeaveStep1 = cart.length > 0
  const canLeaveStep2 = !deliveryOn || address.trim().length > 0

  const goStep = (target: number) => {
    if (target === 2 && !canLeaveStep1) {
      Taro.showToast({ title: '请先添加商品', icon: 'none' })
      return
    }
    if (target === 3) {
      if (!canLeaveStep1) {
        Taro.showToast({ title: '请先添加商品', icon: 'none' })
        return
      }
      if (!canLeaveStep2) {
        Taro.showToast({ title: '请填写送货地址', icon: 'none' })
        return
      }
    }
    setStep(target)
  }

  const goNext = () => goStep(step + 1)
  const goBack = () => setStep((value) => Math.max(1, value - 1))

  const loadReport = () => {
    api.get<HomeReport>('/api/reports/home').then(setReport).catch(() => undefined)
  }

  useDidShow(() => {
    loadReport()
    const picked = Taro.getStorageSync('sm_customer_pick') as
      | { mode: 'select'; customer: CustomerListItem }
      | { mode: 'clear' }
      | ''
    if (picked) {
      Taro.removeStorageSync('sm_customer_pick')
      if (picked.mode === 'clear') {
        setCustomer(null)
        setAddresses([])
      } else {
        applyCustomer(picked.customer).catch(() => undefined)
      }
    }
    const quickAdd = Taro.getStorageSync('sm_quick_add_product')
    if (quickAdd) {
      Taro.removeStorageSync('sm_quick_add_product')
      addProduct(Number(quickAdd)).catch(() => undefined)
    }
  })

  const total = useMemo(() => cart.reduce((sum, item) => sum + item.price * item.qty, 0), [cart])

  useEffect(() => {
    setEntries((previous) => {
      if (previous.length !== 1) return previous
      const [first] = previous
      if (!first || first.edited) return previous
      const nextAmount = fenToYuan(total)
      return first.amount === nextAmount ? previous : [{ ...first, amount: nextAmount }]
    })
  }, [total])

  const paidTotal = useMemo(
    () => entries.reduce((sum, entry) => sum + entryAmount(entry), 0),
    [entries],
  )

  const expanded = entries.find((entry) => entry.id === expandedId) ?? entries[0]

  const updateEntry = (id: string, patch: Partial<PaymentEntry>) => {
    setEntries((previous) => previous.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)))
  }

  const addEntry = () => {
    const entry = newPaymentEntry()
    setEntries((previous) => [...previous, entry])
    setExpandedId(entry.id)
  }

  const removeEntry = (id: string) => {
    setEntries((previous) => {
      const next = previous.filter((entry) => entry.id !== id)
      return next.length ? next : [newPaymentEntry()]
    })
    setExpandedId('')
  }

  const doSearch = async (value?: string) => {
    const q = (value ?? keyword).trim()
    if (!q) {
      setResults([])
      return
    }
    setSearching(true)
    try {
      const data = await api.get<{ items: ProductListItem[] }>(
        `/api/products?q=${encodeURIComponent(q)}&page_size=20`,
      )
      setResults(data.items)
    } catch (error) {
      Taro.showToast({ title: (error as Error).message, icon: 'none' })
    } finally {
      setSearching(false)
    }
  }

  const onKeywordInput = (value: string) => {
    setKeyword(value)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => doSearch(value), 350)
  }

  const addSku = (sku: SkuWithBarcodes, productName: string, price: number) => {
    setCart((previous) => {
      const index = previous.findIndex(
        (item) => item.sku.id === sku.id && item.price === price,
      )
      if (index >= 0) {
        const next = [...previous]
        next[index] = { ...next[index]!, qty: next[index]!.qty + 1 }
        return next
      }
      return [
        ...previous,
        {
          lineId: `${sku.id}_${Date.now()}`,
          sku,
          productName,
          unitName: sku.sale_unit,
          conversion: 1,
          qty: 1,
          price,
        },
      ]
    })
    setResults([])
    setKeyword('')
  }

  const offerAddSku = async (sku: SkuWithBarcodes, productName: string) => {
    if (sku.stock_status === 'out_of_stock') {
      const confirm = await Taro.showModal({ title: '该商品已标记缺货', content: '仍要加入订单吗？' })
      if (!confirm.confirm) return
    }
    addSku(sku, productName, sku.retail_price)
  }

  const addProduct = async (productId: number) => {
    try {
      const detail = await api.get<ProductDetail>(`/api/products/${productId}`)
      const activeSkus = detail.skus.filter((sku) => sku.status === 'active')
      if (!activeSkus.length) {
        Taro.showToast({ title: '该商品没有可用版本', icon: 'none' })
        return
      }
      if (activeSkus.length === 1) {
        await offerAddSku(activeSkus[0]!, detail.product.name)
        return
      }
      const labels = activeSkus.map(
        (sku) => `${sku.spec_name ?? '默认'} ${formatFen(sku.retail_price)}/${sku.sale_unit}${sku.stock_status === 'out_of_stock' ? '（缺货）' : ''}`,
      )
      const sheet = await Taro.showActionSheet({ itemList: labels })
      const sku = activeSkus[sheet.tapIndex]
      if (sku) await offerAddSku(sku, detail.product.name)
    } catch (error) {
      Taro.showToast({ title: (error as Error).message, icon: 'none' })
    }
  }

  const scan = async () => {
    const code = await scanBarcode()
    if (!code) return
    Taro.showLoading({ title: '查询中', mask: true })
    try {
      const lookup = await api.get<{
        source: string
        product?: ProductDetail
        matched_sku_ids?: number[]
      }>(`/api/barcodes/lookup?code=${encodeURIComponent(code)}`)
      Taro.hideLoading()
      if (lookup.product) {
        const detail = lookup.product
        const activeSkus = detail.skus.filter((sku) => sku.status === 'active')
        const matched = activeSkus.filter((sku) => lookup.matched_sku_ids?.includes(sku.id))
        const candidates = matched.length ? matched : activeSkus
        if (!candidates.length) {
          Taro.showToast({ title: '该商品没有可用版本', icon: 'none' })
          return
        }
        if (candidates.length === 1) {
          await offerAddSku(candidates[0]!, detail.product.name)
          return
        }
        const labels = candidates.map(
          (sku) => `${sku.spec_name ?? '默认'} ${formatFen(sku.retail_price)}/${sku.sale_unit}`,
        )
        const sheet = await Taro.showActionSheet({ itemList: labels })
        const sku = candidates[sheet.tapIndex]
        if (sku) await offerAddSku(sku, detail.product.name)
        return
      }
      const confirm = await Taro.showModal({
        title: `未找到条码 ${code}`,
        content: '是否新建商品？',
      })
      if (confirm.confirm) {
        Taro.navigateTo({ url: `/pages/product-edit/index?barcode=${encodeURIComponent(code)}` })
      }
    } catch (error) {
      Taro.hideLoading()
      Taro.showToast({ title: (error as Error).message, icon: 'none' })
    } finally {
      Taro.hideLoading()
    }
  }

  const setQtyAt = (index: number, qty: number) => {
    setCart((previous) => {
      const next = [...previous]
      const item = next[index]
      if (!item) return previous
      next[index] = { ...item, qty: Math.max(1, qty) }
      return next
    })
  }

  const updateQty = (index: number, delta: number) => {
    let removed = false
    setCart((previous) => {
      const next = [...previous]
      const item = next[index]
      if (!item) return previous
      const qty = item.qty + delta
      if (qty <= 0) {
        removed = true
        next.splice(index, 1)
        return next
      }
      next[index] = { ...item, qty }
      return next
    })
    if (removed) {
      Taro.showToast({ title: '已移除该商品', icon: 'none' })
    }
  }

  const updatePrice = (index: number, value: string, lineId: string) => {
    setPriceDrafts((previous) => ({ ...previous, [lineId]: value }))
    setCart((previous) => {
      const next = [...previous]
      const item = next[index]
      if (!item) return previous
      next[index] = { ...item, price: yuanToFen(value) }
      return next
    })
  }

  const applyCustomer = async (item: CustomerListItem) => {
    setCustomer(item)
    setAddresses([])
    if (deliveryOn) {
      setContact((current) => current || item.name)
      setPhone((current) => current || item.phone || '')
    } else {
      if (!contact) setContact(item.name)
      if (!phone && item.phone) setPhone(item.phone)
    }
    try {
      const list = await api.get<CustomerAddress[]>(`/api/customers/${item.id}/addresses`)
      setAddresses(list)
      const primary = list.find((address) => address.is_default === 1) ?? list[0]
      if (primary && deliveryOn) {
        setAddress(primary.address)
        setAddressLat(primary.lat)
        setAddressLng(primary.lng)
        setContact(primary.contact_name ?? item.name)
        setPhone(primary.phone ?? item.phone ?? '')
      }
    } catch {
      // ignore
    }
  }

  const pickAddress = (item: CustomerAddress) => {
    setAddress(item.address)
    setAddressLat(item.lat)
    setAddressLng(item.lng)
    setContact(item.contact_name || customer?.name || '')
    setPhone(item.phone || customer?.phone || '')
  }

  const pickDeliveryLocation = async () => {
    const picked = await pickMapLocation(address.trim() || customer?.name || '')
    if (!picked) return
    setAddressLat(picked.lat)
    setAddressLng(picked.lng)
    // 回填「行政地址 + POI 名称」，避免只剩区级
    setAddress(formatPickedAddress(picked) || address)
  }

  const pickPaymentPhoto = async (entryId: string) => {
    try {
      const images = await pickImages({ count: 1, source: 'both' })
      const image = images[0]
      if (!image) return
      Taro.showLoading({ title: '上传中' })
      const uploaded = await uploadLocalImage(image, 'payments')
      Taro.hideLoading()
      updateEntry(entryId, { photoKey: uploaded.key })
    } catch (error) {
      Taro.hideLoading()
      const message = (error as Error).message ?? ''
      if (!message.includes('cancel')) {
        Taro.showToast({ title: message || '上传失败', icon: 'none' })
      }
    }
  }

  const submit = async () => {
    if (submitting) return
    if (!cart.length) {
      Taro.showToast({ title: '请先添加商品', icon: 'none' })
      return
    }
    if (deliveryOn && !address.trim()) {
      Taro.showToast({ title: '请填写送货地址', icon: 'none' })
      return
    }
    if (paid) {
      for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index]!
        const label = METHOD_LABELS[entry.method]
        if (yuanToFen(entry.amount) <= 0) {
          Taro.showToast({ title: `第${index + 1}笔（${label}）请输入金额`, icon: 'none' })
          return
        }
      }
      if (paidTotal <= 0) {
        Taro.showToast({ title: '请输入收款金额', icon: 'none' })
        return
      }
      if (paidTotal > total) {
        Taro.showToast({ title: '收款金额不能大于订单金额', icon: 'none' })
        return
      }
    }
    setSubmitting(true)
    try {
      const order = await api.post<{ id: number; order_no: string }>('/api/orders', {
        customer_id: customer?.id,
        customer_name: customer?.name,
        is_credit: !paid,
        delivery: {
          required: deliveryOn,
          address: deliveryOn ? address.trim() : null,
          contact: deliveryOn ? contact.trim() : null,
          phone: deliveryOn ? phone.trim() : null,
          at: deliveryOn ? `${deliveryDate} ${deliveryTime}` : null,
          lat: deliveryOn ? addressLat : null,
          lng: deliveryOn ? addressLng : null,
        },
        items: cart.map((item) => ({
          sku_id: item.sku.id,
          unit_name: item.unitName,
          conversion: item.conversion,
          qty: item.qty,
          unit_price: item.price,
          promotion_text: null,
        })),
        payments: paid
          ? entries.map((entry) => ({
              method: entry.method,
              amount: entryAmount(entry),
              note: (entry.method === 'other' ? entry.reason : entry.note).trim() || null,
              photo_key: entry.photoKey || null,
            }))
          : undefined,
      })

      if (customer && deliveryOn && saveAddress && address.trim()) {
        const exists = addresses.find((item) => item.address === address.trim())
        if (!exists) {
          try {
            await api.post(`/api/customers/${customer.id}/addresses`, {
              address: address.trim(),
              contact_name: contact.trim() || null,
              phone: phone.trim() || null,
              lat: addressLat,
              lng: addressLng,
              is_default: addresses.length === 0,
            })
          } catch {
            // ignore
          }
        } else if (addressLat != null && addressLng != null && !hasCoords(exists)) {
          try {
            await api.patch(`/api/customers/${customer.id}/addresses/${exists.id}`, {
              lat: addressLat,
              lng: addressLng,
            })
          } catch {
            // ignore
          }
        }
      }

      Taro.showToast({ title: `开单成功 ${order.order_no}`, icon: 'success' })
      setCart([])
      setPriceDrafts({})
      setDeliveryOn(false)
      setPaid(true)
      setCustomer(null)
      setAddresses([])
      setAddress('')
      setAddressLat(null)
      setAddressLng(null)
      setContact('')
      setPhone('')
      setDeliveryDate(todayString())
      setDeliveryTime(new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(11, 16))
      setEntries([newPaymentEntry()])
      setExpandedId('')
      setStep(1)
      loadReport()
      setTimeout(() => {
        Taro.navigateTo({ url: `/pages/order-detail/index?id=${order.id}` })
      }, 500)
    } catch (error) {
      Taro.showToast({ title: (error as Error).message, icon: 'none' })
    } finally {
      setSubmitting(false)
    }
  }

  const user = getUser<{ nickname?: string | null; username?: string }>()

  return (
    <View className="order-page">
      <View className="stepper">
        <View className="step-node" onClick={() => goStep(1)}>
          <View className={`step-dot ${step === 1 ? 'step-dot-active' : ''} ${step > 1 ? 'step-dot-done' : ''}`}>
            <Text>{step > 1 ? '✓' : '1'}</Text>
          </View>
          <Text className={`step-label ${step === 1 ? 'step-label-active' : ''}`}>选商品</Text>
        </View>
        <View className="step-line" />
        <View className="step-node" onClick={() => goStep(2)}>
          <View className={`step-dot ${step === 2 ? 'step-dot-active' : ''} ${step > 2 ? 'step-dot-done' : ''}`}>
            <Text>{step > 2 ? '✓' : '2'}</Text>
          </View>
          <Text className={`step-label ${step === 2 ? 'step-label-active' : ''}`}>客户配送</Text>
        </View>
        <View className="step-line" />
        <View className="step-node" onClick={() => goStep(3)}>
          <View className={`step-dot ${step === 3 ? 'step-dot-active' : ''}`}>
            <Text>3</Text>
          </View>
          <Text className={`step-label ${step === 3 ? 'step-label-active' : ''}`}>付款</Text>
        </View>
      </View>

      {step !== 1 && (
        <View className="card step-summary">
          <View className="row-between">
            <Text className="step-summary-title">{cart.length} 项商品</Text>
            <Text className="price-text total-value">{formatFen(total)}</Text>
          </View>
          <Text className="muted">
            {step === 2 ? '下一步确认客户与配送方式' : `${customer?.name || '散客'} · ${deliveryOn ? '送货上门' : '到店自取'}`}
          </Text>
        </View>
      )}

      {step === 1 && report && (
        <View className="stats">
          <View className="stat">
            <Text className="stat-value">{formatFen(report.today_sales)}</Text>
            <Text className="stat-label">今日销售</Text>
          </View>
          <View
            className="stat"
            onClick={() => {
              setPendingOrdersFilter('unpaid')
              Taro.switchTab({ url: '/pages/orders/index' })
            }}
          >
            <Text className="stat-value danger-text">{formatFen(report.unpaid_total)}</Text>
            <Text className="stat-label">待收款 {report.unpaid_order_count}</Text>
          </View>
          <View
            className="stat"
            onClick={() => {
              setPendingOrdersFilter('pending')
              Taro.switchTab({ url: '/pages/orders/index' })
            }}
          >
            <Text className="stat-value primary-text">{report.pending_delivery_count}</Text>
            <Text className="stat-label">待送货</Text>
          </View>
        </View>
      )}

      {step === 1 && (
      <View className="card">
        <View className="scan-hero" onClick={scan}>
          <View className="scan-hero-icon">
            <View className="scan-hero-bar" />
            <View className="scan-hero-bar scan-hero-bar-wide" />
            <View className="scan-hero-bar" />
            <View className="scan-hero-bar scan-hero-bar-wide" />
          </View>
          <View className="scan-hero-text">
            <Text className="scan-hero-title">扫码加购</Text>
            <Text className="scan-hero-sub">对准条码 · 直接加入购物车</Text>
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
            onConfirm={() => doSearch()}
          />
          <Button className="btn btn-primary scan-btn" onClick={scan}>
            扫码
          </Button>
        </View>
        {searching && <View className="muted">搜索中…</View>}
        {!!results.length && (
          <View className="search-results">
            {results.map((product) => (
              <View key={product.id} className="search-item" onClick={() => addProduct(product.id)}>
                {product.image_key ? (
                  <Image className="search-thumb" src={fileUrl(product.image_key)} mode="aspectFill" />
                ) : (
                  <View className="search-thumb search-thumb-empty" />
                )}
                <View className="search-info">
                  <View className="row-between">
                    <Text className="search-name">{product.name}</Text>
                    {product.out_of_stock && <Text className="tag tag-danger">缺货</Text>}
                  </View>
                  <Text className="muted">
                    {product.min_retail_price === product.max_retail_price
                      ? formatFen(product.min_retail_price)
                      : `${formatFen(product.min_retail_price)} ~ ${formatFen(product.max_retail_price)}`}
                    {product.sku_count > 1 ? ` · ${product.sku_count} 个版本` : ''}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
      )}

      {step === 1 && (
      <View className="card cart-card">
        <View className="row-between">
          <Text className="card-title">购物车</Text>
          <Text className="muted">{cart.length} 项</Text>
        </View>
        <View className="cart-list">
        {!cart.length && (
          <View className="sm-empty" style={{ padding: '80px 20px' }}>
            <Text className="sm-empty-sub">扫码或搜索，把商品加进来</Text>
          </View>
        )}
        {cart.map((item, index) => (
          <View key={item.lineId} className="cart-item">
            <View className="cart-row-top">
              <View className="cart-main">
                <Text className="cart-name">
                  {item.productName}
                  {item.sku.spec_name ? ` · ${item.sku.spec_name}` : ''}
                </Text>
                <Text className="muted">
                  {item.unitName}
                  {item.sku.stock_status === 'out_of_stock' ? ' · 缺货' : ''}
                </Text>
              </View>
              <Text className="price-text cart-line-total">
                {formatFen(item.price * item.qty)}
              </Text>
            </View>
            <View className="cart-row-bottom">
              <View className="cart-price">
                <Text className="muted">单价</Text>
                <Input
                  className="price-input"
                  type="digit"
                  value={priceDrafts[item.lineId] ?? fenToYuan(item.price)}
                  onInput={(event) => updatePrice(index, event.detail.value, item.lineId)}
                />
                <Text className="muted">元/{item.unitName}</Text>
              </View>
              <Stepper
                value={item.qty}
                min={1}
                onChange={(next) => setQtyAt(index, next)}
                onRemoveAtMin={() => updateQty(index, -1)}
              />
            </View>
          </View>
        ))}
        </View>
        {!!cart.length && (
          <View className="row-between total-row">
            <Text>合计</Text>
            <Text className="price-text total-value">{formatFen(total)}</Text>
          </View>
        )}
      </View>
      )}

      {step === 2 && (
      <View className="card">
        <View
          className="row-between field"
          onClick={() => Taro.navigateTo({ url: '/pages/customer-select/index' })}
        >
          <Text className="field-label">客户</Text>
          <Text className={customer ? 'picker-value' : 'muted'}>
            {customer ? `${customer.name} ›` : '散客 / 选择客户 ›'}
          </Text>
        </View>

        <View className="row-between field">
          <Text className="field-label">送货上门</Text>
          <Switch checked={deliveryOn} color="#2563eb" onChange={(event) => setDeliveryOn(event.detail.value)} />
        </View>

        {deliveryOn && (
          <View>
            {!!addresses.length && (
              <View className="address-chips">
                {addresses.map((item) => (
                  <View
                    key={item.id}
                    className={`address-chip ${address === item.address ? 'address-chip-active' : ''}`}
                    onClick={() => pickAddress(item)}
                  >
                    <Text className="address-label">
                      {item.label || item.contact_name || '地址'}
                      {item.is_default === 1 ? ' · 默认' : ''}
                    </Text>
                    <Text className="address-text">{item.address}</Text>
                  </View>
                ))}
              </View>
            )}
            <Input
              className="input field"
              placeholder="送货地址（选点后可补门牌等）"
              value={address}
              onInput={(event) => setAddress(event.detail.value)}
            />
            <Button className="btn btn-ghost full-btn" onClick={pickDeliveryLocation}>
              地图选点
              {addressLat != null && addressLng != null ? '（已选坐标）' : ''}
            </Button>
            <Input className="input field" placeholder="联系人" value={contact} onInput={(event) => setContact(event.detail.value)} />
            <Input className="input field" type="number" maxlength={20} placeholder="联系电话" value={phone} onInput={(event) => setPhone(event.detail.value)} />
            <View className="field-row">
              <DateTimeField
                date={deliveryDate}
                time={deliveryTime}
                onDateChange={setDeliveryDate}
                onTimeChange={setDeliveryTime}
              />
            </View>
            {customer && (
              <View className="row-between save-address-row">
                <Text className="muted">把该地址保存到客户</Text>
                <Switch checked={saveAddress} color="#2563eb" onChange={(event) => setSaveAddress(event.detail.value)} />
              </View>
            )}
          </View>
        )}
      </View>
      )}

      {step === 3 && (
      <View className="card">
        <View className="row-between field payment-title">
          <Text className="field-label">付款</Text>
          <View className="paid-toggle">
            <View
              className={`paid-option ${!paid ? 'paid-option-active' : ''}`}
              onClick={() => setPaid(false)}
            >
              未付款
            </View>
            <View
              className={`paid-option ${paid ? 'paid-option-active' : ''}`}
              onClick={() => setPaid(true)}
            >
              已付款
            </View>
          </View>
        </View>

        {paid && (
          <View>
            {entries.map((entry, index) => {
              const open = expanded?.id === entry.id
              return (
                <View key={entry.id} className="pay-entry">
                  <View className="pay-entry-head" onClick={() => setExpandedId(entry.id)}>
                    <Text className="pay-entry-title">
                      第 {index + 1} 笔 · {METHOD_LABELS[entry.method]}
                    </Text>
                    <View className="pay-entry-side">
                      <Text className="price-text">{formatFen(entryAmount(entry))}</Text>
                      {entries.length > 1 && (
                        <Text
                          className="danger-text"
                          onClick={(event) => {
                            event.stopPropagation()
                            removeEntry(entry.id)
                          }}
                        >
                          删除
                        </Text>
                      )}
                    </View>
                  </View>

                  {open && (
                    <View className="pay-entry-body">
                      <View className="pay-methods">
                        {PAY_METHODS.map((method) => (
                          <View
                            key={method.value}
                            className={`pay-method ${entry.method === method.value ? 'pay-method-active' : ''}`}
                            onClick={() => updateEntry(entry.id, { method: method.value })}
                          >
                            {method.label}
                          </View>
                        ))}
                      </View>

                      {entry.method === 'other' ? (
                        <View>
                          <View className="field">
                            <Text className="field-label">抵扣原因</Text>
                            <Input
                              className="input"
                              placeholder={PH.otherReason}
                              value={entry.reason}
                              onInput={(event) => updateEntry(entry.id, { reason: event.detail.value })}
                            />
                          </View>
                          <View className="field">
                            <Text className="field-label">抵扣金额（元）</Text>
                            <Input
                              className="input"
                              type="digit"
                              value={entry.amount}
                              onInput={(event) => updateEntry(entry.id, { amount: event.detail.value, edited: true })}
                            />
                            <Text className="muted">按抵扣金额计入已收款</Text>
                          </View>
                        </View>
                      ) : (
                        <View className="field">
                          <Text className="field-label">收款金额（元）</Text>
                          <Input
                            className="input"
                            type="digit"
                            value={entry.amount}
                            onInput={(event) => updateEntry(entry.id, { amount: event.detail.value, edited: true })}
                          />
                        </View>
                      )}

                      <View className="field">
                        <Text className="field-label">凭证照片</Text>
                        {entry.photoKey ? (
                          <View className="pay-photo-row">
                            <Image
                              className="pay-photo-thumb"
                              src={fileUrl(entry.photoKey)}
                              mode="aspectFill"
                              onClick={() =>
                                Taro.previewImage({
                                  current: fileUrl(entry.photoKey),
                                  urls: [fileUrl(entry.photoKey)],
                                })
                              }
                            />
                            <Text
                              className="danger-text"
                              onClick={() => updateEntry(entry.id, { photoKey: '' })}
                            >
                              删除
                            </Text>
                          </View>
                        ) : (
                          <Button
                            className="btn btn-ghost pay-photo-btn"
                            onClick={() => pickPaymentPhoto(entry.id)}
                          >
                            上传凭证照片
                          </Button>
                        )}
                      </View>

                      {entry.method !== 'other' && (
                        <View className="field">
                          <Text className="field-label">备注</Text>
                          <Input
                            className="input"
                            placeholder={PH.paymentNote}
                            value={entry.note}
                            onInput={(event) => updateEntry(entry.id, { note: event.detail.value })}
                          />
                        </View>
                      )}
                    </View>
                  )}
                </View>
              )
            })}

            <Button className="btn btn-ghost pay-add-btn" onClick={addEntry}>
              ＋ 添加一笔付款
            </Button>
            <View className="row-between pay-sum-row">
              <Text className="muted">已收合计 / 订单合计</Text>
              <Text className="price-text">
                {formatFen(paidTotal)} / {formatFen(total)}
              </Text>
            </View>
            {paidTotal < total && (
              <Text className="muted">余款 {formatFen(total - paidTotal)} 可在订单详情继续回款</Text>
            )}
          </View>
        )}
        {!paid && <Text className="muted">该单将计入客户欠款，回款可在订单详情中分次记录</Text>}
      </View>
      )}

      <View className="footer-bar" style={TAB_PAGE_FOOTER_STYLE}>
        <View className="footer-total">
          <Text className="muted">合计</Text>
          <Text className="price-text footer-value">{formatFen(total)}</Text>
        </View>
        {step === 1 && (
          <Button className="btn btn-primary" onClick={goNext}>
            下一步：客户配送
          </Button>
        )}
        {step !== 1 && (
          <View className="footer-btns">
            <Button className="btn btn-ghost" onClick={goBack}>
              上一步
            </Button>
            {step === 2 && (
              <Button className="btn btn-primary" onClick={goNext}>
                下一步：付款
              </Button>
            )}
            {step === 3 && (
              <Button className="btn btn-primary" loading={submitting} onClick={submit}>
                {paid ? '收款开单' : '未付款开单'}
              </Button>
            )}
          </View>
        )}
      </View>
    </View>
  )
}
