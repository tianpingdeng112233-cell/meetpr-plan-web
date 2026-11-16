import type { PlanResponse } from '../../api/types'

/** Only the nearest earlier non-draft block belonging to this student. */
export function selectPreviousCycle(plans: readonly PlanResponse[], current: PlanResponse): PlanResponse | null {
  return plans.filter(plan => plan.id !== current.id && plan.trainee_id === current.trainee_id
    && plan.status !== 'draft' && plan.start_date < current.start_date)
    .sort((a, b) => b.start_date.localeCompare(a.start_date)
      || (b.published_at ?? '').localeCompare(a.published_at ?? '')
      || a.id.localeCompare(b.id))[0] ?? null
}
