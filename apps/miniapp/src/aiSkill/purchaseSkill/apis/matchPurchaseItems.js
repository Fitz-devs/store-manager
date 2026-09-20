const { AUTH_HINT, fenToYuan, text, failure, postJson } = require('../lib')

function mapHit(hit) {
  const archived = hit.product_status === 'archived' || hit.sku_status === 'archived'
  return {
    sku_id: hit.sku_id,
    product_id: hit.product_id,
    product_name:
      hit.product_name +
      (hit.spec_name ? '（' + hit.spec_name + '）' : '') +
      (archived ? '【已下架】' : ''),
    spec_name: hit.spec_name || '',
    sale_unit: hit.sale_unit,
    retail_price_yuan: fenToYuan(hit.retail_price),
    latest_purchase_price_yuan: fenToYuan(hit.latest_purchase_price),
    product_status: hit.product_status || 'active',
    sku_status: hit.sku_status || 'active',
  }
}

async function matchPurchaseItems(args) {
  const rows = (args && args.rows) || []
  if (!Array.isArray(rows) || !rows.length) {
    return failure('缺少单据明细行。请先从图片提取（或 recognizePurchaseSlip 识别）品名/数量/单价，再传入本接口匹配。')
  }
  if (rows.length > 200) {
    return failure('明细行数超过 200 行上限，请让用户拆分单据。')
  }

  // 自动匹配仅商品码；未命中交给用户确认/检索，不做品名模糊扫描
  const items = []
  const notFound = []
  const prepared = []
  for (const row of rows) {
    const name = String((row && row.name) || '').trim()
    const boxCode = String((row && row.box_code) || '').trim()
    const unitCode = String((row && row.unit_code) || '').trim()
    const qty = Number(row && row.qty)
    if (!name && !boxCode && !unitCode) continue
    if (!isFinite(qty) || qty <= 0) {
      return failure('「' + (name || boxCode || unitCode) + '」的数量无效，请向用户确认后重试。')
    }
    prepared.push({
      source: {
        name: name || boxCode || unitCode,
        spec: String((row && row.spec) || ''),
        qty,
        unit: String((row && row.unit) || ''),
        unit_price_yuan: row && row.unit_price_yuan != null ? String(row.unit_price_yuan) : null,
        conversion_guess: (row && row.conversion_guess) || 1,
        box_code: boxCode,
        unit_code: unitCode,
      },
      codes: { box_code: boxCode || null, unit_code: unitCode || null },
    })
  }

  const matchResults = new Array(prepared.length)
  for (let offset = 0; offset < prepared.length; offset += 50) {
    const slice = prepared.slice(offset, offset + 50)
    const response = await postJson('/api/products/match-ocr', {
      rows: slice.map((item) => item.codes),
    })
    if (response.failure === 'AUTH') return failure(AUTH_HINT)
    if (response.failure) {
      return failure('商品匹配失败：' + response.failure + '。请稍后重试；若持续失败，可让用户在小程序内手动检索商品。')
    }
    const results = (response.data && response.data.results) || []
    results.forEach((result, i) => {
      matchResults[offset + i] = result
    })
  }

  prepared.forEach((item, i) => {
    const result = matchResults[i]
    const base = item.source
    if (result && result.status === 'matched' && result.hit) {
      const primary = mapHit(result.hit)
      const ambiguous = (result.candidates || []).length > 1
      const archived = primary.product_status === 'archived'
      items.push(
        Object.assign({}, base, {
          matched: true,
          ambiguous,
          archived,
          sku_id: primary.sku_id,
          product_id: primary.product_id,
          product_name: primary.product_name,
          sale_unit: primary.sale_unit,
          retail_price_yuan: primary.retail_price_yuan,
          latest_purchase_price_yuan: primary.latest_purchase_price_yuan,
          promotion: '',
          candidates: ambiguous ? result.candidates.map(mapHit) : undefined,
        }),
      )
      return
    }
    notFound.push(base.name)
    items.push(Object.assign({}, base, { matched: false, ambiguous: false }))
  })

  const parts = []
  const matchedCount = items.filter((item) => item.matched && !item.ambiguous).length
  const ambiguousCount = items.filter((item) => item.ambiguous).length
  const archivedCount = items.filter((item) => item.matched && item.archived).length
  if (matchedCount) parts.push('已按商品码匹配 ' + matchedCount + ' 行。')
  if (archivedCount) {
    parts.push(
      archivedCount +
        ' 行命中的是【已下架】商品（商品列表默认不显示）。入库前请先让用户在商品编辑里上架，或改用其他在售规格；不要当作正常在售商品直接入库。',
    )
  }
  if (ambiguousCount) {
    parts.push(ambiguousCount + ' 行同码多规格（ambiguous），请让用户确认规格后再入库。')
  }
  if (notFound.length) {
    parts.push(
      '商品码未命中：' +
        notFound.join('、') +
        '。自动匹配只认店内商品码，不做品名模糊搜索。请引导用户在小程序商品页检索确认；确认要建档时，先向用户复述明细并获明确同意后再调用 productSkill 的 createProductsFromSlip，禁止编造 sku_id。',
    )
  }
  parts.push(
    '确认无误且用户明确同意后，调用 submitPurchase 完成入库（提交前必须把明细/金额完整复述给用户）；单据单价用图片上的数字，库内价仅作对照提醒。',
  )

  return {
    isError: false,
    content: text(parts.join('')),
    structuredContent: { items, not_found: notFound, total: items.length },
  }
}

module.exports = matchPurchaseItems
