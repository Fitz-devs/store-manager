const { AUTH_HINT, CONFIG_HINT, fenToYuan, text, failure, callApi, postJson, uploadPurchaseImage } = require('../lib')

async function recognizePurchaseSlip(args) {
  const imagePath = String((args && args.imagePath) || '').trim()
  if (!imagePath) {
    return failure('缺少收货单图片。请把用户在对话中发送的单据照片路径传入本接口。')
  }

  const uploaded = await uploadPurchaseImage(imagePath)
  if (uploaded.failure === 'AUTH') return failure(AUTH_HINT)
  if (uploaded.failure === 'CONFIG') return failure(CONFIG_HINT)
  if (uploaded.failure || !uploaded.data || !uploaded.data.key) {
    return failure('单据图片上传失败：' + (uploaded.failure || '未返回文件标识') + '。请让用户重发清晰照片后重试。')
  }

  const ocr = await postJson('/api/ocr/purchase', { image_key: uploaded.data.key })
  if (ocr.failure === 'AUTH') return failure(AUTH_HINT)
  if (ocr.failure) {
    return failure('系统识别失败：' + ocr.failure + '。请改用模型自行读图提取明细（matchPurchaseItems），或让用户重发照片。')
  }

  const draft = (ocr.data && ocr.data.draft) || null
  const draftRows = (draft && draft.rows) || []
  const legacyRows = (ocr.data && ocr.data.rows) || []
  const headers = (draft && draft.headers) || (ocr.data && ocr.data.headers) || []
  const header = headers[0] || null
  const model = (ocr.data && ocr.data.model) || ''

  if (!draftRows.length && !legacyRows.length) {
    return {
      isError: false,
      content: text('系统识别未从单据中读出任何明细行。请如实告知用户，建议重发更清晰的照片，或改由模型读图后走 matchPurchaseItems。'),
      structuredContent: { rows: [], supplier_name: '', order_date: '', total_raw: '', model },
    }
  }

  const items = draftRows.length
    ? draftRows.map((row) => ({
        name: row.name,
        spec: row.spec_hint || '',
        qty: row.qty,
        unit: row.unit || '',
        unit_price_yuan: row.unit_price_fen === null || row.unit_price_fen === undefined ? null : fenToYuan(row.unit_price_fen),
        amount_yuan: row.amount_fen === null || row.amount_fen === undefined ? null : fenToYuan(row.amount_fen),
        box_code: row.box_code || '',
        unit_code: row.unit_code || '',
        conversion_guess: row.conversion_guess || 1,
      }))
    : legacyRows.map((row) => ({
        name: row.name,
        spec: row.spec || '',
        qty: row.qty,
        unit: row.unit || '',
        unit_price_yuan: row.unit_price === null || row.unit_price === undefined ? null : String(row.unit_price),
        amount_yuan: row.amount === null || row.amount === undefined ? null : String(row.amount),
        box_code: '',
        unit_code: '',
        conversion_guess: 1,
      }))

  return {
    isError: false,
    content: text(
      '系统识别出 ' + items.length + ' 行明细' +
        (header && header.supplier_name ? '，供应商「' + header.supplier_name + '」' : '') +
        '。请把明细（品名/数量/单价）念给用户核对，然后调用 matchPurchaseItems 匹配店内商品；识别数字与原图不符时以用户确认为准，不要擅自改数。',
    ),
    structuredContent: {
      rows: items,
      image_key: (uploaded.data && uploaded.data.key) || '',
      supplier_name: (header && header.supplier_name) || '',
      order_date: (header && header.date) || '',
      total_raw: (header && header.total_raw) || '',
      model: (ocr.data && ocr.data.model) || '',
    },
  }
}

module.exports = recognizePurchaseSlip
