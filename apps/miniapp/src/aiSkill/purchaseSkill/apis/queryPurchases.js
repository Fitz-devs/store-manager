const { AUTH_HINT, CONFIG_HINT, fenToYuan, text, failure, callApi } = require('../lib')

async function queryPurchases(args) {
  const input = args || {}
  const params = []
  if (input.q) params.push('q=' + encodeURIComponent(String(input.q).trim()))
  if (input.from) params.push('from=' + encodeURIComponent(String(input.from)))
  if (input.to) params.push('to=' + encodeURIComponent(String(input.to)))
  const limit = Math.min(Math.max(Number(input.limit) || 10, 1), 20)
  params.push('page_size=' + limit)

  const list = await callApi('/api/purchases?' + params.join('&'))
  if (list.failure === 'AUTH') return failure(AUTH_HINT)
  if (list.failure === 'CONFIG') return failure(CONFIG_HINT)
  if (list.failure) {
    return failure('查询入库单失败：' + list.failure + '。请如实告知用户，稍后重试。')
  }

  const purchases = (list.data && list.data.items) || []
  if (!purchases.length) {
    return {
      isError: false,
      content: text(
        '没有找到符合条件的入库单。请先告诉用户未找到，确认单号后重查（入库单号是纯数字，如 260919-0011；订单号以 O 开头，查订单请用 queryOrders）；不要用相同条件重复调用本接口。',
      ),
      structuredContent: { items: [], total: 0 },
    }
  }

  const items = purchases.map((purchase) => {
    let imageCount = 0
    try {
      const keys = purchase.image_keys ? JSON.parse(purchase.image_keys) : []
      imageCount = Array.isArray(keys) ? keys.length : 0
    } catch {
      imageCount = 0
    }
    return {
      purchase_id: purchase.id,
      purchase_no: purchase.purchase_no,
      supplier_name: purchase.supplier_name || '',
      total_yuan: fenToYuan(purchase.total_amount) || '0.00',
      ordered_at: String(purchase.ordered_at || '').slice(0, 10),
      image_count: imageCount,
      pagePath: 'pages/purchase-detail/index?id=' + purchase.id,
    }
  })

  return {
    isError: false,
    content: text(
      '已查到 ' + items.length + ' 张入库单。请把单号、供应商、金额、单据照片数量如实告诉用户。' +
        '补传照片时：purchase_id 取本接口返回的 purchase_id 原值，复述确认后调用 patchPurchaseImages；用户想查看详情时引用对应链接。',
    ),
    structuredContent: { items, total: items.length },
  }
}

module.exports = queryPurchases
