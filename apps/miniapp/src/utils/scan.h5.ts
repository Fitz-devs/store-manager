import Taro from '@tarojs/taro'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { BarcodeFormat, DecodeHintType } from '@zxing/library'

export async function scanBarcode(): Promise<string | null> {
  const hints = new Map<DecodeHintType, unknown>()
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
    BarcodeFormat.CODE_128,
    BarcodeFormat.CODE_39,
    BarcodeFormat.ITF,
    BarcodeFormat.QR_CODE,
  ])
  hints.set(DecodeHintType.TRY_HARDER, true)
  const reader = new BrowserMultiFormatReader(hints as never)

  const overlay = document.createElement('div')
  overlay.setAttribute(
    'style',
    'position:fixed;inset:0;background:#000;z-index:99999;display:flex;flex-direction:column;',
  )
  const tip = document.createElement('div')
  tip.setAttribute('style', 'color:#fff;text-align:center;font-size:14px;padding:14px;')
  tip.textContent = '把条码放进取景框，识别成功后自动返回'
  const video = document.createElement('video')
  video.setAttribute('playsinline', 'true')
  video.setAttribute('muted', 'true')
  video.setAttribute('style', 'flex:1;width:100%;object-fit:cover;background:#000;')
  const footer = document.createElement('div')
  footer.setAttribute('style', 'padding:20px;text-align:center;')
  const cancelButton = document.createElement('button')
  cancelButton.textContent = '取消'
  cancelButton.setAttribute(
    'style',
    'padding:12px 40px;border-radius:999px;border:none;background:#fff;color:#333;font-size:16px;',
  )
  footer.appendChild(cancelButton)
  overlay.append(tip, video, footer)
  document.body.appendChild(overlay)

  let controls: { stop: () => void } | null = null
  let settled = false
  const cleanup = () => {
    try {
      controls?.stop()
    } catch {
      // ignore
    }
    overlay.remove()
  }

  return new Promise<string | null>((resolve) => {
    const finish = (value: string | null) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(value)
    }
    cancelButton.addEventListener('click', () => finish(null))
    reader
      .decodeFromConstraints(
        { video: { facingMode: { ideal: 'environment' } }, audio: false },
        video,
        (result) => {
          if (result) finish(result.getText())
        },
      )
      .then((scanControls) => {
        controls = scanControls
      })
      .catch(() => {
        finish(null)
        Taro.showModal({
          title: '无法打开摄像头',
          content: '请确认已授权摄像头权限；非 localhost 环境需要 HTTPS 才能调用摄像头。',
          showCancel: false,
        })
      })
  })
}
