const injectedApi: string = process.env.TARO_APP_API || ''

export const API_BASE = injectedApi || (process.env.NODE_ENV === 'development' ? 'http://127.0.0.1:8787' : 'https://api.example.com')

export const DEFAULT_PAGE_SIZE = 20
