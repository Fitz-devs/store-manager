const AUTH_HINT =
  '未登录或登录已过期，无法读取店内数据。请引导用户先打开小程序完成登录，再回来重试；不要重复调用本接口。'

const CONFIG_HINT = '小程序尚未完成初始化，请引导用户先打开一次小程序，再回来重试。'

function fenToYuan(fen) {
  const value = Number(fen)
  if (!isFinite(value)) return null
  return (value / 100).toFixed(2)
}

function text(message) {
  return [{ type: 'text', text: message }]
}

function failure(message) {
  return { isError: true, content: text(message) }
}

function getEnv() {
  return {
    apiBase: wx.getStorageSync('sm_api_base') || '',
    token: wx.getStorageSync('sm_token') || '',
  }
}

async function callApi(path) {
  const env = getEnv()
  if (!env.apiBase) return { failure: 'CONFIG' }
  const res = await new Promise((resolve) => {
    wx.request({
      url: env.apiBase + path,
      method: 'GET',
      header: env.token ? { Authorization: 'Bearer ' + env.token } : {},
      timeout: 30000,
      success: resolve,
      fail: () => resolve(null),
    })
  })
  if (!res) return { failure: '网络异常，请稍后重试' }
  if (res.statusCode === 401) return { failure: 'AUTH' }
  const body = res.data
  if (!body || body.ok !== true) {
    const message = (body && body.error && body.error.message) || '请求失败(' + res.statusCode + ')'
    return { failure: message }
  }
  return { data: body.data }
}

function promoText(promotions) {
  if (!promotions || !promotions.length) return ''
  return promotions.map((item) => item.content).join('；')
}

module.exports = { AUTH_HINT, CONFIG_HINT, fenToYuan, text, failure, getEnv, callApi, promoText }
