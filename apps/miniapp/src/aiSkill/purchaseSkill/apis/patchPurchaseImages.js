const { AUTH_HINT, CONFIG_HINT, text, failure, patchJson, uploadPurchaseImage } = require('../lib')

const PLACEHOLDER_RE = /^\{\{[^}]+\}\}$/

async function patchPurchaseImages(args) {
  const input = args || {}
  const purchaseId = Number(input.purchase_id)
  if (!Number.isInteger(purchaseId) || purchaseId <= 0) {
    return failure('purchase_id 无效。该 ID 取自 queryPurchases/submitPurchase 返回的原值，禁止编造。')
  }

  const rawImagePath = typeof input.imagePath === 'string' ? input.imagePath.trim() : ''
  if (rawImagePath && PLACEHOLDER_RE.test(rawImagePath)) {
    return failure(
      'imagePath 收到的是图片占位符（' + rawImagePath + '）而非真实文件路径，说明运行时未把对话中的图片注入接口，对话内无法完成补传。' +
        '请引导用户：打开小程序底部「入库」页 → 点开该入库单 → 详情页点「补充上传照片」手动补传。' +
        '不要用相同的占位符参数重复调用本接口。',
    )
  }

  const imageKeys = []
  let imageUploadWarn = null
  if (rawImagePath) {
    const uploaded = await uploadPurchaseImage(rawImagePath)
    if (uploaded.failure === 'AUTH') return failure(AUTH_HINT)
    if (uploaded.failure === 'CONFIG') return failure(CONFIG_HINT)
    if (uploaded.failure || !uploaded.data || !uploaded.data.key) {
      imageUploadWarn =
        '图片未能上传（路径无效或网络异常），本次补传未完成。请引导用户到入库详情页点「补充上传照片」手动补传；不要用相同参数重试。'
    } else {
      imageKeys.push(uploaded.data.key)
    }
  }
  if (Array.isArray(input.image_keys) && input.image_keys.length) {
    for (const key of input.image_keys) {
      const normalized = String(key || '').trim().slice(0, 300)
      if (normalized && imageKeys.indexOf(normalized) < 0) imageKeys.push(normalized)
      if (imageKeys.length >= 10) break
    }
  }
  if (!imageKeys.length) {
    return failure(
      imageUploadWarn ||
        '请提供 imagePath（用户对话里的单据图）或 image_keys（已有 R2 key）之一再调用。',
    )
  }

  const result = await patchJson('/api/purchases/' + purchaseId, { image_keys: imageKeys })
  if (result.failure === 'AUTH') return failure(AUTH_HINT)
  if (result.failure === 'CONFIG') return failure(CONFIG_HINT)
  if (result.failure || !result.data) {
    return failure('补传失败：' + (result.failure || '服务端未返回数据') + '。请告知用户核对后再试。')
  }

  const purchase = result.data
  return {
    isError: false,
    content: text(
      '已为入库单（ID ' + purchaseId + '）补充 ' + imageKeys.length + ' 张单据照片。请告知用户；入库详情页可预览。' +
        (imageUploadWarn ? '「' + imageUploadWarn + '」' : ''),
    ),
    structuredContent: {
      purchase_id: purchaseId,
      purchase_no: purchase.purchase_no || '',
      image_keys_count: imageKeys.length,
      purchaseDetailPath: 'pages/purchase-detail/index?id=' + purchaseId,
      linkText: '查看入库单',
    },
  }
}

module.exports = patchPurchaseImages