import { useEffect, useRef, useState } from 'react'
import Taro, { useDidShow, useReachBottom } from '@tarojs/taro'
import { Button, Text, View } from '@tarojs/components'
import type { CustomerListItem } from '@sm/shared'
import { api } from '../../api/client'
import { SearchBox } from '../../components/search-box'
import { useAuthGuard } from '../../utils/auth'
import { formatFen } from '../../utils/format'
import './index.scss'

export default function CustomerSelect() {
  useAuthGuard()
  const [keyword, setKeyword] = useState('')
  const keywordRef = useRef('')
  const [items, setItems] = useState<CustomerListItem[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const requestRef = useRef(0)
  const loadingRef = useRef(false)

  const load = async (nextPage: number, append = false) => {
    if (append && loadingRef.current) return
    const request = requestRef.current + 1
    requestRef.current = request
    loadingRef.current = true
    setLoading(true)
    try {
      const query = new URLSearchParams()
      const q = keywordRef.current.trim()
      if (q) query.set('q', q)
      query.set('page', String(nextPage))
      query.set('page_size', '20')
      const data = await api.get<{ items: CustomerListItem[]; total: number }>(
        `/api/customers?${query.toString()}`,
      )
      if (requestRef.current !== request) return
      setItems((previous) => (append ? [...previous, ...data.items] : data.items))
      setTotal(data.total)
      setPage(nextPage)
    } catch (error) {
      if (requestRef.current !== request) return
      Taro.showToast({ title: (error as Error).message, icon: 'none' })
    } finally {
      if (requestRef.current === request) {
        loadingRef.current = false
        setLoading(false)
      }
    }
  }

  useDidShow(() => {
    load(1)
  })

  useReachBottom(() => {
    if (!loading && items.length < total) load(page + 1, true)
  })

  const pick = (customer: CustomerListItem | null) => {
    Taro.setStorageSync(
      'sm_customer_pick',
      customer ? { mode: 'select', customer } : { mode: 'clear' },
    )
    Taro.navigateBack()
  }

  const createNew = () => {
    if (keywordRef.current.trim()) {
      Taro.setStorageSync('sm_customer_draft_name', keywordRef.current.trim())
    }
    Taro.navigateTo({ url: '/pages/customer-edit/index?select=1' })
  }

  const onKeywordChange = (value: string) => {
    keywordRef.current = value
    setKeyword(value)
  }

  return (
    <View className="customer-select-page">
      <View className="toolbar">
        <SearchBox
          value={keyword}
          onChange={onKeywordChange}
          onSearch={() => load(1)}
          placeholder="搜索姓名 / 电话 / 地址"
        />
        <Button className="btn btn-primary toolbar-btn" onClick={createNew}>
          新建
        </Button>
      </View>

      <View className="card">
        <View className="option" onClick={() => pick(null)}>
          <Text>散客（不记客户）</Text>
        </View>
        {items.map((item) => (
          <View key={item.id} className="option" onClick={() => pick(item)}>
            <View className="row-between">
              <Text className="option-name">{item.name}</Text>
              {item.unpaid_amount > 0 ? (
                <Text className="tag tag-warn">欠款 {formatFen(item.unpaid_amount)}</Text>
              ) : null}
            </View>
            <Text className="muted">
              {[item.phone, item.address].filter(Boolean).join(' · ') || '暂无联系方式'}
            </Text>
          </View>
        ))}
        {!loading && !items.length && (
          <View className="sm-empty">
            <Text className="sm-empty-title">没有找到客户</Text>
            <Text className="sm-empty-sub">换个关键词，或点上方「新建」</Text>
          </View>
        )}
        {loading && !items.length && <View className="empty">加载中…</View>}
        {!loading && items.length > 0 && (
          <View className="sm-list-footer">
            {items.length < total ? '上滑加载更多…' : `到底了，共 ${total} 位`}
          </View>
        )}
        {loading && items.length > 0 && <View className="sm-list-footer">加载中…</View>}
      </View>
    </View>
  )
}
