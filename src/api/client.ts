// Thin fetch wrapper around the MeetPR backend (dev: same-origin /api proxy).
// Attaches the Bearer access token, transparently refreshes on 401 once.

import type { TokenPair } from './types'

const BASE = '/api'
const ACCESS_KEY = 'mpw.accessToken'
const REFRESH_KEY = 'mpw.refreshToken'

export function getAccessToken(): string | null { return localStorage.getItem(ACCESS_KEY) }
export function getRefreshToken(): string | null { return localStorage.getItem(REFRESH_KEY) }
export function setTokens(t: TokenPair): void {
  localStorage.setItem(ACCESS_KEY, t.accessToken)
  localStorage.setItem(REFRESH_KEY, t.refreshToken)
}
export function clearTokens(): void {
  localStorage.removeItem(ACCESS_KEY)
  localStorage.removeItem(REFRESH_KEY)
}

export class ApiException extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message?: string) {
    super(message ?? code)
    this.status = status
    this.code = code
  }
}

interface ReqOpts {
  method?: string
  body?: unknown
  auth?: boolean // attach Bearer (default true)
}

async function raw(path: string, opts: ReqOpts): Promise<Response> {
  const headers: Record<string, string> = {}
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
  if (opts.auth !== false) {
    const tok = getAccessToken()
    if (tok) headers['Authorization'] = `Bearer ${tok}`
  }
  return fetch(`${BASE}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })
}

async function refreshTokens(): Promise<boolean> {
  const refreshToken = getRefreshToken()
  if (!refreshToken) return false
  const res = await raw('/auth/refresh', { method: 'POST', body: { refreshToken }, auth: false })
  if (!res.ok) { clearTokens(); return false }
  const tokens = (await res.json()) as TokenPair
  setTokens(tokens)
  return true
}

export async function request<T>(path: string, opts: ReqOpts = {}): Promise<T> {
  let res = await raw(path, opts)
  if (res.status === 401 && opts.auth !== false) {
    if (await refreshTokens()) res = await raw(path, opts)
  }
  if (!res.ok) {
    let code = `HTTP_${res.status}`
    try { const j = await res.json(); if (j?.error) code = j.error } catch { /* ignore */ }
    throw new ApiException(res.status, code)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export const api = {
  get: <T>(p: string) => request<T>(p),
  post: <T>(p: string, body?: unknown) => request<T>(p, { method: 'POST', body }),
  patch: <T>(p: string, body?: unknown) => request<T>(p, { method: 'PATCH', body }),
  del: <T>(p: string) => request<T>(p, { method: 'DELETE' }),
}
