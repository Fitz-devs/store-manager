const { AUTH_HINT, CONFIG_HINT, fenToYuan, yuanToFen, text, failure, patchJson } = require('../lib')

async function updateSkuPrice(args) {
  const input = args || {}
  const skuId = Number(input.sku_id)
  if (!Number.isInteger(skuId) || skuId <= 0) {
    return failure('sku_id 无效。该 ID 必须取自 searchProducts 等接口返回的原值，禁止编造。')
  }
  const reason = String(input.reason || '').trim()
  if (!reason) {
    return failure('缺少调价原因（reason）。价格变更会写入历史记录，请向用户确认原因（如「供货商涨价」「活动价结束」）后重试。')
  }

  const hasRetail = input.retail_price_yuan !== undefined && input.retail_price_yuan !== null && input.retail_price_yuan !== ''
  const hasFriend = input.friend_price_yuan !== undefined && input.friend_price_yuan !== null && input.friend_price_yuan !== ''
  if (!hasRetail && !hasFriend) {
    return failure('未提供任何要修改的价格。请向用户确认要把零售价还是友情价改成多少。')
  }

  const body = { reason: reason.slice(0, 100) }
  if (hasRetail) {
    const fen = yuanToFen(input.retail_price_yuan)
    if (fen === null || fen < 0) {
      return failure('零售价无效，请向用户确认数字。')
    }
    body.retail_price = fen
  }
  if (hasFriend) {
    const friendRaw = input.friend_price_yuan
    if (friendRaw === 'null' || String(friendRaw).trim() === '') {
      body.friend_price = null
    } else {
      const fen = yuanToFen(friendRaw)
      if (fen === null || fen < 0) {
        return failure('友情价无效，请向用户确认数字。')
      }
      body.friend_price = fen
    }
  }

  const result = await patchJson('/api/skus/' + skuId, body)
  if (result.failure === 'AUTH') return failure(AUTH_HINT)
  if (result.failure === 'CONFIG') return failure(CONFIG_HINT)
  if (result.failure || !result.data) {
    return failure('改价失败：' + (result.failure || '服务端未返回数据') + '。请如实告知用户后重试。')
  }

  const sku = result.data
  return {
    isError: false,
    content: text(
      '已按用户确认修改规格（ID ' + skuId + '）价格：零售价 ' + fenToYuan(sku.retail_price) + ' 元' +
        (sku.friend_price !== null && sku.friend_price !== undefined ? '，友情价 ' + fenToYuan(sku.friend_price) + ' 元' : '') +
        '，原因「' + reason + '」已写入价格历史。请把结果告知用户。',
    ),
    structuredContent: {
      sku_id: skuId,
      retail_price_yuan: fenToYuan(sku.retail_price),
      friend_price_yuan: sku.friend_price === null || sku.friend_price === undefined ? '' : fenToYuan(sku.friend_price),
      reason,
    },
  }
}

module.exports = updateSkuPrice
