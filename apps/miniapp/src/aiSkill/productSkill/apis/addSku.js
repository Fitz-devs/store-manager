const { AUTH_HINT, CONFIG_HINT, fenToYuan, yuanToFen, text, failure, postJson } = require('../lib')

async function addSku(args) {
  const input = args || {}
  const productId = Number(input.product_id)
  if (!Number.isInteger(productId) || productId <= 0) {
    return failure('product_id 无效。该 ID 必须取自 searchProducts 或建档接口返回的原值，禁止编造。')
  }

  const body = {
    sale_unit: String(input.sale_unit || '件').trim().slice(0, 10) || '件',
    retail_price: 0,
  }
  if (input.spec_name) body.spec_name = String(input.spec_name).trim().slice(0, 50)
  if (input.retail_price_yuan !== undefined && input.retail_price_yuan !== null && input.retail_price_yuan !== '') {
    const fen = yuanToFen(input.retail_price_yuan)
    if (fen === null || fen < 0) {
      return failure('零售价无效，请向用户确认数字。')
    }
    body.retail_price = fen
  }
  if (input.friend_price_yuan !== undefined && input.friend_price_yuan !== null && input.friend_price_yuan !== '') {
    const fen = yuanToFen(input.friend_price_yuan)
    if (fen === null || fen < 0) {
      return failure('友情价无效，请向用户确认数字。')
    }
    body.friend_price = fen
  }

  const result = await postJson('/api/products/' + productId + '/skus', body)
  if (result.failure === 'AUTH') return failure(AUTH_HINT)
  if (result.failure === 'CONFIG') return failure(CONFIG_HINT)
  if (result.failure || !result.data) {
    return failure('新增规格失败：' + (result.failure || '服务端未返回数据') + '。请如实告知用户后重试。')
  }

  const sku = result.data
  return {
    isError: false,
    content: text(
      '已按用户确认为商品（ID ' + productId + '）新增规格：' +
        (sku.spec_name || '默认') + '，单位 ' + sku.sale_unit + '，零售价 ' + fenToYuan(sku.retail_price) + ' 元。' +
        '请把结果告知用户；新规格 ID 为 ' + sku.id + '。',
    ),
    structuredContent: {
      product_id: productId,
      sku_id: sku.id,
      spec_name: sku.spec_name || '',
      sale_unit: sku.sale_unit,
      retail_price_yuan: fenToYuan(sku.retail_price),
      friend_price_yuan: fenToYuan(sku.friend_price),
      pagePath: 'pages/product-detail/index?id=' + productId,
      linkText: '查看商品详情',
    },
  }
}

module.exports = addSku
