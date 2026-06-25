import { request, setTokens, clearTokens, getAccessToken } from './client'
import type { LoginResponse, AuthUser } from './types'

const USER_KEY = 'mpw.user'

export async function login(phone: string, password: string): Promise<AuthUser> {
  const res = await request<LoginResponse>('/auth/login', {
    method: 'POST',
    body: { phone, password },
    auth: false,
  })
  setTokens({ accessToken: res.accessToken, refreshToken: res.refreshToken })
  localStorage.setItem(USER_KEY, JSON.stringify(res.user))
  return res.user
}

export function logout(): void {
  clearTokens()
  localStorage.removeItem(USER_KEY)
}

export function currentUser(): AuthUser | null {
  if (!getAccessToken()) return null
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return null
  try { return JSON.parse(raw) as AuthUser } catch { return null }
}
