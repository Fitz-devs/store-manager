import type { User } from '@sm/shared'
import type { DatabaseBundle } from './db'

export interface Bindings {
  DB: D1Database
  BUCKET: R2Bucket
  ASSETS?: Fetcher
  JWT_SECRET: string
  WX_APPID?: string
  WX_SECRET?: string
  OCR_MOCK?: string
  /** 智谱 API Key（glm-ocr） */
  ZHIPU_API_KEY?: string
  ZHIPU_OCR_MODEL?: string
  ZHIPU_BASE_URL?: string
  ZHIPU_API_KEY_STORE?: { get: () => Promise<string> }
}

export interface Variables {
  database: DatabaseBundle
  user: User
}

export type AppEnv = {
  Bindings: Bindings
  Variables: Variables
}
