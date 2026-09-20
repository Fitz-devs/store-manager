const { AUTH_HINT, CONFIG_HINT, text, failure, patchJson, uploadPurchaseImage } = require('../lib')

const PLACEHOLDER_RE = /^\{\{[^}]+\}\}$/

async function patchOrderDeliveryPhoto(args) {
  const input = args || {}
  const orderId = Number(input.order_id)
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return failure('order_id 无效。该 ID 取自 submitOrder 返回的 order_id 或小程序订单列表，禁止编造。')
  }

  const rawImagePath = typeof input.imagePath === 'string' ? input.imagePath.trim() : ''
  if (!rawImagePath) {
    return failure('缺少 imagePath（送货照本地路径）。AI 对话里的送货照片可直接回传。')
  }
  if (PLACEHOLDER_RE.test(rawImagePath)) {
    return failure(
      'imagePath 收到的是图片占位符（' + rawImagePath + '）而非真实文件路径，说明运行时未把对话中的图片注入接口，对话内无法完成补传。' +
        '请引导用户：打开小程序「订单」页 → 点开该订单 → 详情页点「替换送货照」手动补传。' +
        '不要用相同的占位符参数重复调用本接口。',
    )
  }
  if (input.note !== undefined && input.note !== null && input.note !== '' && String(input.note).length > 500) {
    return failure('note 过长（>500），请向用户确认。')
  }

  const uploaded = await uploadPurchaseImage(rawImagePath)
  if (uploaded.failure === 'AUTH') return failure(AUTH_HINT)
  if (uploaded.failure === 'CONFIG') return failure(CONFIG_HINT)
  if (uploaded.failure || !uploaded.data || !uploaded.data.key) {
    return failure('送货照未能上传（路径无效或网络异常）。请引导用户到订单详情页点「替换送货照」手动补传；不要用相同参数重试。')
  }

  const patchBody = { delivery_photo_key: uploaded.data.key }
  if (input.note) patchBody.note = String(input.note).trim().slice(0, 500)

  const result = await patchJson('/api/orders/' + orderId, patchBody)
  if (result.failure === 'AUTH') return failure(AUTH_HINT)
  if (result.failure === 'CONFIG') return failure(CONFIG_HINT)
  if (result.failure || !result.data) {
    return failure('补传送货照失败：' + (result.failure || '服务端未返回数据') + '。请告知用户核对后再试。')
  }

  return {
    isError: false,
    content: text(
      '已为订单（ID ' + orderId + '）补充送货照。请告知用户；订单详情页可预览。' +
        (input.note ? '备注：' + String(input.note).trim().slice(0, 500) : ''),
    ),
    structuredContent: {
      order_id: orderId,
      delivery_photo_key: uploaded.data.key,
      orderDetailPath: 'pages/order-detail/index?id=' + orderId,
      linkText: '查看订单',
    },
  }
}

module.exports = patchOrderDeliveryPhoto