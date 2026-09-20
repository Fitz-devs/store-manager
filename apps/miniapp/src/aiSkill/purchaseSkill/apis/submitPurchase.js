const { AUTH_HINT, CONFIG_HINT, fenToYuan, yuanToFen, text, failure, callApi, postJson, uploadPurchaseImage } = require('../lib')

function todayLocal() {
  const d = new Date()
  const pad = (n) => (n < 10 ? '0' + n : '' + n)
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
}

async function submitPurchase(args) {
  const input = args || {}
  const rawItems = Array.isArray(input.items) ? input.items : []
  if (!rawItems.length) {
    return failure('缺少入库明细。请先调用 matchPurchaseItems 匹配商品，并在向用户复述明细、获得明确同意后再调用本接口提交入库。')
  }
  if (rawItems.length > 200) {
    return failure('明细行数超过 200 行上限，请让用户拆分单据。')
  }

  const items = []
  for (const raw of rawItems) {
    const skuId = Number(raw && raw.sku_id)
    const productId = Number(raw && raw.product_id)
    const qty = Number(raw && raw.qty)
    if (!Number.isInteger(skuId) || skuId <= 0 || !Number.isInteger(productId) || productId <= 0) {
      return failure('明细中有无效的 sku_id 或 product_id。这两个 ID 必须取自 matchPurchaseItems 或建档接口的返回原值，禁止编造。')
    }
    if (!isFinite(qty) || qty <= 0) {
      return failure('明细中有无效数量，请向用户确认「' + (raw && raw.sku_id) + '」的入库数量。')
    }
    const conversion = raw && raw.conversion !== undefined && raw.conversion !== null ? Number(raw.conversion) : 1
    if (!Number.isInteger(conversion) || conversion < 1 || conversion > 100000) {
      return failure('明细中 conversion 无效（应为 1-100000 的整数）。不确定时省略该字段按 1 处理。')
    }

    const detail = await callApi('/api/products/' + productId)
    if (detail.failure === 'AUTH') return failure(AUTH_HINT)
    if (detail.failure === 'CONFIG') return failure(CONFIG_HINT)
    if (detail.failure || !detail.data) {
      return failure('读取商品（product_id=' + productId + '）失败：' + (detail.failure || '商品不存在') + '。请重新调用 matchPurchaseItems 获取有效候选。')
    }
    const sku = (detail.data.skus || []).find(
      (candidate) => candidate.id === skuId && candidate.status === 'active',
    )
    if (!sku) {
      return failure('规格（sku_id=' + skuId + '）不存在或已下架。请重新调用 matchPurchaseItems 获取有效候选，不要沿用旧 ID。')
    }

    let unitPriceFen = null
    if (raw.unit_price_yuan !== undefined && raw.unit_price_yuan !== null && raw.unit_price_yuan !== '') {
      unitPriceFen = yuanToFen(raw.unit_price_yuan)
      if (unitPriceFen === null || unitPriceFen < 0) {
        return failure('「' + (detail.data.product ? detail.data.product.name : skuId) + '」的单价无效，请向用户确认单据上的进价数字。')
      }
    } else if (sku.latest_purchase_price !== null && sku.latest_purchase_price !== undefined) {
      unitPriceFen = Number(sku.latest_purchase_price) * conversion
    } else {
      unitPriceFen = Number(sku.retail_price) * conversion
    }

    const unitName = String((raw && raw.unit_name) || sku.sale_unit || '件').trim().slice(0, 10)
    const name = detail.data.product ? detail.data.product.name : ''
    items.push({
      sku_id: skuId,
      unit_name: unitName,
      conversion,
      qty,
      unit_price: unitPriceFen,
      displayName: name + (sku.spec_name ? '（' + sku.spec_name + '）' : ''),
      amountFen: Math.round(unitPriceFen * qty),
    })
  }

  // 同 sku 合并（进X送X：搭赠行可用 unit_price_yuan=0；不落库字段，只摊进货价）
  const blendMap = new Map()
  for (const item of items) {
    const prev = blendMap.get(item.sku_id)
    if (!prev) {
      blendMap.set(item.sku_id, { ...item })
    } else {
      const qty = prev.qty + item.qty
      const amountFen = prev.amountFen + item.amountFen
      blendMap.set(item.sku_id, {
        ...prev,
        qty,
        amountFen,
        unit_price: qty > 0 ? Math.round(amountFen / qty) : prev.unit_price,
      })
    }
  }
  const blendedItems = [...blendMap.values()]

  const supplierName = String((input && input.supplier_name) || '').trim().slice(0, 50) || null
  let orderedAt = String((input && input.ordered_at) || '').trim().slice(0, 40)
  if (!orderedAt) orderedAt = todayLocal()
  const note = input && input.note ? String(input.note).trim().slice(0, 500) : null

  const imageKeys = []
  let imageUploadWarn = null
  const rawImagePath = typeof input.imagePath === 'string' ? input.imagePath.trim() : ''
  if (rawImagePath && /^\{\{[^}]+\}\}$/.test(rawImagePath)) {
    imageUploadWarn = '本次入库未携带单据照片（对话图片未被系统注入），你可以在「入库详情页」点「补充上传照片」补传：'
  } else if (rawImagePath) {
    const uploaded = await uploadPurchaseImage(rawImagePath)
    if (uploaded.failure === 'AUTH') return failure(AUTH_HINT)
    if (uploaded.failure === 'CONFIG') return failure(CONFIG_HINT)
    if (uploaded.failure || !uploaded.data || !uploaded.data.key) {
      imageUploadWarn = '本次入库未携带单据照片，你可以在「入库详情页」点「补充上传照片」补传：'
    } else {
      imageKeys.push(uploaded.data.key)
    }
  }
  if (Array.isArray(input.image_keys) && input.image_keys.length) {
    for (const key of input.image_keys) {
      const normalized = String(key || '').trim().slice(0, 300)
      if (normalized && imageKeys.indexOf(normalized) < 0) imageKeys.push(normalized)
      if (imageKeys.length >= 10) break
    }
  }

  const body = {
    supplier_name: supplierName,
    ordered_at: orderedAt,
    note,
    items: blendedItems.map((item) => ({
      sku_id: item.sku_id,
      unit_name: item.unit_name,
      conversion: item.conversion,
      qty: item.qty,
      unit_price: item.unit_price,
    })),
  }
  if (imageKeys.length) body.image_keys = imageKeys
  if (input.ocr_raw) body.ocr_raw = String(input.ocr_raw).slice(0, 500000)

  const result = await postJson('/api/purchases', body)
  if (result.failure === 'AUTH') return failure(AUTH_HINT)
  if (result.failure === 'CONFIG') return failure(CONFIG_HINT)
  if (result.failure || !result.data) {
    return failure('入库提交失败：' + (result.failure || '服务端未返回数据') + '。请如实告知用户，核对明细后重试。')
  }

  const purchase = result.data
  const subtotalFen = blendedItems.reduce((sum, item) => sum + item.amountFen, 0)
  const purchaseId = purchase.id
  const purchaseNo = purchase.purchase_no || ''
  const lines = blendedItems.map((item) => ({
    name: item.displayName,
    qty: item.qty,
    unit: item.unit_name,
    price_yuan: fenToYuan(item.unit_price),
    amount_yuan: fenToYuan(item.amountFen),
  }))

  return {
    isError: false,
    content: text(
      '入库已完成：单号 ' + purchaseNo + '，' +
        (supplierName ? '供应商「' + supplierName + '」' : '未填供应商') +
        '，日期 ' + orderedAt + '，共 ' + blendedItems.length + ' 行，合计 ' + fenToYuan(subtotalFen) + ' 元。' +
        (blendedItems.length < items.length ? '相同商品的数量与金额已合并，进货价为摊后单价。' : '') +
        '请把入库结果（单号、明细、金额）如实告知用户；用户要查看详情时引用链接。' +
        (imageUploadWarn ? '「' + imageUploadWarn + '」' : ''),
    ),
    structuredContent: {
      status: 'submitted',
      purchase_id: purchaseId,
      purchase_no: purchaseNo,
      supplier_name: supplierName || '',
      ordered_at: orderedAt,
      line_count: blendedItems.length,
      subtotal_yuan: fenToYuan(subtotalFen),
      lines,
      purchaseDetailPath: 'pages/purchase-detail/index?id=' + purchaseId,
      linkText: '查看入库单',
    },
  }
}

module.exports = submitPurchase
