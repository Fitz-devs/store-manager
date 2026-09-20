const { AUTH_HINT, CONFIG_HINT, fenToYuan, text, failure, callApi, promoText } = require('../lib')

async function searchProducts(args) {
  const keyword = String((args && args.keyword) || '').trim()
  const limit = Math.min(Math.max(Number(args && args.limit) || 5, 1), 10)
  if (!keyword) {
    return failure('缺少商品关键词，请先向用户确认要查的商品名称、别名或品牌。')
  }

  const list = await callApi(
    '/api/products?q=' + encodeURIComponent(keyword) + '&page_size=' + limit + '&status=active',
  )
  if (list.failure === 'AUTH') return failure(AUTH_HINT)
  if (list.failure === 'CONFIG') return failure(CONFIG_HINT)
  if (list.failure) return failure('查询商品失败：' + list.failure + '。请如实告知用户，稍后重试。')

  const products = (list.data && list.data.items) || []
  if (!products.length) {
    return {
      isError: false,
      content: text(
        '店内没有找到与「' + keyword + '」相关的商品。请先告诉用户未找到，建议换关键词再查，或提示到小程序「首页」手动建档；不要用相同关键词重复调用本接口。',
      ),
      structuredContent: { items: [], total: 0 },
    }
  }

  const items = []
  for (const product of products) {
    const detail = await callApi('/api/products/' + product.id)
    if (detail.failure === 'AUTH') return failure(AUTH_HINT)
    if (detail.failure || !detail.data) continue
    const name = detail.data.product ? detail.data.product.name : product.name
    for (const sku of detail.data.skus || []) {
      if (sku.status !== 'active') continue
      items.push({
        sku_id: sku.id,
        product_id: product.id,
        name: name + (sku.spec_name ? '（' + sku.spec_name + '）' : ''),
        sale_unit: sku.sale_unit,
        retail_price_yuan: fenToYuan(sku.retail_price),
        promotion: promoText(sku.promotions),
        out_of_stock: sku.stock_status === 'out_of_stock',
        pagePath: 'pages/product-detail/index?id=' + product.id,
      })
    }
  }

  if (!items.length) {
    return {
      isError: false,
      content: text(
        '「' + keyword + '」相关商品均已下架或无可用规格。请如实告知用户，建议到小程序检查商品状态。',
      ),
      structuredContent: { items: [], total: 0 },
    }
  }

  return {
    isError: false,
    content: text(
      '已查到 ' + items.length + ' 条「' + keyword + '」相关规格。请把名称、零售价、单位如实告诉用户，有优惠或缺货要一并提醒；用户需要看详情时引用对应链接。',
    ),
    structuredContent: { items, total: items.length },
  }
}

module.exports = searchProducts
