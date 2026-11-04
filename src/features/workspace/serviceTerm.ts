import { S } from '../../i18n/strings'

export interface ServiceTerm {
  daysLeft: number
  tone: 'gray' | 'yellow' | 'red'
  label: string
  shortLabel: string
}

export function localDate(date = new Date()): string {
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// UTC is only a calendar-day ordinal here, never a parsed date-only string.
// Both inputs supply local year/month/day components, so DST cannot add a day.
function dayOrdinal(value: string): number {
  const [year, month, day] = value.split('-').map(Number)
  return Date.UTC(year, month - 1, day) / 86_400_000
}

export function getServiceTerm(until: string | null | undefined, today = new Date()): ServiceTerm | null {
  if (!until) return null
  const daysLeft = dayOrdinal(until) - dayOrdinal(localDate(today))
  const copy = S.workspace.serviceTerm
  return {
    daysLeft,
    tone: daysLeft > 7 ? 'gray' : daysLeft > 3 ? 'yellow' : 'red',
    label: daysLeft > 0 ? copy.remaining(daysLeft) : daysLeft === 0 ? copy.today : copy.expired(-daysLeft),
    shortLabel: daysLeft > 0 ? copy.shortRemaining(daysLeft) : daysLeft === 0 ? copy.shortToday : copy.shortExpired(-daysLeft),
  }
}

export function addServiceMonths(base: string, months: number): string {
  const [year, month, day] = base.split('-').map(Number)
  const last = new Date(year, month + months, 0)
  return localDate(new Date(last.getFullYear(), last.getMonth(), Math.min(day, last.getDate())))
}
