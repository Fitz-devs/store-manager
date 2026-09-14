export interface StoredFile {
  body: ReadableStream | null
  contentType: string | null
  etag: string | null
}

export interface StorageAdapter {
  put(key: string, body: ArrayBuffer, contentType: string): Promise<void>
  get(key: string): Promise<StoredFile | null>
  delete(key: string): Promise<void>
}

export function createStorage(bucket: R2Bucket): StorageAdapter {
  return {
    async put(key, body, contentType) {
      await bucket.put(key, body, {
        httpMetadata: { contentType, cacheControl: 'public, max-age=31536000, immutable' },
      })
    },
    async get(key) {
      const object = await bucket.get(key)
      if (!object) return null
      return {
        body: object.body,
        contentType: object.httpMetadata?.contentType ?? null,
        etag: object.httpEtag ?? null,
      }
    },
    async delete(key) {
      await bucket.delete(key)
    },
  }
}
