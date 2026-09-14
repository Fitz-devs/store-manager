import Taro, { useDidShow } from '@tarojs/taro'
import { getToken } from '../api/client'

export function useAuthGuard(): void {
  useDidShow(() => {
    if (!getToken()) {
      Taro.reLaunch({ url: '/pages/login/index' })
    }
  })
}
