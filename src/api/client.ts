// Thin fetch wrapper around the MeetPR backend (dev: same-origin /api proxy).
// Attaches the Bearer access token, transparently refreshes on 401 once.

import type { TokenPair } from './types'

// Dev + Vercel: '/api' (Vite proxy / Vercel rewrite handles it).
// Self-hosted-from-backend build: set VITE_API_BASE='' so calls hit the backend
// routes at the same origin (/auth, /plans, …) — no proxy, no CORS, no mixed content.
const BASE = import.meta.env.VITE_API_BASE ?? '/api'
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
  /** Parsed error body beyond `error` — e.g. PLAN_PUBLISH_INCOMPLETE's counts. */
  details: Record<string, unknown>
  constructor(status: number, code: string, details: Record<string, unknown> = {}) {
    super(code)
    this.status = status
    this.code = code
    this.details = details
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

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

// The backend rate-limits globally (100 req/min). Importing a plan reconciles as
// hundreds of per-set writes, so a single import blows through the window. A 429 is
// rejected before the handler runs — the request did NOT take effect — so retrying is
// safe. Back off on the server's Retry-After / RateLimit-Reset hint (capped) a bounded
// number of times so a large import rides through the limit slowly instead of failing.
const MAX_RATE_LIMIT_RETRIES = 6
function retryAfterMs(res: Response): number {
  const secs = Number(res.headers.get('Retry-After') ?? res.headers.get('RateLimit-Reset'))
  const wait = Number.isFinite(secs) && secs > 0 ? secs * 1000 : 2000
  return Math.min(wait, 60_000)
}

// raw() + bounded 429 backoff. Shared by request() AND refreshTokens() so a rate-limited
// refresh isn't mistaken for an invalid token (which would wipe a good session mid-import).
async function rawRetrying(path: string, opts: ReqOpts): Promise<Response> {
  let res = await raw(path, opts)
  for (let i = 0; res.status === 429 && i < MAX_RATE_LIMIT_RETRIES; i++) {
    await sleep(retryAfterMs(res))
    res = await raw(path, opts)
  }
  return res
}

async function refreshTokens(): Promise<boolean> {
  const refreshToken = getRefreshToken()
  if (!refreshToken) return false
  const res = await rawRetrying('/auth/refresh', { method: 'POST', body: { refreshToken }, auth: false })
  if (res.status === 429) return false // still rate-limited after backoff: keep tokens, surface upstream
  if (!res.ok) { clearTokens(); return false } // genuinely invalid refresh token
  const tokens = (await res.json()) as TokenPair
  setTokens(tokens)
  return true
}

export async function request<T>(path: string, opts: ReqOpts = {}): Promise<T> {
  // 429 backoff lives in rawRetrying; here we refresh once on 401. Order matters: an
  // import's backoff can span minutes, so a 401 can surface *after* the 429 retries when
  // the access token expires mid-wait — rawRetrying returns that 401, and we refresh then.
  let res = await rawRetrying(path, opts)
  if (res.status === 401 && opts.auth !== false) {
    if (await refreshTokens()) res = await rawRetrying(path, opts)
  }
  if (!res.ok) {
    let code = `HTTP_${res.status}`
    let details: Record<string, unknown> = {}
    try {
      const j = (await res.json()) as Record<string, unknown>
      if (typeof j?.error === 'string') { const { error, ...rest } = j; code = error; details = rest }
    } catch { /* ignore */ }
    throw new ApiException(res.status, code, details)
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
