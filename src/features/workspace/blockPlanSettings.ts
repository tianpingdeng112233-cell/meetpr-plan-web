import { nearestWeekdayISO } from '../plan-editor/components/PlanCalendarControls'

export function orderedWeekdays(days: readonly number[], first: number): number[] {
  return [...new Set(days)].filter(day => Number.isInteger(day) && day >= 0 && day < 7)
    .sort((a, b) => ((a - first + 7) % 7) - ((b - first + 7) % 7))
}
export const defaultFirstDate = nearestWeekdayISO

// View metadata is deliberately separate from the plan tree and v3 snapshot schema.
// Empty cells are reconstructed from this pattern plus the server's start_date/plan_weeks.
const key = (planId: string) => `meetpr.plan-editor.weekdays.${planId}`
export function loadBlockWeekdays(planId?: string): number[] | null {
  if (!planId) return null
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key(planId)) ?? 'null')
    return Array.isArray(value) && value.length > 0 && value.length <= 7
      && value.every(day => Number.isInteger(day) && day >= 0 && day < 7) ? value : null
  } catch { return null }
}
export function saveBlockWeekdays(planId: string | undefined, days: readonly number[]): boolean {
  if (!planId) return true
  try { localStorage.setItem(key(planId), JSON.stringify(days)); return true } catch { return false }
}


// Extra columns are view metadata, separate from the fixed weekly pattern.
export function loadBlockExtraWeekdays(planId?: string): number[] {
  if (!planId) return []
  try {
    const value: unknown = JSON.parse(localStorage.getItem(`meetpr.plan-editor.extra-weekdays.${planId}`) ?? '[]')
    return Array.isArray(value) && value.length <= 7 && value.every(day => Number.isInteger(day) && day >= 0 && day < 7) ? value : []
  } catch { return [] }
}
export function saveBlockExtraWeekdays(planId: string | undefined, days: readonly number[]): boolean {
  if (!planId) return true
  try { localStorage.setItem(`meetpr.plan-editor.extra-weekdays.${planId}`, JSON.stringify(days)); return true } catch { return false }
}
