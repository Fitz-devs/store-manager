import Taro from '@tarojs/taro'
import { API_BASE } from '../config'

export interface ApiEnvelope<T> {
  ok: boolean
  data?: T
  error?: { code: string; message: string; detail?: unknown }
}

export class ApiError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

const TOKEN_KEY = 'sm_token'
const USER_KEY = 'sm_user'

export function getToken(): string {
  try {
    return Taro.getStorageSync(TOKEN_KEY) || ''
  } catch {
    return ''
  }
}

export function setToken(token: string): void {
  Taro.setStorageSync(TOKEN_KEY, token)
}

export function clearToken(): void {
  Taro.removeStorageSync(TOKEN_KEY)
  Taro.removeStorageSync(USER_KEY)
}

export function getUser<T = unknown>(): T | null {
  try {
    return (Taro.getStorageSync(USER_KEY) as T) || null
  } catch {
    return null
  }
}

export function setUser(user: unknown): void {
  Taro.setStorageSync(USER_KEY, user)
}

async function request<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  data?: unknown,
): Promise<T> {
  const header: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) header.Authorization = `Bearer ${token}`
  let res: { statusCode: number; data: unknown }
  try {
    res = await Taro.request({ url: `${API_BASE}${path}`, method, data, header, timeout: 30000 })
  } catch {
    throw new ApiError('NETWORK', '网络异常，请检查网络后重试')
  }
  const body = res.data as ApiEnvelope<T>
  if (res.statusCode === 401) {
    clearToken()
    Taro.reLaunch({ url: '/pages/login/index' })
    throw new ApiError('UNAUTHORIZED', '登录已过期，请重新登录')
  }
  if (!body || body.ok !== true) {
    throw new ApiError(
      body?.error?.code ?? 'ERROR',
      body?.error?.message ?? `请求失败(${res.statusCode})`,
    )
  }
  return body.data as T
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, data?: unknown) => request<T>('POST', path, data),
  patch: <T>(path: string, data?: unknown) => request<T>('PATCH', path, data),
  delete: <T>(path: string) => request<T>('DELETE', path),
}

export async function uploadImage(
  filePath: string,
  scope: 'products' | 'purchases' | 'deliveries' | 'payments' | 'misc',
): Promise<{ key: string; url: string }> {
  const token = getToken()
  const res = await Taro.uploadFile({
    url: `${API_BASE}/api/files`,
    filePath,
    name: 'file',
    formData: { scope },
    header: token ? { Authorization: `Bearer ${token}` } : {},
  })
  let body: ApiEnvelope<{ key: string; url: string }> | null = null
  try {
    body = JSON.parse(res.data) as ApiEnvelope<{ key: string; url: string }>
  } catch {
    body = null
  }
  if (res.statusCode !== 200 && res.statusCode !== 201) {
    throw new ApiError('UPLOAD_FAILED', `上传失败(${res.statusCode})`)
  }
  if (!body?.ok || !body.data) {
    throw new ApiError(body?.error?.code ?? 'UPLOAD_FAILED', body?.error?.message ?? '上传失败')
  }
  return body.data
}

export function fileUrl(key: string | null | undefined): string {
  if (!key) return ''
  if (key.startsWith('http')) return key
  return `${API_BASE}/files/${key}`
}
