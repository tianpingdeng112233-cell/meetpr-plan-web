export type Locale = 'zh' | 'en'

let cachedLocale: Locale | undefined

export function resolveLocale(): Locale {
  if (cachedLocale) return cachedLocale
  // ?lang=en / ?lang=zh wins over the browser language — lets a coach (or a
  // reviewer on a Chinese-locale machine) force either UI for a session.
  const forced = typeof window === 'undefined'
    ? null
    : new URLSearchParams(window.location.search).get('lang')
  if (forced === 'en' || forced === 'zh') {
    cachedLocale = forced
    return cachedLocale
  }
  const language = typeof navigator === 'undefined' ? '' : navigator.language
  cachedLocale = /^zh/i.test(language) ? 'zh' : 'en'
  return cachedLocale
}

export function setLocale(locale: Locale): void {
  cachedLocale = locale
}

