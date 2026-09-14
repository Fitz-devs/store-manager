import type { User } from '@sm/shared'
import type { DatabaseBundle } from './db'

export interface Bindings {
  DB: D1Database
  BUCKET: R2Bucket
  AI: Ai
  ASSETS?: Fetcher
  JWT_SECRET: string
  WX_APPID?: string
  WX_SECRET?: string
  TB_APP_KEY?: string
  TB_APP_SECRET?: string
  ALI_MARKET_BARCODE_URL?: string
  ALI_MARKET_APPCODE?: string
  APIZERO_KEY?: string
  BARCODESPIDER_TOKEN?: string
  OCR_MODEL?: string
  ENVIRONMENT?: string
}

export interface Variables {
  database: DatabaseBundle
  user: User
}

export type AppEnv = {
  Bindings: Bindings
  Variables: Variables
}
