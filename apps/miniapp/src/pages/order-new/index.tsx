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

interface GoodsItem {
  sku_id: number
  productName: string
  unit_name: string
  conversion: string
  qty: string
  unit_price: string
}

type PayMethod = 'cash' | 'wechat' | 'alipay' | 'goods' | 'other'

const PAY_METHODS: Array<{ value: PayMethod; label: string }> = [
  { value: 'cash', label: '现金' },
  { value: 'wechat', label: '微信' },
  { value: 'alipay', label: '支付宝' },
  { value: 'goods', label: '换货' },
  { value: 'other', label: '其他' },
]

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
  const [contact, setContact] = useState('')
  const [phone, setPhone] = useState('')
  const [deliveryDate, setDeliveryDate] = useState(todayString())
  const [deliveryTime, setDeliveryTime] = useState(
    new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(11, 16),
  )
  const [saveAddress, setSaveAddress] = useState(true)

  const [paid, setPaid] = useState(true)
  const [payMethod, setPayMethod] = useState<PayMethod>('cash')
  const [payAmount, setPayAmount] = useState('')
  const [payAmountEdited, setPayAmountEdited] = useState(false)
  const [payNote, setPayNote] = useState('')
  const [otherReason, setOtherReason] = useState('')
  const [otherAmount, setOtherAmount] = useState('')
  const [goodsItems, setGoodsItems] = useState<GoodsItem[]>([])
  const [goodsKeyword, setGoodsKeyword] = useState('')
  const [goodsResults, setGoodsResults] = useState<ProductListItem[]>([])
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
    if (!payAmountEdited) setPayAmount(fenToYuan(total))
  }, [total, payAmountEdited])

  const goodsTotal = useMemo(
    () => goodsItems.reduce((sum, item) => sum + yuanToFen(item.unit_price) * (Number(item.qty) || 0), 0),
    [goodsItems],
  )

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
    try {
      const lookup = await api.get<{
        source: string
        product?: ProductDetail
        matched_sku_ids?: number[]
        cache?: { name?: string | null }
      }>(`/api/barcodes/lookup?code=${encodeURIComponent(code)}`)
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
      if (lookup.cache?.name) {
        const confirm = await Taro.showModal({
          title: `条码未录入：${lookup.cache.name}`,
          content: '是否立即录入该商品？',
        })
        if (confirm.confirm) {
          Taro.navigateTo({ url: `/pages/product-edit/index?barcode=${encodeURIComponent(code)}` })
        }
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
      Taro.showToast({ title: (error as Error).message, icon: 'none' })
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
        setContact(primary.contact_name ?? item.name)
        setPhone(primary.phone ?? item.phone ?? '')
      }
    } catch {
      // ignore
    }
  }

  const pickAddress = (item: CustomerAddress) => {
    setAddress(item.address)
    setContact(item.contact_name || customer?.name || '')
    setPhone(item.phone || customer?.phone || '')
  }

  const searchGoods = async (value?: string) => {
    const q = (value ?? goodsKeyword).trim()
    if (!q) {
      setGoodsResults([])
      return
    }
    try {
      const data = await api.get<{ items: ProductListItem[] }>(
        `/api/products?q=${encodeURIComponent(q)}&page_size=10`,
      )
      setGoodsResults(data.items)
    } catch (error) {
      Taro.showToast({ title: (error as Error).message, icon: 'none' })
    }
  }

  const addGoodsItem = async (productId: number) => {
    try {
      const detail = await api.get<ProductDetail>(`/api/products/${productId}`)
      const active = detail.skus.filter((sku) => sku.status === 'active')
      if (!active.length) return
      let sku = active[0]!
      if (active.length > 1) {
        const sheet = await Taro.showActionSheet({
          itemList: active.map((item) => `${item.spec_name ?? '默认'} ${formatFen(item.latest_purchase_price)}`),
        })
        sku = active[sheet.tapIndex] ?? active[0]!
      }
      const referencePrice = sku.latest_purchase_price ?? sku.retail_price
      setGoodsItems((previous) => [
        ...previous,
        {
          sku_id: sku.id,
          productName: detail.product.name,
          unit_name: sku.sale_unit,
          conversion: '1',
          qty: '1',
          unit_price: fenToYuan(referencePrice),
        },
      ])
      setGoodsResults([])
      setGoodsKeyword('')
    } catch (error) {
      Taro.showToast({ title: (error as Error).message, icon: 'none' })
    }
  }

  const updateGoodsItem = (index: number, patch: Partial<GoodsItem>) => {
    setGoodsItems((previous) => {
      const next = [...previous]
      next[index] = { ...next[index]!, ...patch }
      return next
    })
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
    if (paid && payMethod === 'goods' && !goodsItems.length) {
      Taro.showToast({ title: '请录入换货商品', icon: 'none' })
      return
    }
    const finalAmount = paid
      ? payMethod === 'goods'
        ? goodsTotal
        : payMethod === 'other'
          ? yuanToFen(otherAmount)
          : yuanToFen(payAmount)
      : 0
    if (paid && finalAmount <= 0) {
      Taro.showToast({ title: payMethod === 'other' ? '请输入抵扣金额' : '请输入收款金额', icon: 'none' })
      return
    }
    if (paid && finalAmount > total) {
      Taro.showToast({ title: '收款金额不能大于订单金额', icon: 'none' })
      return
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
        },
        items: cart.map((item) => ({
          sku_id: item.sku.id,
          unit_name: item.unitName,
          conversion: item.conversion,
          qty: item.qty,
          unit_price: item.price,
          promotion_text: null,
        })),
        payment: paid
          ? payMethod === 'goods'
            ? {
                method: 'goods',
                amount: goodsTotal,
                note: payNote.trim() || null,
                goods_items: goodsItems.map((item) => ({
                  sku_id: item.sku_id,
                  unit_name: item.unit_name || '件',
                  conversion: Number(item.conversion) || 1,
                  qty: Number(item.qty) || 1,
                  unit_price: yuanToFen(item.unit_price),
                })),
              }
            : payMethod === 'other'
              ? { method: 'other', amount: finalAmount, note: otherReason.trim() || null }
              : { method: payMethod, amount: finalAmount, note: payNote.trim() || null }
          : undefined,
      })

      if (customer && deliveryOn && saveAddress && address.trim()) {
        const exists = addresses.some((item) => item.address === address.trim())
        if (!exists) {
          try {
            await api.post(`/api/customers/${customer.id}/addresses`, {
              address: address.trim(),
              contact_name: contact.trim() || null,
              phone: phone.trim() || null,
              is_default: addresses.length === 0,
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
      setContact('')
      setPhone('')
      setDeliveryDate(todayString())
      setDeliveryTime(new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(11, 16))
      setGoodsItems([])
      setPayAmountEdited(false)
      setPayNote('')
      setOtherReason('')
      setOtherAmount('')
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
            <Input className="input field" placeholder="送货地址" value={address} onInput={(event) => setAddress(event.detail.value)} />
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
            <View className="pay-methods">
              {PAY_METHODS.map((method) => (
                <View
                  key={method.value}
                  className={`pay-method ${payMethod === method.value ? 'pay-method-active' : ''}`}
                  onClick={() => setPayMethod(method.value)}
                >
                  {method.label}
                </View>
              ))}
            </View>

            {payMethod === 'goods' ? (
              <View className="goods-editor">
                <Text className="muted">以货换货（行家换货）：录入用于抵扣货款的商品</Text>
                <View className="search-row">
                  <Input
                    className="input search-input"
                    placeholder="搜索换货商品"
                    value={goodsKeyword}
                    confirmType="search"
                    onInput={(event) => setGoodsKeyword(event.detail.value)}
                    onConfirm={() => searchGoods()}
                  />
                  <Button className="btn btn-ghost scan-btn" onClick={() => searchGoods()}>
                    搜索
                  </Button>
                </View>
                {goodsResults.map((product) => (
                  <View key={product.id} className="search-item" onClick={() => addGoodsItem(product.id)}>
                    <Text>{product.name}</Text>
                    <Text className="muted">{product.sku_count} 版本</Text>
                  </View>
                ))}
                {goodsItems.map((item, index) => (
                  <View key={index} className="goods-item">
                    <View className="row-between">
                      <Text>{item.productName}</Text>
                      <Text
                        className="danger-text"
                        onClick={() => setGoodsItems((previous) => previous.filter((_, i) => i !== index))}
                      >
                        删除
                      </Text>
                    </View>
                    <View className="field-row">
                      <Input className="input quarter" type="digit" placeholder="数量" value={item.qty} onInput={(event) => updateGoodsItem(index, { qty: event.detail.value })} />
                      <Input className="input quarter" placeholder="单位" value={item.unit_name} onInput={(event) => updateGoodsItem(index, { unit_name: event.detail.value })} />
                      <Input className="input quarter" type="number" placeholder="换算" value={item.conversion} onInput={(event) => updateGoodsItem(index, { conversion: event.detail.value })} />
                      <Input className="input quarter" type="digit" placeholder="单价" value={item.unit_price} onInput={(event) => updateGoodsItem(index, { unit_price: event.detail.value })} />
                    </View>
                  </View>
                ))}
                <View className="row-between goods-total">
                  <Text className="muted">换货金额</Text>
                  <Text className="price-text">{formatFen(goodsTotal)}</Text>
                </View>
              </View>
            ) : payMethod === 'other' ? (
              <View>
                <View className="field">
                  <Text className="field-label">抵扣原因</Text>
                  <Input
                    className="input"
                    placeholder={PH.otherReason}
                    value={otherReason}
                    onInput={(event) => setOtherReason(event.detail.value)}
                  />
                </View>
                <View className="field">
                  <Text className="field-label">抵扣金额（元）</Text>
                  <Input
                    className="input"
                    type="digit"
                    value={otherAmount}
                    onInput={(event) => setOtherAmount(event.detail.value)}
                  />
                  <Text className="muted">按抵扣金额计入已收款，余款可在订单详情继续回款</Text>
                </View>
              </View>
            ) : (
              <View className="field">
                <Text className="field-label">本次收款金额（元）</Text>
                <Input
                  className="input"
                  type="digit"
                  value={payAmount}
                  onInput={(event) => {
                    setPayAmountEdited(true)
                    setPayAmount(event.detail.value)
                  }}
                />
                <Text className="muted">
                  可分多次收款，余款在订单详情里继续记录
                </Text>
              </View>
            )}
            {payMethod !== 'other' && (
              <View className="field">
                <Text className="field-label">备注</Text>
                <Input
                  className="input"
                  placeholder="如需记录请填写"
                  value={payNote}
                  onInput={(event) => setPayNote(event.detail.value)}
                />
              </View>
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
