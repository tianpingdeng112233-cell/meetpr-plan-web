import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, ApiException } from './client'

function res(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

describe('request 429 retry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    })
  })
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

  it('backs off on 429 then succeeds (write is not lost)', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(res(429, { error: 'rate_limited' }, { 'Retry-After': '1' }))
      .mockResolvedValueOnce(res(429, { error: 'rate_limited' }, { 'Retry-After': '1' }))
      .mockResolvedValueOnce(res(201, { id: 'set-1' }))
    vi.stubGlobal('fetch', fetchMock)

    const p = api.post<{ id: string }>('/plans/exercises/x/sets', { reps: 5 })
    await vi.runAllTimersAsync()
    await expect(p).resolves.toEqual({ id: 'set-1' })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('refreshes the token when a 401 surfaces after a 429 backoff', async () => {
    localStorage.setItem('mpw.accessToken', 'stale')
    localStorage.setItem('mpw.refreshToken', 'refresh-1')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(res(429, { error: 'rate_limited' }, { 'Retry-After': '1' })) // limited
      .mockResolvedValueOnce(res(401, { error: 'AUTH_INVALID_TOKEN' }))                    // token expired mid-wait
      .mockResolvedValueOnce(res(200, { accessToken: 'fresh', refreshToken: 'refresh-2' })) // refresh
      .mockResolvedValueOnce(res(201, { id: 'set-1' }))                                     // retried write
    vi.stubGlobal('fetch', fetchMock)

    const p = api.post<{ id: string }>('/plans/exercises/x/sets', { reps: 5 })
    await vi.runAllTimersAsync()
    await expect(p).resolves.toEqual({ id: 'set-1' })
    expect(localStorage.getItem('mpw.accessToken')).toBe('fresh')
  })

  it('shares one refresh across concurrent 401 responses', async () => {
    localStorage.setItem('mpw.accessToken', 'stale')
    localStorage.setItem('mpw.refreshToken', 'refresh-1')
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.endsWith('/auth/refresh')) {
        return Promise.resolve(res(200, { accessToken: 'fresh', refreshToken: 'refresh-2' }))
      }
      const headers = init?.headers as Record<string, string> | undefined
      return Promise.resolve(headers?.Authorization === 'Bearer stale'
        ? res(401, { error: 'AUTH_INVALID_TOKEN' })
        : res(200, { ok: true }))
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(Promise.all([api.get('/coach/students'), api.get('/exercises')]))
      .resolves.toEqual([{ ok: true }, { ok: true }])

    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/auth/refresh'))).toHaveLength(1)
    expect(localStorage.getItem('mpw.refreshToken')).toBe('refresh-2')
  })

  it('backs off when the refresh itself is rate-limited, then completes', async () => {
    localStorage.setItem('mpw.accessToken', 'stale')
    localStorage.setItem('mpw.refreshToken', 'refresh-1')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(res(401, { error: 'AUTH_INVALID_TOKEN' }))                    // write: token expired
      .mockResolvedValueOnce(res(429, { error: 'rate_limited' }, { 'Retry-After': '1' }))  // refresh: limited
      .mockResolvedValueOnce(res(200, { accessToken: 'fresh', refreshToken: 'refresh-2' })) // refresh: ok
      .mockResolvedValueOnce(res(201, { id: 'set-1' }))                                     // retried write
    vi.stubGlobal('fetch', fetchMock)

    const p = api.post<{ id: string }>('/plans/exercises/x/sets', { reps: 5 })
    await vi.runAllTimersAsync()
    await expect(p).resolves.toEqual({ id: 'set-1' })
    expect(localStorage.getItem('mpw.accessToken')).toBe('fresh')
  })

  it('does not wipe a valid session when the refresh stays rate-limited', async () => {
    localStorage.setItem('mpw.accessToken', 'stale')
    localStorage.setItem('mpw.refreshToken', 'refresh-1')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(res(401, { error: 'AUTH_INVALID_TOKEN' })) // write: token expired
      .mockResolvedValue(res(429, { error: 'rate_limited' }, { 'Retry-After': '1' })) // refresh: always limited
    vi.stubGlobal('fetch', fetchMock)

    const p = api.post('/plans/exercises/x/sets', { reps: 5 })
    const assertion = expect(p).rejects.toMatchObject({ status: 401 })
    await vi.runAllTimersAsync()
    await assertion
    expect(localStorage.getItem('mpw.refreshToken')).toBe('refresh-1') // session preserved, not logged out
  })

  it('gives up after the retry cap and throws the 429', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(429, { error: 'rate_limited' }, { 'Retry-After': '1' }))
    vi.stubGlobal('fetch', fetchMock)

    const p = api.post('/plans/exercises/x/sets', { reps: 5 })
    const assertion = expect(p).rejects.toMatchObject({ status: 429 } satisfies Partial<ApiException>)
    await vi.runAllTimersAsync()
    await assertion
    expect(fetchMock).toHaveBeenCalledTimes(7) // 1 initial + 6 retries
  })
})
