const { AUTH_HINT, CONFIG_HINT, fenToYuan, yuanToFen, text, failure, callApi, postJson } = require('../lib')

const PAY_METHODS = { cash: '现金', wechat: '微信', alipay: '支付宝', other: '其他' }

async function submitOrder(args) {
  const input = args || {}
  const rawItems = Array.isArray(input.items) ? input.items : []
  if (!rawItems.length) {
    return failure('缺少订单明细。请先调用 matchProducts 匹配商品，并在向用户复述明细、金额、收款方式、获得明确同意后再调用本接口提交订单。')
  }
  if (rawItems.length > 200) {
    return failure('明细行数超过 200 行上限，请让用户拆单。')
  }

  const items = []
  for (const raw of rawItems) {
    const skuId = Number(raw && raw.sku_id)
    const productId = Number(raw && raw.product_id)
    const qty = Number(raw && raw.qty)
    if (!Number.isInteger(skuId) || skuId <= 0 || !Number.isInteger(productId) || productId <= 0) {
      return failure('明细中有无效的 sku_id 或 product_id。这两个 ID 必须取自 matchProducts 返回的原值，禁止编造。')
    }
    if (!isFinite(qty) || qty <= 0) {
      return failure('明细中有无效数量，请向用户确认「' + (raw && raw.sku_id) + '」的购买数量。')
    }

    const detail = await callApi('/api/products/' + productId)
    if (detail.failure === 'AUTH') return failure(AUTH_HINT)
    if (detail.failure === 'CONFIG') return failure(CONFIG_HINT)
    if (detail.failure || !detail.data) {
      return failure('读取商品（product_id=' + productId + '）失败：' + (detail.failure || '商品不存在') + '。请重新调用 matchProducts 获取有效候选。')
    }
    const sku = (detail.data.skus || []).find(
      (candidate) => candidate.id === skuId && candidate.status === 'active',
    )
    if (!sku) {
      return failure('规格（sku_id=' + skuId + '）不存在或已下架。请重新调用 matchProducts 获取有效候选，不要沿用旧 ID。')
    }

    let unitPriceFen
    if (raw.unit_price_yuan !== undefined && raw.unit_price_yuan !== null && raw.unit_price_yuan !== '') {
      unitPriceFen = yuanToFen(raw.unit_price_yuan)
      if (unitPriceFen === null || unitPriceFen < 0) {
        return failure('「' + (detail.data.product ? detail.data.product.name : skuId) + '」的单价无效，请向用户确认。')
      }
    } else {
      unitPriceFen = Number(sku.retail_price)
    }

    const name = detail.data.product ? detail.data.product.name : ''
    const promo = (sku.promotions && sku.promotions.length)
      ? sku.promotions.map((p) => p.content).join('；')
      : null
    items.push({
      sku_id: skuId,
      unit_name: String((raw && raw.unit_name) || sku.sale_unit || '件').trim().slice(0, 10),
      conversion: 1,
      qty,
      unit_price: unitPriceFen,
      promotion_text: promo,
      displayName: name + (sku.spec_name ? '（' + sku.spec_name + '）' : ''),
      amountFen: Math.round(unitPriceFen * qty),
    })
  }

  let customerId = null
  let customerName = null
  if (input.customer_id !== undefined && input.customer_id !== null) {
    customerId = Number(input.customer_id)
    if (!Number.isInteger(customerId) || customerId <= 0) {
      return failure('customer_id 无效。该 ID 必须取自 matchCustomers 返回的原值；用户没提客户时省略本字段（散客）。')
    }
    const found = await callApi('/api/customers/' + customerId)
    if (found.failure === 'AUTH') return failure(AUTH_HINT)
    if (found.failure || !found.data) {
      return failure('客户（customer_id=' + customerId + '）不存在。请重新调用 matchCustomers 确认客户。')
    }
    customerName = found.data.name
  }

  let discountFen = 0
  if (input.discount_yuan !== undefined && input.discount_yuan !== null && input.discount_yuan !== '') {
    discountFen = yuanToFen(input.discount_yuan)
    if (discountFen === null || discountFen < 0) {
      return failure('优惠金额无效，请向用户确认。')
    }
  }

  const payments = []
  if (Array.isArray(input.payments) && input.payments.length) {
    for (const payment of input.payments) {
      const method = String((payment && payment.method) || '')
      if (!PAY_METHODS[method]) {
        return failure('收款方式无效：只能是 cash/wechat/alipay/other（现金/微信/支付宝/其他）。请向用户确认。')
      }
      const amountFen = yuanToFen(payment.amount_yuan)
      if (amountFen === null || amountFen <= 0) {
        return failure('收款金额无效，请向用户确认每笔收款数字。')
      }
      payments.push({
        method,
        amount: amountFen,
        note: payment.note ? String(payment.note).trim().slice(0, 200) : null,
        photo_key: null,
      })
    }
  }

  const isCredit = input.is_credit === true || (input.is_credit !== false && payments.length === 0)
  const subtotalFen = items.reduce((sum, item) => sum + item.amountFen, 0)
  const totalFen = Math.max(subtotalFen - discountFen, 0)
  const paidFen = payments.reduce((sum, payment) => sum + payment.amount, 0)
  if (paidFen > totalFen) {
    return failure('收款合计 ' + fenToYuan(paidFen) + ' 元超过订单金额 ' + fenToYuan(totalFen) + ' 元，请向用户核对。')
  }

  const body = {
    customer_id: customerId,
    customer_name: customerName,
    is_credit: isCredit,
    discount: discountFen,
    items: items.map((item) => ({
      sku_id: item.sku_id,
      unit_name: item.unit_name,
      conversion: item.conversion,
      qty: item.qty,
      unit_price: item.unit_price,
      promotion_text: item.promotion_text,
    })),
  }
  if (payments.length) body.payments = payments
  if (input.delivery && (input.delivery.address || input.delivery.required)) {
    const delivery = input.delivery
    body.delivery = {
      required: true,
      address: delivery.address ? String(delivery.address).trim().slice(0, 200) : null,
      contact: delivery.contact ? String(delivery.contact).trim().slice(0, 50) : null,
      phone: delivery.phone ? String(delivery.phone).trim().slice(0, 30) : null,
      at: delivery.at ? String(delivery.at).trim().slice(0, 40) : null,
    }
  }
  if (input.note) body.note = String(input.note).trim().slice(0, 500)

  const result = await postJson('/api/orders', body)
  if (result.failure === 'AUTH') return failure(AUTH_HINT)
  if (result.failure === 'CONFIG') return failure(CONFIG_HINT)
  if (result.failure || !result.data) {
    return failure('下单失败：' + (result.failure || '服务端未返回数据') + '。请如实告知用户，核对明细后重试。')
  }

  const order = result.data
  const orderId = order.id
  const orderNo = order.order_no || ''
  const lines = items.map((item) => ({
    name: item.displayName,
    qty: item.qty,
    unit: item.unit_name,
    price_yuan: fenToYuan(item.unit_price),
    amount_yuan: fenToYuan(item.amountFen),
  }))
  const payText = payments.length
    ? payments.map((p) => PAY_METHODS[p.method] + ' ' + fenToYuan(p.amount) + ' 元').join('、')
    : (isCredit ? '未付款' : '未填收款')

  return {
    isError: false,
    content: text(
      '订单已提交：单号 ' + orderNo + '，' +
        (customerName ? '客户「' + customerName + '」' : '散客') +
        '，共 ' + items.length + ' 行，合计 ' + fenToYuan(totalFen) + ' 元' +
        (discountFen ? '（已优惠 ' + fenToYuan(discountFen) + ' 元）' : '') +
        '，收款：' + payText + '。' +
        '请把下单结果（单号、明细、金额、收款）如实告知用户；用户要查看详情时引用链接。',
    ),
    structuredContent: {
      status: 'submitted',
      order_id: orderId,
      order_no: orderNo,
      customer_name: customerName || '散客',
      line_count: items.length,
      total_yuan: fenToYuan(totalFen),
      paid_yuan: fenToYuan(paidFen),
      is_credit: isCredit,
      lines,
      orderDetailPath: 'pages/order-detail/index?id=' + orderId,
      linkText: '查看订单',
    },
  }
}

module.exports = submitOrder
