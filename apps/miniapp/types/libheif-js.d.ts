declare module 'libheif-js/libheif-wasm/libheif-bundle.mjs' {
  export interface HeifImage {
    get_width(): number
    get_height(): number
    display(
      data: { data: Uint8ClampedArray; width: number; height: number },
      callback: (result: { data: Uint8ClampedArray } | null) => void,
    ): void
    free(): void
  }

  export class HeifDecoder {
    decode(buffer: Uint8Array): HeifImage[]
  }

  export interface LibheifModule {
    HeifDecoder: typeof HeifDecoder
  }

  export default function init(options?: Record<string, unknown>): Promise<LibheifModule>
}
