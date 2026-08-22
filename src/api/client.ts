// Thin fetch wrapper around the MeetPR backend (dev: same-origin /api proxy).
// Attaches the Bearer access token, transparently refreshes on 401 once.

import type { TokenPair } from './types'

// Dev: '/api' (Vite dev-server proxy handles it).
// Self-hosted-from-backend build: set VITE_API_BASE='' so calls hit the backend
// routes at the same origin (/auth, /plans, …) — no proxy, no CORS, no mixed content.
function configuredApiBase(): string {
  const base = import.meta.env.VITE_API_BASE ?? '/api'
  // A production browser must never be configured to send credentials directly
  // over HTTP. Relative paths are safe (they inherit the page's HTTPS origin),
  // as is an explicit HTTPS endpoint for a self-hosted deployment.
  if (import.meta.env.PROD && /^http:\/\//i.test(base)) {
    throw new Error('VITE_API_BASE must use HTTPS in production')
  }
  return base
}

const BASE = configuredApiBase()
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
  /** Server-directed retry delay, when a rate-limited response supplied Retry-After. */
  retryAfterMs?: number
  constructor(status: number, code: string, details: Record<string, unknown> = {}, retryAfter?: number) {
    super(code)
    this.status = status
    this.code = code
    this.details = details
    this.retryAfterMs = retryAfter
  }
}

interface ReqOpts {
  method?: string
  body?: unknown
  auth?: boolean // attach Bearer (default true)
  retryRateLimit?: boolean // default true; polling opts out so a 429 only skips one beat
  keepalive?: boolean
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
    keepalive: opts.keepalive,
  })
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

// The backend rate-limits globally (100 req/min). Importing a plan reconciles as
// hundreds of per-set writes, so a single import blows through the window. A 429 is
// rejected before the handler runs — the request did NOT take effect — so retrying is
// safe. Back off on the server's Retry-After / RateLimit-Reset hint (capped) a bounded
// number of times so a large import rides through the limit slowly instead of failing.
const MAX_RATE_LIMIT_RETRIES = 6
function directedRetryAfterMs(res: Response): number | undefined {
  const raw = res.headers.get('Retry-After') ?? res.headers.get('RateLimit-Reset')
  if (raw === null) return undefined
  const secs = Number(raw)
  const dateWait = !Number.isFinite(secs) ? Date.parse(raw) - Date.now() : NaN
  const wait = Number.isFinite(secs) && secs > 0
    ? secs * 1000
    : Number.isFinite(dateWait) && dateWait > 0 ? dateWait : undefined
  return wait === undefined ? undefined : Math.min(wait, 60_000)
}

function retryAfterMs(res: Response): number {
  return directedRetryAfterMs(res) ?? 2000
}

// raw() + bounded 429 backoff. Shared by request() AND refreshTokens() so a rate-limited
// refresh isn't mistaken for an invalid token (which would wipe a good session mid-import).
async function rawRetrying(path: string, opts: ReqOpts): Promise<Response> {
  let res = await raw(path, opts)
  if (opts.retryRateLimit === false) return res
  for (let i = 0; res.status === 429 && i < MAX_RATE_LIMIT_RETRIES; i++) {
    await sleep(retryAfterMs(res))
    res = await raw(path, opts)
  }
  return res
}

let refreshPromise: Promise<boolean> | null = null

async function refreshTokens(): Promise<boolean> {
  // Refresh tokens are rotated by the backend. A page often has several
  // authenticated requests in flight on boot, so every 401 must join the same
  // refresh rather than replay the old token and revoke the new session.
  if (refreshPromise) return refreshPromise
  const refreshToken = getRefreshToken()
  if (!refreshToken) return false

  const task = (async () => {
    const res = await rawRetrying('/auth/refresh', { method: 'POST', body: { refreshToken }, auth: false })
    if (res.status === 429) return false // keep a valid session on a temporary limiter failure
    if (!res.ok) {
      // A logout or another login may have replaced the token while this
      // request was in flight. Never clear that newer session.
      if (getRefreshToken() === refreshToken) clearTokens()
      return false
    }
    const tokens = (await res.json()) as TokenPair
    if (getRefreshToken() !== refreshToken) {
      // The caller will retry using the session which superseded this one.
      return getAccessToken() != null
    }
    setTokens(tokens)
    return true
  })()
  refreshPromise = task
  try {
    return await task
  } finally {
    if (refreshPromise === task) refreshPromise = null
  }
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
    const directedRetry = res.status === 429 && res.headers.has('Retry-After')
      ? directedRetryAfterMs(res)
      : undefined
    throw new ApiException(res.status, code, details, directedRetry)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export const api = {
  get: <T>(p: string, opts: Pick<ReqOpts, 'retryRateLimit'> = {}) => request<T>(p, opts),
  post: <T>(p: string, body?: unknown, opts: Pick<ReqOpts, 'retryRateLimit'> = {}) =>
    request<T>(p, { ...opts, method: 'POST', body }),
  put: <T>(p: string, body?: unknown, opts: Pick<ReqOpts, 'retryRateLimit' | 'keepalive'> = {}) =>
    request<T>(p, { ...opts, method: 'PUT', body }),
  patch: <T>(p: string, body?: unknown) => request<T>(p, { method: 'PATCH', body }),
  del: <T>(p: string) => request<T>(p, { method: 'DELETE' }),
}
