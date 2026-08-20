export type Locale = 'zh' | 'en'

let cachedLocale: Locale | undefined

// Only the overseas deployment consults the browser language. Everything else
// (the CN IP, future domestic domains, localhost dev) is hard-anchored to
// Chinese: a CN coach must see Chinese no matter how their browser is set.
const OVERSEAS_HOSTS = new Set(['coach.meetpr.app', 'api.meetpr.app'])

export function resolveLocale(): Locale {
  if (cachedLocale) return cachedLocale
  // ?lang=en / ?lang=zh wins over everything — QA and demos on either side.
  const forced = typeof window === 'undefined'
    ? null
    : new URLSearchParams(window.location.search).get('lang')
  if (forced === 'en' || forced === 'zh') {
    cachedLocale = forced
    return cachedLocale
  }
  const hostname = typeof window === 'undefined' ? '' : window.location.hostname
  if (!OVERSEAS_HOSTS.has(hostname)) {
    cachedLocale = 'zh'
    return cachedLocale
  }
  const language = typeof navigator === 'undefined' ? '' : navigator.language
  cachedLocale = /^zh/i.test(language) ? 'zh' : 'en'
  return cachedLocale
}

export function setLocale(locale: Locale | undefined): void {
  cachedLocale = locale
}

