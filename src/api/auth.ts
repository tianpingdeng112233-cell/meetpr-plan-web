import { request, setTokens, clearTokens, getAccessToken } from './client'
import type { LoginResponse, AuthUser } from './types'

const USER_KEY = 'mpw.user'

export class AuthRoleError extends Error {
  constructor(public readonly expected: AuthUser['role']) {
    super('AUTH_ROLE_NOT_ALLOWED')
  }
}

export async function login(
  phone: string,
  password: string,
  expectedRole?: AuthUser['role'],
): Promise<AuthUser> {
  const res = await request<LoginResponse>('/auth/login', {
    method: 'POST',
    body: { phone, password },
    auth: false,
  })
  // Do this before any persistence: a student must not be able to leave a
  // valid token in this coach-only web app by simply refreshing after denial.
  if (expectedRole && res.user.role !== expectedRole) throw new AuthRoleError(expectedRole)
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
