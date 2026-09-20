const { AUTH_HINT, CONFIG_HINT, text, failure, postJson } = require('../lib')

const STATUS_LABELS = { in_stock: '在售', out_of_stock: '缺货' }

async function setSkuStockStatus(args) {
  const input = args || {}
  const skuId = Number(input.sku_id)
  const status = String(input.status || '')
  if (!Number.isInteger(skuId) || skuId <= 0) {
    return failure('sku_id 无效。该 ID 必须取自 searchProducts 等接口返回的原值，禁止编造。')
  }
  if (status !== 'in_stock' && status !== 'out_of_stock') {
    return failure('status 无效：只能是 in_stock（在售）或 out_of_stock（缺货）。请向用户确认后再调用。')
  }

  const result = await postJson('/api/skus/' + skuId + '/stock-status', { status })
  if (result.failure === 'AUTH') return failure(AUTH_HINT)
  if (result.failure === 'CONFIG') return failure(CONFIG_HINT)
  if (result.failure || !result.data) {
    return failure('修改库存标记失败：' + (result.failure || '服务端未返回数据') + '。请如实告知用户后重试。')
  }

  return {
    isError: false,
    content: text(
      '已按用户确认将规格（ID ' + skuId + '）标记为「' + STATUS_LABELS[status] + '」。请把结果告知用户。',
    ),
    structuredContent: { sku_id: skuId, status, status_label: STATUS_LABELS[status] },
  }
}

module.exports = setSkuStockStatus
