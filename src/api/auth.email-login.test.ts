import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { emailLogin, login } from './auth'

const coachResponse = {
  user: { id: 'coach-1', phone: '+8613900000001', role: 'coach', createdAt: '2026-08-18T00:00:00Z' },
  accessToken: 'email-access',
  refreshToken: 'email-refresh',
}

describe('email login wire contract', () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    })
  })

  afterEach(() => vi.restoreAllMocks())

  it('posts email credentials and persists the shared session', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(coachResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(emailLogin('coach@example.com', 'secret', 'coach')).resolves.toMatchObject({ role: 'coach' })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain('/auth/email/login')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ email: 'coach@example.com', password: 'secret' })
    expect(localStorage.getItem('mpw.accessToken')).toBe('email-access')
    expect(localStorage.getItem('mpw.refreshToken')).toBe('email-refresh')
    expect(localStorage.getItem('mpw.user')).toBe(JSON.stringify(coachResponse.user))
  })

  it('keeps the phone request path and payload unchanged', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(coachResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    await login('+8613900000001', 'secret', 'coach')

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain('/auth/login')
    expect(String(url)).not.toContain('/auth/email/login')
    expect(JSON.parse(init.body as string)).toEqual({ phone: '+8613900000001', password: 'secret' })
  })
})
