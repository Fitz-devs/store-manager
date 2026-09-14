import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from '../src/lib/password'

describe('password', () => {
  it('哈希后可用原密码验证', async () => {
    const hash = await hashPassword('admin123')
    expect(hash.startsWith('pbkdf2$')).toBe(true)
    expect(await verifyPassword('admin123', hash)).toBe(true)
  })

  it('错误密码验证失败', async () => {
    const hash = await hashPassword('admin123')
    expect(await verifyPassword('wrong', hash)).toBe(false)
  })

  it('空哈希或非法格式返回 false', async () => {
    expect(await verifyPassword('admin123', null)).toBe(false)
    expect(await verifyPassword('admin123', 'not-a-hash')).toBe(false)
  })
})
