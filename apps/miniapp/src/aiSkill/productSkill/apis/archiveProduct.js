const { AUTH_HINT, CONFIG_HINT, text, failure, patchJson } = require('../lib')

async function archiveProduct(args) {
  const input = args || {}
  const productId = Number(input.product_id)
  if (!Number.isInteger(productId) || productId <= 0) {
    return failure('product_id 无效。该 ID 必须取自 searchProducts 等接口返回的原值，禁止编造。')
  }

  const result = await patchJson('/api/products/' + productId, { status: 'archived' })
  if (result.failure === 'AUTH') return failure(AUTH_HINT)
  if (result.failure === 'CONFIG') return failure(CONFIG_HINT)
  if (result.failure) {
    return failure('下架失败：' + result.failure + '。请如实告知用户后重试。')
  }

  return {
    isError: false,
    content: text(
      '已按用户确认下架商品（ID ' + productId + '），历史单据不受影响，可在商品管理中重新上架。请把结果告知用户。' +
        '下架仅停止出现在默认商品列表，数据不会删除。',
    ),
    structuredContent: { product_id: productId, status: 'archived' },
  }
}

module.exports = archiveProduct
