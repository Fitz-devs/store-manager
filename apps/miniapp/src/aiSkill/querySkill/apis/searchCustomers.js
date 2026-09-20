const { AUTH_HINT, CONFIG_HINT, fenToYuan, text, failure, callApi } = require('../lib')

async function searchCustomers(args) {
  const keyword = String((args && args.keyword) || '').trim()
  const limit = Math.min(Math.max(Number(args && args.limit) || 5, 1), 10)
  if (!keyword) {
    return failure('缺少客户关键词，请先向用户确认要查的客户名称、电话或地址。')
  }

  const list = await callApi(
    '/api/customers?q=' + encodeURIComponent(keyword) + '&page_size=' + limit,
  )
  if (list.failure === 'AUTH') return failure(AUTH_HINT)
  if (list.failure === 'CONFIG') return failure(CONFIG_HINT)
  if (list.failure) return failure('查询客户失败：' + list.failure + '。请如实告知用户，稍后重试。')

  const customers = (list.data && list.data.items) || []
  if (!customers.length) {
    return {
      isError: false,
      content: text(
        '没有找到与「' + keyword + '」相关的客户。请先告诉用户未找到，建议换关键词再查；不要用相同关键词重复调用本接口。',
      ),
      structuredContent: { items: [], total: 0 },
    }
  }

  const items = customers.map((customer) => ({
    customer_id: customer.id,
    name: customer.name,
    phone: customer.phone || '',
    unpaid_amount_yuan: fenToYuan(customer.unpaid_amount) || '0.00',
    order_count: customer.order_count,
    pagePath: 'pages/customer-detail/index?id=' + customer.id,
  }))

  return {
    isError: false,
    content: text(
      '已查到 ' + items.length + ' 个相关客户。请把客户名称、电话、欠款金额如实告诉用户；用户需要看详情时引用对应链接。',
    ),
    structuredContent: { items, total: items.length },
  }
}

module.exports = searchCustomers
