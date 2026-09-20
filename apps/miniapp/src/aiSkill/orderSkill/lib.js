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

function unwrap(res) {
  if (!res) return { failure: '网络异常，请稍后重试' }
  if (res.statusCode === 401) return { failure: 'AUTH' }
  const body = res.data
  if (!body || body.ok !== true) {
    const message = (body && body.error && body.error.message) || '请求失败(' + res.statusCode + ')'
    return { failure: message }
  }
  return { data: body.data }
}

function postJson(path, data) {
  return requestJson('POST', path, data)
}

function patchJson(path, data) {
  return requestJson('PATCH', path, data)
}

function requestJson(method, path, data) {
  const env = getEnv()
  if (!env.apiBase) return Promise.resolve({ failure: 'CONFIG' })
  return new Promise((resolve) => {
    wx.request({
      url: env.apiBase + path,
      method,
      header: env.token
        ? { Authorization: 'Bearer ' + env.token, 'Content-Type': 'application/json' }
        : { 'Content-Type': 'application/json' },
      data,
      timeout: 30000,
      success: resolve,
      fail: () => resolve(null),
    })
  }).then(unwrap)
}

function uploadPurchaseImage(filePath) {
  const env = getEnv()
  if (!env.apiBase) return Promise.resolve({ failure: 'CONFIG' })
  return new Promise((resolve) => {
    wx.uploadFile({
      url: env.apiBase + '/api/files',
      filePath,
      name: 'file',
      formData: { scope: 'purchases' },
      header: env.token ? { Authorization: 'Bearer ' + env.token } : {},
      success: resolve,
      fail: () => resolve(null),
    })
  }).then((res) => {
    if (!res) return { failure: '网络异常，请稍后重试' }
    if (res.statusCode === 401) return { failure: 'AUTH' }
    let body = null
    try {
      body = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
    } catch {
      body = null
    }
    return unwrap({ statusCode: res.statusCode, data: body })
  })
}

function yuanToFen(yuan) {
  const value = Number(yuan)
  if (!isFinite(value)) return null
  return Math.round(value * 100)
}

module.exports = {
  AUTH_HINT,
  CONFIG_HINT,
  fenToYuan,
  yuanToFen,
  text,
  failure,
  getEnv,
  callApi,
  postJson,
  patchJson,
  uploadPurchaseImage,
  promoText,
}
