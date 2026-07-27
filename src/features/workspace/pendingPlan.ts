import type { PlanResponse } from '../../api/types'
import { isoDate } from '../plan-editor/mapping'

export function nextWeekRange(reference = new Date()): { monday: string; sunday: string } {
  const daysUntilMonday = reference.getDay() === 0 ? 1 : 8 - reference.getDay()
  const mondayDate = new Date(reference)
  mondayDate.setDate(mondayDate.getDate() + daysUntilMonday)
  const sundayDate = new Date(mondayDate)
  sundayDate.setDate(sundayDate.getDate() + 6)
  return {
    monday: isoDate(mondayDate),
    sunday: isoDate(sundayDate),
  }
}

/**
 * The roster plan summary only exposes a plan's inclusive date range. A
 * published range overlapping any day next Monday–Sunday is therefore the
 * shared definition of “下周已排”.
 */
export function isStudentPendingNextWeek(plans: PlanResponse[], reference = new Date()): boolean {
  const { monday, sunday } = nextWeekRange(reference)
  return !plans.some((plan) => (
    plan.status === 'published'
    && plan.start_date <= sunday
    && plan.end_date >= monday
  ))
}
