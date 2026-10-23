import { afterEach, describe, expect, it } from 'vitest'
import { resolveLocale, setLocale, type Locale } from './locale'

// The module caches its answer, so each case resets via setLocale-then-clear:
// setLocale poisons the cache deliberately; resolving fresh needs a clean one.
function freshResolve(host: string, browserLanguage: string, search = ''): Locale {
  setLocale(undefined) // clear the cache
  const location = { hostname: host, search } as Location
  Object.defineProperty(window, 'location', { value: location, writable: true })
  Object.defineProperty(window.navigator, 'language', {
    value: browserLanguage,
    configurable: true,
  })
  return resolveLocale()
}

describe('resolveLocale host anchoring', () => {
  afterEach(() => {
    setLocale('zh') // restore the test-suite default pin
  })

  it('anchors the CN deployment to Chinese regardless of browser language', () => {
    expect(freshResolve('121.40.160.241', 'en-GB')).toBe('zh')
    expect(freshResolve('localhost', 'en-US')).toBe('zh')
  })

  it('resolves by browser language only on the overseas hosts', () => {
    expect(freshResolve('coach.meetpr.app', 'en-US')).toBe('en')
    expect(freshResolve('coach.meetpr.app', 'zh-CN')).toBe('zh')
    expect(freshResolve('api.meetpr.app', 'en-GB')).toBe('en')
  })

  it('lets ?lang= override everything on both sides', () => {
    expect(freshResolve('121.40.160.241', 'zh-CN', '?lang=en')).toBe('en')
    expect(freshResolve('coach.meetpr.app', 'en-US', '?lang=zh')).toBe('zh')
  })
})

describe('Traditional Chinese locale', () => {
  afterEach(() => setLocale('zh'))
  it.each(['zh-TW', 'zh-HK', 'zh-MO', 'zh-Hant', 'zh-Hant-TW', 'ZH-hant-hk'])(
    'uses Taiwan copy for %s on domestic and overseas hosts', language => {
      expect(freshResolve('meetpr.cn', language)).toBe('zh-Hant')
      expect(freshResolve('coach.meetpr.app', language)).toBe('zh-Hant')
    },
  )
  it('keeps domestic simplified anchoring and accepts the QA override', () => {
    expect(freshResolve('meetpr.cn', 'zh-CN')).toBe('zh')
    expect(freshResolve('meetpr.cn', 'en-US')).toBe('zh')
    expect(freshResolve('localhost', 'en-US', '?lang=zh-Hant')).toBe('zh-Hant')
  })
})

describe('document title on initial locale resolution', () => {
  afterEach(() => setLocale('zh'))

  it.each([
    ['meetpr.cn', 'zh-TW', '', 'MeetPR 課表編輯器'],
    ['localhost', 'en-US', '?lang=zh-Hant', 'MeetPR 課表編輯器'],
    ['meetpr.cn', 'zh-CN', '', 'MeetPR 计划编辑器'],
    ['coach.meetpr.app', 'en-US', '', 'MeetPR 计划编辑器'],
    ['meetpr.cn', 'zh-TW', '?lang=en', 'MeetPR 计划编辑器'],
  ])('sets the title for %s / %s / %s', (host, language, search, title) => {
    document.title = 'MeetPR 计划编辑器'
    freshResolve(host, language, search)
    expect(document.title).toBe(title)
  })

  it('restores the existing title when resolving another locale after Traditional Chinese', () => {
    freshResolve('meetpr.cn', 'zh-TW')
    expect(document.title).toBe('MeetPR 課表編輯器')
    freshResolve('meetpr.cn', 'zh-CN')
    expect(document.title).toBe('MeetPR 计划编辑器')
    freshResolve('meetpr.cn', 'zh-TW')
    freshResolve('coach.meetpr.app', 'en-US')
    expect(document.title).toBe('MeetPR 计划编辑器')
  })
})

it('sets the document language and sends X-MeetPR-Locale without overriding Accept-Language, including refresh and unauthenticated auth', async () => {
  const { request, setTokens, clearTokens } = await import('../api/client')
  const { requestPasswordReset } = await import('../api/password-reset')
  const { vi } = await import('vitest')
  const fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) })
  try {
    for (const [locale, tag] of [['zh', 'zh-Hans'], ['zh-Hant', 'zh-Hant'], ['en', 'en']] as const) {
      setLocale(locale)
      expect(document.documentElement.lang).toBe(tag)
      setTokens({ accessToken: 'old', refreshToken: 'refresh' })
      fetchMock.mockReset()
      fetchMock.mockResolvedValueOnce(new Response('{}', { status: 401 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ accessToken: 'new', refreshToken: 'next' })))
        .mockResolvedValueOnce(new Response('{}'))
      await request('/plans')
      expect(fetchMock).toHaveBeenCalledTimes(3)
      expect(fetchMock.mock.calls[1][0]).toBe('/api/auth/refresh')
      expect(new Headers(fetchMock.mock.calls[1][1].headers).has('Authorization')).toBe(false)
      clearTokens()
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
      await requestPasswordReset('coach@example.com')
      expect(fetchMock).toHaveBeenCalledTimes(4)
      expect(fetchMock.mock.calls[3][0]).toBe('/api/auth/email/forgot')
      expect(new Headers(fetchMock.mock.calls[3][1].headers).has('Authorization')).toBe(false)
      for (const [, options] of fetchMock.mock.calls) {
        const headers = new Headers(options.headers)
        expect(headers.has('Accept-Language')).toBe(false)
        expect(headers.get('X-MeetPR-Locale')).toBe(tag)
      }
    }
  } finally { clearTokens(); vi.unstubAllGlobals(); setLocale('zh') }
})
