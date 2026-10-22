import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { LoginScreen } from './LoginScreen'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let host: HTMLDivElement
let root: Root
let fetchMock: ReturnType<typeof vi.fn>
const click = async (label: string) => {
  const button = [...host.querySelectorAll('button')].find(b => b.textContent === label)
  expect(button, `button ${label}`).toBeTruthy()
  await act(async () => { button!.click() })
}
const fill = (id: string, value: string) => {
  const input = host.querySelector<HTMLInputElement>(`#${id}`)!
  expect(input).toBeTruthy()
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
  act(() => input.dispatchEvent(new Event('input', { bubbles: true })))
}
beforeEach(() => {
  for (const key of ['localStorage', 'sessionStorage']) {
    const values = new Map<string, string>()
    vi.stubGlobal(key, {
      getItem: (k: string) => values.get(k) ?? null,
      setItem: (k: string, v: string) => values.set(k, v),
      removeItem: (k: string) => values.delete(k),
    })
  }
  fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
  vi.stubGlobal('fetch', fetchMock)
  host = document.createElement('div'); document.body.appendChild(host)
  root = createRoot(host)
  act(() => root.render(<LoginScreen onLogin={vi.fn()} onSampleMode={vi.fn()} />))
})
afterEach(() => {
  act(() => root.unmount()); host.remove(); vi.unstubAllGlobals()
})

it('opens email recovery, requests a code without auth, and shows the neutral sent message', async () => {
  await click('忘记密码？')
  fill('reset-email', ' coach@example.com ')
  await click('发送验证码')
  expect(fetchMock).toHaveBeenCalledWith('/api/auth/email/forgot', expect.objectContaining({
    method: 'POST', body: JSON.stringify({ email: 'coach@example.com' }),
    headers: { 'Content-Type': 'application/json', 'X-MeetPR-Locale': 'zh-Hans' },
  }))
  expect(host.textContent).toContain('如果这个邮箱注册过，验证码已经发出。')
  expect(host.querySelector('#reset-code')).toBeTruthy()
})

it('resets with the six-digit code, returns to login, and uses the new password', async () => {
  await click('忘记密码？'); fill('reset-email', 'coach@example.com'); await click('发送验证码')
  fill('reset-code', '123456'); fill('reset-password', 'new-local-pass'); fill('reset-confirm', 'new-local-pass')
  await click('重置密码')
  expect(fetchMock).toHaveBeenLastCalledWith('/api/auth/email/reset', expect.objectContaining({
    method: 'POST', body: JSON.stringify({ email: 'coach@example.com', code: '123456', newPassword: 'new-local-pass' }),
    headers: { 'Content-Type': 'application/json', 'X-MeetPR-Locale': 'zh-Hans' },
  }))
  expect(host.textContent).toContain('密码已更新，请使用新密码登录')
  expect(host.querySelector('#reset-password')).toBeNull()
  fill('login-account', 'coach@example.com')
  const password = host.querySelector<HTMLInputElement>('input[type=password]')!
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(password, 'new-local-pass')
  act(() => password.dispatchEvent(new Event('input', { bubbles: true })))
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
    user: { id: 'fixture-coach', role: 'coach' }, accessToken: 'fixture-access', refreshToken: 'fixture-refresh',
  }), { status: 200 }))
  await click('登录')
  expect(fetchMock).toHaveBeenLastCalledWith('/api/auth/email/login', expect.objectContaining({
    body: JSON.stringify({ email: 'coach@example.com', password: 'new-local-pass' }),
  }))
})

it.each([
  ['12345', 'valid-local-password', 'valid-local-password', '请输入 6 位验证码'],
  ['123456', 'short', 'short', '请输入 8–72 位密码'],
  ['123456', '密'.repeat(25), '密'.repeat(25), '请输入 8–72 位密码'],
  ['123456', 'valid-local-password', 'different-password', '两次输入的密码不一致'],
])('rejects invalid reset input locally: %s / %s', async (code, password, confirmation, message) => {
  await click('忘记密码？'); fill('reset-email', 'coach@example.com'); await click('发送验证码')
  fill('reset-code', code); fill('reset-password', password); fill('reset-confirm', confirmation)
  await click('重置密码')
  expect(host.querySelector('[role=alert]')?.textContent).toBe(message)
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

it('tells a phone-account user to enter the registered email without sending', async () => {
  fill('login-account', '13812345678'); await click('忘记密码？'); await click('发送验证码')
  expect(host.querySelector('[role=alert]')?.textContent).toBe('请填写注册时用的邮箱')
  expect(fetchMock).not.toHaveBeenCalled()
})

it('keeps a wrong code recoverable and lets the user request another code', async () => {
  await click('忘记密码？'); fill('reset-email', 'coach@example.com'); await click('发送验证码')
  fill('reset-code', '000000'); fill('reset-password', 'new-local-pass'); fill('reset-confirm', 'new-local-pass')
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'AUTH_INVALID_RESET_CODE' }), { status: 401 }))
  await click('重置密码')
  expect(host.querySelector('[role=alert]')?.textContent).toBe('验证码不对或已过期，请重新获取')
  expect(host.querySelector<HTMLInputElement>('#reset-code')?.value).toBe('000000')
  await click('重新获取')
  expect(host.querySelector<HTMLInputElement>('#reset-email')?.value).toBe('coach@example.com')
  await click('发送验证码')
  expect(host.querySelector<HTMLInputElement>('#reset-code')?.value).toBe('')
  expect(fetchMock).toHaveBeenLastCalledWith('/api/auth/email/forgot', expect.objectContaining({ method: 'POST' }))
})

it('reports rate limiting without automatically resending requests', async () => {
  await click('忘记密码？'); fill('reset-email', 'coach@example.com')
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'RATE_LIMITED' }), { status: 429 }))
  await click('发送验证码')
  expect(host.querySelector('[role=alert]')?.textContent).toBe('尝试次数过多，请稍后重试')
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

it('holds email and navigation while sending and recovers from network failure', async () => {
  await click('忘记密码？'); fill('reset-email', 'coach@example.com')
  let rejectRequest!: (reason: Error) => void
  fetchMock.mockReturnValueOnce(new Promise((_, reject) => { rejectRequest = reject }))
  await click('发送验证码')
  expect(host.querySelector<HTMLInputElement>('#reset-email')?.disabled).toBe(true)
  expect([...host.querySelectorAll('button')].every(button => button.disabled)).toBe(true)
  await act(async () => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
  expect(fetchMock).toHaveBeenCalledTimes(1)
  await act(async () => rejectRequest(new Error('offline')))
  expect(host.querySelector('[role=alert]')?.textContent).toBe('无法连接后端，请稍后再试')
  expect(host.querySelector<HTMLInputElement>('#reset-email')?.disabled).toBe(false)
  await click('发送验证码')
  expect(host.querySelector('#reset-code')).toBeTruthy()
})
