import Taro from '@tarojs/taro'
import shareLogo from '../assets/share-logo.png'
import { fileUrl } from '../api/client'

export const SHARE_LOGO: string = shareLogo

/** Prefer a network image for the share card; fall back to the packaged logo. */
export function buildShareImageUrl(key: string | null | undefined): Promise<string> {
  const url = key ? fileUrl(key) : ''
  if (!url) return Promise.resolve(SHARE_LOGO)
  return new Promise((resolve) => {
    Taro.downloadFile({
      url,
      success: (res) => resolve(res.statusCode === 200 ? res.tempFilePath : SHARE_LOGO),
      fail: () => resolve(SHARE_LOGO),
    })
  })
}
