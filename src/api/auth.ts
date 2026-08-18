import { request, setTokens, clearTokens, getAccessToken } from './client'
import type { LoginResponse, AuthUser } from './types'
import { clearAllDraftMirrors } from '../features/plan-editor/draftMirror'

const USER_KEY = 'mpw.user'

export class AuthRoleError extends Error {
  constructor(public readonly expected: AuthUser['role']) {
    super('AUTH_ROLE_NOT_ALLOWED')
  }
}

function persistLogin(res: LoginResponse, expectedRole?: AuthUser['role']): AuthUser {
  // Do this before any persistence: a student must not be able to leave a
  // valid token in this coach-only web app by simply refreshing after denial.
  const roleAllowed = !expectedRole
    || res.user.role === expectedRole
    || (expectedRole === 'coach' && res.user.role === 'admin')
  if (!roleAllowed) throw new AuthRoleError(expectedRole)
  setTokens({ accessToken: res.accessToken, refreshToken: res.refreshToken })
  localStorage.setItem(USER_KEY, JSON.stringify(res.user))
  return res.user
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
  return persistLogin(res, expectedRole)
}

export async function emailLogin(
  email: string,
  password: string,
  expectedRole?: AuthUser['role'],
): Promise<AuthUser> {
  const res = await request<LoginResponse>('/auth/email/login', {
    method: 'POST',
    body: { email, password },
    auth: false,
  })
  return persistLogin(res, expectedRole)
}

/**
 * PUT /me/password. 204 on success; 403 PASSWORD_MISMATCH when the old password
 * is wrong; 400 VALIDATION_ERROR when the new one is under 8 characters.
 *
 * The backend revokes every refresh token on success — including this tab's —
 * so callers must send the coach back to the login screen rather than let the
 * session die silently once the access token expires.
 */
export async function changePassword(oldPassword: string, newPassword: string): Promise<void> {
  await request<void>('/me/password', {
    method: 'PUT',
    body: { old_password: oldPassword, new_password: newPassword },
  })
}

const NOTICE_KEY = 'mpw.notice'

/**
 * One-shot message handed to the login screen across a forced sign-out, so a
 * password change can confirm itself somewhere that outlives the dead session.
 * Session-scoped and read-once: it must not resurface on a later visit.
 */
export function setLoginNotice(message: string): void {
  try { sessionStorage.setItem(NOTICE_KEY, message) } catch { /* privacy mode */ }
}

/** Read without consuming, so a double-invoked effect (StrictMode) is safe. */
export function peekLoginNotice(): string {
  try {
    return sessionStorage.getItem(NOTICE_KEY) ?? ''
  } catch {
    return ''
  }
}

export function clearLoginNotice(): void {
  try { sessionStorage.removeItem(NOTICE_KEY) } catch { /* privacy mode */ }
}

export function logout(): void {
  // Each cleanup step is independent: a throwing localStorage (privacy mode)
  // must not stop the token clear, the user clear, or the mirror sweep.
  try { clearTokens() } catch { /* storage-backed token clear may throw */ }
  try { localStorage.removeItem(USER_KEY) } catch { /* ditto */ }
  try { clearAllDraftMirrors() } catch { /* ditto */ }
}

export function currentUser(): AuthUser | null {
  if (!getAccessToken()) return null
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return null
  try { return JSON.parse(raw) as AuthUser } catch { return null }
}
