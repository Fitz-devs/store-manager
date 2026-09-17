import Taro from '@tarojs/taro'
import { api } from '../api/client'

export async function scanAndGo(code: string): Promise<void> {
  Taro.showLoading({ title: '查询中', mask: true })
  try {
    const lookup = await api.get<{ product?: { product: { id: number } } }>(
      `/api/barcodes/lookup?code=${encodeURIComponent(code)}`,
    )
    Taro.hideLoading()
    if (lookup.product) {
      Taro.navigateTo({ url: `/pages/product-detail/index?id=${lookup.product.product.id}` })
      return
    }
    const confirm = await Taro.showModal({
      title: `未找到条码 ${code}`,
      content: '是否立即录入该商品？',
    })
    if (confirm.confirm) {
      Taro.navigateTo({ url: `/pages/product-edit/index?barcode=${encodeURIComponent(code)}` })
    }
  } catch (error) {
    Taro.hideLoading()
    Taro.showToast({ title: (error as Error).message, icon: 'none' })
  } finally {
    Taro.hideLoading()
  }
}
