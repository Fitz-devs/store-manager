const { AUTH_HINT, CONFIG_HINT, fenToYuan, text, failure, callApi } = require('../lib')

const STATUS_LABELS = { open: '进行中', void: '已作废' }
const DELIVERY_LABELS = { none: '无需配送', pending: '待送货', delivered: '已送达' }

function formatLocalTime(iso) {
  const date = new Date(iso)
  if (isNaN(date.getTime())) return String(iso || '')
  const pad = (n) => (n < 10 ? '0' + n : '' + n)
  return (
    date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) +
    ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes())
  )
}

async function queryOrders(args) {
  const input = args || {}
  const params = []
  if (input.q) params.push('q=' + encodeURIComponent(String(input.q).trim()))
  if (input.status && input.status !== 'all') params.push('status=' + String(input.status))
  if (input.delivery_status) params.push('delivery_status=' + String(input.delivery_status))
  if (input.only_unpaid) params.push('only_unpaid=true')
  if (input.from) params.push('from=' + encodeURIComponent(String(input.from)))
  if (input.to) params.push('to=' + encodeURIComponent(String(input.to)))
  const limit = Math.min(Math.max(Number(input.limit) || 10, 1), 20)
  params.push('page_size=' + limit)

  const list = await callApi('/api/orders?' + params.join('&'))
  if (list.failure === 'AUTH') return failure(AUTH_HINT)
  if (list.failure === 'CONFIG') return failure(CONFIG_HINT)
  if (list.failure) return failure('查询订单失败：' + list.failure + '。请如实告知用户，稍后重试。')

  const orders = (list.data && list.data.items) || []
  if (!orders.length) {
    return {
      isError: false,
      content: text(
        '没有符合条件的订单。请先告诉用户未找到，可以放宽条件（如去掉日期或状态筛选）再查；不要原样重复调用本接口。',
      ),
      structuredContent: { items: [], total: 0 },
    }
  }

  const items = orders.map((order) => ({
    order_id: order.id,
    order_no: order.order_no,
    customer_name: order.customer_name || '散客',
    total_yuan: fenToYuan(order.total) || '0.00',
    paid_amount_yuan: fenToYuan(order.paid_amount) || '0.00',
    status: STATUS_LABELS[order.status] || order.status,
    delivery_status: DELIVERY_LABELS[order.delivery_status] || order.delivery_status,
    created_at: formatLocalTime(order.created_at),
    pagePath: 'pages/order-detail/index?id=' + order.id,
  }))

  return {
    isError: false,
    content: text(
      '已查到 ' + items.length + ' 条订单。请按订单号、客户、金额、状态、送货状态如实转述；用户需要看详情时引用对应链接。',
    ),
    structuredContent: { items, total: items.length },
  }
}

module.exports = queryOrders
