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
