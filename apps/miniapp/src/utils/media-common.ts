export type UploadScope = 'products' | 'purchases' | 'deliveries' | 'payments' | 'misc'

export interface LocalImage {
  path: string
  file?: File
}

export type PickSource = 'camera' | 'album' | 'both'
