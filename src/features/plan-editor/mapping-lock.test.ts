import { describe, expect, it } from 'vitest'
import type { PlanWithChildren } from '../../api/types'
import { mapPlanToWeeks, type Catalog } from './mapping'

function plan(hasLogs?: boolean): PlanWithChildren {
  return {
    id: 'p', coach_id: 'c', trainee_id: 't', name: 'p', start_date: '2026-01-01',
    end_date: '2026-01-07', plan_weeks: 1, source: 'coach', source_template_id: null,
    status: 'draft', kind: 'regular', created_at: '', updated_at: '',
    days: [{
      id: 'd', plan_id: 'p', day_of_week: 1, week_number: 1, sort_order: 0,
      exercises: [{
        id: 'pe', plan_day_id: 'd', exercise_id: 'ex', is_main_lift: false,
        sort_order: 4, ...(hasLogs === undefined ? {} : { has_logs: hasLogs }), notes: null, sets: [],
      }],
    }],
  }
}

describe('mapPlanToWeeks history-lock wire compatibility', () => {
  const catalog: Catalog = new Map([['ex', { name: '深蹲', custom: false }]])

  it('injects plan_exercise id and sort_order into the row model', () => {
    expect(mapPlanToWeeks(plan(true), catalog)[0].days[0].rows[0]).toMatchObject({
      serverRowId: 'pe', serverSortOrder: 4, hasLogs: true,
    })
  })

  it('treats a missing pre-rollout has_logs field as false without crashing', () => {
    expect(mapPlanToWeeks(plan(), catalog)[0].days[0].rows[0].hasLogs).toBe(false)
  })
})
