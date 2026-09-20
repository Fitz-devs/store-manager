const { AUTH_HINT, CONFIG_HINT, fenToYuan, yuanToFen, text, failure, postJson } = require('../lib')

async function createProductsFromSlip(args) {
  const rows = (args && args.rows) || []
  if (!Array.isArray(rows) || !rows.length) {
    return failure('缺少单据行。请先向用户复述要建档的明细（品名/单位/进价/条码），确认后再调用本接口。')
  }
  if (rows.length > 50) {
    return failure('一次最多按单据建档 50 行，请分批处理。')
  }

  const created = []
  const failed = []
  for (const row of rows) {
    const name = String((row && row.name) || '').trim()
    if (!name) {
      failed.push({ name: '(空名称)', reason: '缺少品名' })
      continue
    }
    const body = { name: name.slice(0, 100) }
    const saleUnit = String((row && row.sale_unit) || '件').trim().slice(0, 10)
    body.sale_unit = saleUnit || '件'
    if (row && row.box_code) {
      const code = String(row.box_code).trim()
      if (code.length >= 8 && code.length <= 64) body.box_code = code
    }
    if (row && row.unit_code) {
      const code = String(row.unit_code).trim()
      if (code.length >= 8 && code.length <= 64) body.unit_code = code
    }
    if (row && row.conversion !== undefined && row.conversion !== null && Number(row.conversion) > 0) {
      const conversion = Math.round(Number(row.conversion))
      if (conversion >= 1 && conversion <= 100000) body.conversion = conversion
    }
    if (row && row.unit_price_yuan !== undefined && row.unit_price_yuan !== null && row.unit_price_yuan !== '') {
      const fen = yuanToFen(row.unit_price_yuan)
      if (fen === null || fen < 0) {
        failed.push({ name, reason: '进价无效' })
        continue
      }
      body.unit_price_fen = fen
    }
    if (row && row.spec_hint) body.spec_hint = String(row.spec_hint).trim().slice(0, 80)

    const result = await postJson('/api/products/from-ocr-row', body)
    if (result.failure === 'AUTH') return failure(AUTH_HINT)
    if (result.failure === 'CONFIG') return failure(CONFIG_HINT)
    if (result.failure || !result.data) {
      const reasonText = result.failure || ''
      // from-ocr-row 需要至少一个条码；单据行无条码时回退为普通建档，不阻塞入库流程
      if (/条码|箱码|单件码|至少需要/.test(reasonText) && !body.box_code && !body.unit_code) {
        const fallbackBody = {
          name: body.name,
          sku: { spec_name: body.spec_hint || null, sale_unit: body.sale_unit || '件', retail_price: 0 },
        }
        if (body.unit_price_fen !== undefined) fallbackBody.purchase_price = body.unit_price_fen
        const fallback = await postJson('/api/products', fallbackBody)
        if (!fallback.failure && fallback.data) {
          const detail = fallback.data
          const product = detail.product || detail
          const sku = (detail.skus && detail.skus[0]) || null
          created.push({
            name,
            box_sku_id: sku ? sku.id : null,
            box_product_id: product.id,
            box_product_name: product.name,
            box_sale_unit: sku ? sku.sale_unit : (body.sale_unit || '件'),
            unit_sku_id: null,
            unit_product_id: null,
            unit_product_name: '',
            unit_sale_unit: '',
            purchase_price_yuan: body.unit_price_fen !== undefined ? fenToYuan(body.unit_price_fen) : '',
            link_id: null,
            no_barcode_fallback: true,
          })
          continue
        }
      }
      failed.push({ name, reason: reasonText || '服务端未返回数据' })
      continue
    }
    const data = result.data
    created.push({
      name,
      box_sku_id: data.box ? data.box.sku_id : null,
      box_product_id: data.box ? data.box.product_id : null,
      box_product_name: data.box ? data.box.name : '',
      box_sale_unit: data.box ? data.box.sale_unit : '',
      unit_sku_id: data.unit ? data.unit.sku_id : null,
      unit_product_id: data.unit ? data.unit.product_id : null,
      unit_product_name: data.unit ? data.unit.name : '',
      unit_sale_unit: data.unit ? data.unit.sale_unit : '',
      purchase_price_yuan: body.unit_price_fen !== undefined ? fenToYuan(body.unit_price_fen) : '',
      link_id: data.link_id || null,
      no_barcode_fallback: false,
    })
  }

  const fallbackCount = created.filter((item) => item.no_barcode_fallback).length
  const parts = []
  if (created.length) {
    parts.push('已按用户确认建档 ' + created.length + ' 行：' + created.map((item) => item.name).join('、') + '。')
    if (fallbackCount) {
      parts.push(fallbackCount + ' 行因单据无条码改为普通建档（单规格，零售价 0 待完善）。')
    }
    parts.push('请告知用户建档结果。')
  }
  if (failed.length) {
    parts.push('建档失败：' + failed.map((item) => item.name + '（' + item.reason + '）').join('、') + '。请如实告知用户。')
  }
  if (!created.length && failed.length) {
    parts.push('本接口没有产生任何建档；不要用相同数据重复调用，请先修正失败原因。')
  } else if (created.length) {
    parts.push('入库场景：可直接用返回的 sku_id 调用 preparePurchase，或重新调用 matchPurchaseItems 确认匹配。')
  }

  return {
    isError: created.length === 0,
    content: text(parts.join('')),
    structuredContent: { created, failed, created_count: created.length, failed_count: failed.length },
  }
}

module.exports = createProductsFromSlip
