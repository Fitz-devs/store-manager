const { AUTH_HINT, CONFIG_HINT, fenToYuan, text, failure, callApi, promoText } = require('../lib')

async function matchProducts(args) {
  const keywords = (args && args.keywords) || []
  if (!Array.isArray(keywords) || !keywords.length) {
    return failure('缺少商品关键词列表。请从用户的话里提取品名数组（如 ["金典", "安慕希"]）再调用本接口。')
  }

  const names = []
  const seen = new Set()
  for (const raw of keywords.slice(0, 20)) {
    const keyword = String(raw).trim()
    if (keyword && !seen.has(keyword)) {
      seen.add(keyword)
      names.push(keyword)
    }
  }
  if (!names.length) {
    return failure('关键词列表为空，请从用户的话里提取具体品名再调用。')
  }

  const items = []
  const notFound = []
  for (const keyword of names) {
    const list = await callApi(
      '/api/products?q=' + encodeURIComponent(keyword) + '&page_size=3&status=active',
    )
    if (list.failure === 'AUTH') return failure(AUTH_HINT)
    if (list.failure === 'CONFIG') return failure(CONFIG_HINT)
    if (list.failure) return failure('匹配商品失败：' + list.failure + '。请如实告知用户，稍后重试。')

    const products = (list.data && list.data.items) || []
    if (!products.length) {
      notFound.push(keyword)
      continue
    }

    const keywordSkus = []
    for (const product of products) {
      const detail = await callApi('/api/products/' + product.id)
      if (detail.failure === 'AUTH') return failure(AUTH_HINT)
      if (detail.failure || !detail.data) continue
      const name = detail.data.product ? detail.data.product.name : product.name
      for (const sku of detail.data.skus || []) {
        if (sku.status !== 'active') continue
        const candidate = {
          matched_keyword: keyword,
          sku_id: sku.id,
          product_id: product.id,
          product_name: name + (sku.spec_name ? '（' + sku.spec_name + '）' : ''),
          sale_unit: sku.sale_unit,
          retail_price_yuan: fenToYuan(sku.retail_price),
          promotion: promoText(sku.promotions),
          out_of_stock: sku.stock_status === 'out_of_stock',
          pagePath: 'pages/product-detail/index?id=' + product.id,
        }
        keywordSkus.push(candidate)
        items.push(candidate)
      }
    }
    const ambiguous = products.length > 1 || keywordSkus.length > 1
    for (const candidate of keywordSkus) candidate.ambiguous = ambiguous
  }

  const parts = []
  if (items.length) {
    parts.push('已匹配到 ' + items.length + ' 个候选规格' + (notFound.length ? '；' : '。'))
  }
  if (notFound.length) {
    parts.push('未匹配到：' + notFound.join('、') + '。请先告诉用户这些品名在店内没有找到，向用户确认后可换关键词重查，或经用户明确同意后调用 productSkill 的 createProduct 建档，也可引导到小程序手动建档。')
  }
  if (items.length) {
    parts.push('歧义项（ambiguous 为 true）请让用户确认具体规格和价格后再下单；缺货商品要提醒用户。把候选结果如实展示给用户确认，不要替用户拍板。确认明细与收款方式后，复述完整订单信息，用户明确同意再调用 submitOrder 直接提交。')
  }
  if (!items.length && !notFound.length) {
    parts.push('没有可用结果，请向用户确认品名后重试。')
  }

  return {
    isError: false,
    content: text(parts.join('')),
    structuredContent: { items, not_found: notFound, total: items.length },
  }
}

module.exports = matchProducts
