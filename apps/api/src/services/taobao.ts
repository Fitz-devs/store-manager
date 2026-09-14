import { md5 } from '../lib/md5'

export interface TaobaoBarcodeResult {
  title: string
  picUrl: string | null
  brand: string | null
  spec: string | null
}

function topTimestamp(): string {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ')
}

export function topSign(params: Record<string, string>, secret: string): string {
  const joined = Object.keys(params)
    .filter((key) => key !== 'sign' && params[key] !== undefined && params[key] !== '')
    .sort()
    .map((key) => `${key}${params[key]}`)
    .join('')
  return md5(`${secret}${joined}${secret}`).toUpperCase()
}

function pickProperty(properties: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = properties[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

export async function fetchTaobaoBarcode(
  code: string,
  appKey: string,
  appSecret: string,
): Promise<TaobaoBarcodeResult | null> {
  const params: Record<string, string> = {
    method: 'taobao.ma.barcode.productinfo.get',
    app_key: appKey,
    sign_method: 'md5',
    timestamp: topTimestamp(),
    format: 'json',
    v: '2.0',
    barcode: code,
  }
  params.sign = topSign(params, appSecret)

  const response = await fetch('https://eco.taobao.com/router/rest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
    body: new URLSearchParams(params).toString(),
    signal: AbortSignal.timeout(6000),
  })
  if (!response.ok) return null
  const data = (await response.json()) as {
    error_response?: { sub_code?: string; sub_msg?: string }
    ma_barcode_productinfo_get_response?: {
      result?: {
        title?: string
        pic_url?: string
        properties?: string
      }
    }
  }
  const result = data.ma_barcode_productinfo_get_response?.result
  if (!result?.title) return null

  let brand: string | null = null
  let spec: string | null = null
  if (result.properties) {
    try {
      const properties = JSON.parse(result.properties) as Record<string, unknown>
      brand = pickProperty(properties, ['品牌', '品牌名称'])
      spec = pickProperty(properties, ['净含量', '规格', '包装规格', '口味', '型号'])
    } catch {
      // 属性不是合法 JSON 时忽略
    }
  }

  return {
    title: result.title.trim(),
    picUrl: result.pic_url ?? null,
    brand,
    spec,
  }
}
