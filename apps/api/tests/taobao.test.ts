import { describe, expect, it } from 'vitest'
import { md5 } from '../src/lib/md5'
import { topSign } from '../src/services/taobao'

describe('md5', () => {
  it('标准测试向量', () => {
    expect(md5('')).toBe('d41d8cd98f00b204e9800998ecf8427e')
    expect(md5('abc')).toBe('900150983cd24fb0d6963f7d28e17f72')
    expect(md5('The quick brown fox jumps over the lazy dog')).toBe(
      '9e107d9d372bb6826bd81d3542a419d6',
    )
  })

  it('支持 UTF-8 中文', () => {
    expect(md5('中文')).toBe('a7bac2239fcdcb3a067903d8077c4a07')
  })
})

describe('topSign', () => {
  it('按 key 排序并用 secret 包裹，签名前的 sign 不参与', () => {
    const expected = md5('secret' + 'a1b2' + 'secret').toUpperCase()
    expect(topSign({ b: '2', a: '1', sign: 'ignored' }, 'secret')).toBe(expected)
  })

  it('忽略空值参数', () => {
    const expected = md5('secret' + 'a1' + 'secret').toUpperCase()
    expect(topSign({ a: '1', c: '' }, 'secret')).toBe(expected)
  })
})
