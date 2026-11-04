import { afterEach, expect, it } from 'vitest'
import { setLocale } from '../../i18n/strings'
import { addServiceMonths, getServiceTerm, localDate } from './serviceTerm'

afterEach(() => setLocale('zh'))
const today = new Date(2026, 10, 4, 23, 59)
it.each([
  ['2026-11-12', 8, 'gray'], ['2026-11-11', 7, 'yellow'], ['2026-11-08', 4, 'yellow'],
  ['2026-11-07', 3, 'red'], ['2026-11-05', 1, 'red'], ['2026-11-04', 0, 'red'], ['2026-11-03', -1, 'red'],
] as const)('classifies %s by local calendar days in all three languages', (until, n, tone) => {
  const labels = {
    zh: n > 0 ? `服务剩 ${n} 天` : n === 0 ? '服务今天到期' : '服务已过期 1 天',
    'zh-Hant': n > 0 ? `服務剩 ${n} 天` : n === 0 ? '服務今天到期' : '服務已過期 1 天',
    en: n > 0 ? `${n} days left` : n === 0 ? 'Ends today' : 'Ended 1 days ago',
  }
  const short = {
    zh: n > 0 ? `剩 ${n} 天` : n === 0 ? '今天到期' : '过期 1 天',
    'zh-Hant': n > 0 ? `剩 ${n} 天` : n === 0 ? '今天到期' : '過期 1 天',
    en: n > 0 ? `${n} d left` : n === 0 ? 'Ends today' : 'Ended 1 d ago',
  }
  for (const locale of ['zh', 'zh-Hant', 'en'] as const) {
    setLocale(locale)
    expect(getServiceTerm(until, today)).toEqual({ daysLeft: n, tone, label: labels[locale], shortLabel: short[locale] })
  }
})
it.each([
  ['2026-01-31', 1, '2026-02-28'], ['2024-01-31', 1, '2024-02-29'],
  ['2026-11-30', 3, '2027-02-28'], ['2026-12-15', 1, '2027-01-15'],
])('adds calendar months with month-end clamping: %s + %s', (base, months, result) => {
  expect(addServiceMonths(String(base), Number(months))).toBe(result)
})
it('uses local date components and ignores DST hour lengths', () => {
  expect(localDate(new Date(2026, 0, 1, 0, 1))).toBe('2026-01-01')
  expect(getServiceTerm('2026-03-30', new Date(2026, 2, 28, 23, 59))?.daysLeft).toBe(2)
  expect(getServiceTerm('2026-10-26', new Date(2026, 9, 24, 0, 1))?.daysLeft).toBe(2)
  expect(getServiceTerm(null, today)).toBeNull()
  expect(getServiceTerm(undefined, today)).toBeNull()
})
