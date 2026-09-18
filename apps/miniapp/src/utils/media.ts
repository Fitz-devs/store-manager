import Taro from '@tarojs/taro'
import { uploadImage } from '../api/client'
import type { LocalImage, PickSource, UploadScope } from './media-common'

export type { UploadScope, LocalImage, PickSource } from './media-common'

export async function pickImages(
  options: { count?: number; camera?: boolean; source?: PickSource } = {},
): Promise<LocalImage[]> {
  // camera: true 兼容旧行为 = both（可拍可选）；显式 source 优先
  const source: PickSource =
    options.source ?? (options.camera ? 'both' : 'album')
  const sourceType: Array<'camera' | 'album'> =
    source === 'camera' ? ['camera'] : source === 'album' ? ['album'] : ['camera', 'album']
  const media = await Taro.chooseMedia({
    count: options.count ?? 1,
    mediaType: ['image'],
    sourceType,
    sizeType: ['compressed'],
  })
  return media.tempFiles.map((item) => ({ path: item.tempFilePath }))
}

export async function uploadLocalImage(
  image: LocalImage,
  scope: UploadScope,
): Promise<{ key: string; url: string }> {
  const compressed = await Taro.compressImage({ src: image.path, quality: 80 })
  return uploadImage(compressed.tempFilePath, scope)
}
