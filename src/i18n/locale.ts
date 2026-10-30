export type Locale = 'zh' | 'zh-Hant' | 'en'

let cachedLocale: Locale | undefined

// Domestic hosts stay Chinese; Traditional browsers select Taiwan copy.
// Only overseas hosts use English for non-Chinese browsers.
const OVERSEAS_HOSTS = new Set(['coach.meetpr.app', 'api.meetpr.app'])

export function resolveLocale(): Locale {
  if (cachedLocale) return cachedLocale
  // ?lang=en / ?lang=zh / ?lang=zh-Hant wins over everything — QA and demos on either side.
  const forced = typeof window === 'undefined'
    ? null
    : new URLSearchParams(window.location.search).get('lang')
  if (forced === 'en' || forced === 'zh' || forced === 'zh-Hant') {
    setLocale(forced)
    return cachedLocale!
  }
  const hostname = typeof window === 'undefined' ? '' : window.location.hostname
  const language = typeof navigator === 'undefined' ? '' : navigator.language
  if (/^zh-(?:Hant(?:-|$)|TW(?:-|$)|HK(?:-|$)|MO(?:-|$))/i.test(language)) {
    setLocale('zh-Hant')
    return cachedLocale!
  }
  if (!OVERSEAS_HOSTS.has(hostname)) {
    setLocale('zh')
    return cachedLocale!
  }
  setLocale(/^zh/i.test(language) ? 'zh' : 'en')
  return cachedLocale!
}

export function setLocale(locale: Locale | undefined): void {
  cachedLocale = locale
  if (locale && typeof document !== 'undefined') {
    document.documentElement.lang = locale === 'zh' ? 'zh-Hans' : locale
    // Keep the existing HTML title for Simplified Chinese and English.
    document.title = locale === 'zh-Hant' ? 'MeetPR 課表編輯器' : 'MeetPR 计划编辑器'
  }
}

export function localeTag(): 'zh-Hans' | 'zh-Hant' | 'en' {
  const locale = resolveLocale()
  return locale === 'zh' ? 'zh-Hans' : locale
}
