const { AUTH_HINT, CONFIG_HINT, fenToYuan, yuanToFen, text, failure, postJson } = require('../lib')

async function createProduct(args) {
  const input = args || {}
  const name = String(input.name || '').trim()
  if (!name) {
    return failure('缺少商品名称。请先向用户确认要建档的商品名称。')
  }

  const sku = {
    spec_name: input.spec_name ? String(input.spec_name).trim().slice(0, 50) : null,
    sale_unit: String(input.sale_unit || '件').trim().slice(0, 10) || '件',
    retail_price: 0,
  }
  if (input.retail_price_yuan !== undefined && input.retail_price_yuan !== null && input.retail_price_yuan !== '') {
    const fen = yuanToFen(input.retail_price_yuan)
    if (fen === null || fen < 0) {
      return failure('零售价无效，请向用户确认数字。')
    }
    sku.retail_price = fen
  }
  if (input.friend_price_yuan !== undefined && input.friend_price_yuan !== null && input.friend_price_yuan !== '') {
    const fen = yuanToFen(input.friend_price_yuan)
    if (fen === null || fen < 0) {
      return failure('友情价无效，请向用户确认数字。')
    }
    sku.friend_price = fen
  }

  const body = {
    name: name.slice(0, 100),
    sku,
  }
  if (input.purchase_price_yuan !== undefined && input.purchase_price_yuan !== null && input.purchase_price_yuan !== '') {
    const fen = yuanToFen(input.purchase_price_yuan)
    if (fen === null || fen < 0) {
      return failure('进货价无效，请向用户确认数字。')
    }
    body.purchase_price = fen
  }
  if (input.barcode) {
    const code = String(input.barcode).trim()
    if (code.length >= 8 && code.length <= 64) {
      body.barcodes = [{ code, is_primary: true }]
    } else {
      return failure('条码无效（需 8-64 位）。请确认后重试，或省略条码先建档。')
    }
  }
  if (input.brand) body.brand = String(input.brand).trim().slice(0, 50)
  if (input.category) body.category = String(input.category).trim().slice(0, 50)
  if (input.notes) body.notes = String(input.notes).trim().slice(0, 500)
  if (Array.isArray(input.aliases) && input.aliases.length) {
    body.aliases = input.aliases.slice(0, 20).map((alias) => String(alias).trim().slice(0, 30)).filter(Boolean)
  }

  const result = await postJson('/api/products', body)
  if (result.failure === 'AUTH') return failure(AUTH_HINT)
  if (result.failure === 'CONFIG') return failure(CONFIG_HINT)
  if (result.failure || !result.data) {
    return failure('建档失败：' + (result.failure || '服务端未返回数据') + '。请如实告知用户后重试。')
  }

  const detail = result.data
  const product = detail.product || detail
  const createdSku = (detail.skus && detail.skus[0]) || null

  return {
    isError: false,
    content: text(
      '已按用户确认创建商品「' + product.name + '」' +
        (createdSku && createdSku.spec_name ? '（' + createdSku.spec_name + '）' : '') +
        '：规格 ID ' + (createdSku ? createdSku.id : '未知') + '，单位 ' + (createdSku ? createdSku.sale_unit : sku.sale_unit) +
        '，零售价 ' + (createdSku ? fenToYuan(createdSku.retail_price) : fenToYuan(sku.retail_price)) + ' 元' +
        (body.purchase_price !== undefined ? '，进货价 ' + fenToYuan(body.purchase_price) + ' 元' : '') + '。' +
        '请把建档结果告知用户；入库场景可继续调用 matchPurchaseItems 或 preparePurchase。',
    ),
    structuredContent: {
      product_id: product.id,
      sku_id: createdSku ? createdSku.id : null,
      name: product.name,
      spec_name: createdSku ? createdSku.spec_name : sku.spec_name,
      sale_unit: createdSku ? createdSku.sale_unit : sku.sale_unit,
      retail_price_yuan: createdSku ? fenToYuan(createdSku.retail_price) : fenToYuan(sku.retail_price),
      purchase_price_yuan: body.purchase_price !== undefined ? fenToYuan(body.purchase_price) : '',
      pagePath: 'pages/product-detail/index?id=' + product.id,
      linkText: '查看商品详情',
    },
  }
}

module.exports = createProduct
