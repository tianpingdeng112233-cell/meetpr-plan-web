import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiException } from '../../api/client'
import type { AuthUser } from '../../api/types'
import { LoginScreen, isValidLoginEmail } from './LoginScreen'

const auth = vi.hoisted(() => {
  class AuthRoleError extends Error {}
  return {
    AuthRoleError,
    clearLoginNotice: vi.fn(),
    emailLogin: vi.fn(),
    login: vi.fn(),
    peekLoginNotice: vi.fn(),
  }
})

vi.mock('../../api/auth', () => auth)

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const coach: AuthUser = {
  id: 'coach-1',
  phone: '+8613900000001',
  role: 'coach',
  createdAt: '2026-08-18T00:00:00Z',
}

function setInput(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
  act(() => input.dispatchEvent(new Event('input', { bubbles: true })))
}

describe('LoginScreen account routing', () => {
  let host: HTMLDivElement
  let root: Root
  let onLogin: ReturnType<typeof vi.fn>

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    onLogin = vi.fn()
    auth.login.mockReset()
    auth.emailLogin.mockReset()
    auth.peekLoginNotice.mockReset().mockReturnValue('')
    auth.clearLoginNotice.mockReset()
    act(() => root.render(<LoginScreen onLogin={onLogin} onSampleMode={vi.fn()} />))
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  function fields() {
    const inputs = host.querySelectorAll<HTMLInputElement>('input')
    return { account: inputs[0], password: inputs[1] }
  }

  async function submit() {
    await act(async () => {
      host.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await Promise.resolve()
    })
  }

  it('shows the bilingual account label and placeholder', () => {
    expect(host.querySelector('label')?.textContent).toBe('手机号或邮箱 / Phone or email')
    expect(fields().account.placeholder).toBe('手机号或邮箱 / Phone or email')
  })

  it('uses the email channel and shared success callback when the account contains @', async () => {
    auth.emailLogin.mockResolvedValue(coach)
    const { account, password } = fields()
    setInput(account, ' coach@example.com ')
    setInput(password, 'secret')

    await submit()

    expect(auth.emailLogin).toHaveBeenCalledWith('coach@example.com', 'secret', 'coach')
    expect(auth.login).not.toHaveBeenCalled()
    expect(onLogin).toHaveBeenCalledWith(coach)
  })

  it('maps every email-login 401 to the email credentials error', async () => {
    auth.emailLogin.mockRejectedValue(new ApiException(401, 'HTTP_401'))
    const { account, password } = fields()
    setInput(account, 'coach@example.com')
    setInput(password, 'wrong')

    await submit()

    expect(host.textContent).toContain('邮箱或密码不正确')
  })

  it('rejects an invalid email locally without making a request', async () => {
    const { account, password } = fields()
    setInput(account, 'coach@invalid')
    setInput(password, 'secret')

    await submit()

    expect(host.textContent).toContain('请填写正确的邮箱和密码')
    expect(auth.emailLogin).not.toHaveBeenCalled()
    expect(auth.login).not.toHaveBeenCalled()
  })

  it('keeps accounts without @ on the existing phone channel', async () => {
    auth.login.mockResolvedValue(coach)
    const { account, password } = fields()
    setInput(account, '139 0000 0001')
    setInput(password, 'secret')

    await submit()

    expect(auth.login).toHaveBeenCalledWith('+8613900000001', 'secret', 'coach')
    expect(auth.emailLogin).not.toHaveBeenCalled()
  })
})

// 表驱动边界:客户端邮箱校验对齐后端 zod .trim().email().max(320) 口径。
describe('isValidLoginEmail 边界口径', () => {
  const valid = [
    'coach@example.com',
    '  coach@example.com  ',
    'COACH+tag@Example.co.uk',
    "o'brien@example.com",
    'a@b-.com', // zod 域名标签允许尾连字符,前端同源放行
  ]
  const invalid = [
    '.coach@example.com',
    'coach.@example.com',
    'coach@example..com',
    'coach@.example.com',
    'coach@example.com.',
    'co ach@example.com',
    'coach@@example.com',
    'coach@example',
    'a'.repeat(310) + '@example.com',
    'a@b.c2', // zod:TLD 必须纯字母
    'a@b.c-2',
  ]
  for (const v of valid) {
    it(`接受 ${JSON.stringify(v)}`, () => {
      expect(isValidLoginEmail(v)).toBe(true)
    })
  }
  for (const v of invalid) {
    it(`拒绝 ${JSON.stringify(v)}`, () => {
      expect(isValidLoginEmail(v)).toBe(false)
    })
  }
})
