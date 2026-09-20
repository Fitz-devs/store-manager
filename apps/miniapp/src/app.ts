import type { PropsWithChildren } from 'react'
import { useEffect } from 'react'
import Taro from '@tarojs/taro'
import { API_BASE } from './config'
import './app.scss'

function App({ children }: PropsWithChildren) {
  useEffect(() => {
    // AI 开发模式的原子接口运行在独立 JS 环境，通过 storage 读取 API 地址与登录态
    Taro.setStorageSync('sm_api_base', API_BASE)
  }, [])
  return children
}

export default App
