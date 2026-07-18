import type { PlanResponse } from '../../api/types'
import type { Week } from '../plan-editor/types'

function updatedAt(plan: PlanResponse): number {
  const value = new Date(plan.updated_at).getTime()
  return Number.isFinite(value) ? value : 0
}

/** Prefer the most recently updated live plan; fall back to the latest plan of any status. */
export function latestCapacityPlan(plans: PlanResponse[]): PlanResponse | null {
  const published = plans.filter((plan) => plan.status === 'published')
  const candidates = published.length > 0 ? published : plans
  return candidates.reduce<PlanResponse | null>((latest, plan) => (
    !latest || updatedAt(plan) > updatedAt(latest) ? plan : latest
  ), null)
}

function isoDay(iso: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return null
  const [, year, month, day] = match.map(Number)
  const value = Date.UTC(year, month - 1, day) / 86_400_000
  return Number.isFinite(value) ? value : null
}

export function weekHasPlanContent(week: Week): boolean {
  return week.days.some((day) => day.rows.length > 0)
}

/**
 * Pick the calendar week while a plan is running. Before/after its calendar,
 * use the nearest week that actually contains a planned exercise.
 */
export function locateCapacityWeek(weeks: Week[], startDate: string, today: string): Week | null {
  const contentful = weeks.filter(weekHasPlanContent).sort((a, b) => a.num - b.num)
  if (contentful.length === 0) return null

  const startDay = isoDay(startDate)
  const todayDay = isoDay(today)
  if (startDay == null || todayDay == null) return contentful[0]

  const weekNumber = Math.floor((todayDay - startDay) / 7) + 1
  const firstWeek = Math.min(...weeks.map((week) => week.num))
  const lastWeek = Math.max(...weeks.map((week) => week.num))
  if (weekNumber >= firstWeek && weekNumber <= lastWeek) {
    return weeks.find((week) => week.num === weekNumber) ?? null
  }
  return weekNumber < firstWeek ? contentful[0] : contentful[contentful.length - 1]
}
