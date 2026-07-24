import { describe, expect, it } from 'vitest'
import type { PlanWithChildren } from '../../api/types'
import { mapPlanToWeeks, relabelWeeksForStartDate, type Catalog } from './mapping'

function plan(): PlanWithChildren {
  return {
    id: 'plan', coach_id: 'coach', trainee_id: 'student', name: '计划',
    start_date: '2026-01-01', end_date: '2026-01-07', plan_weeks: 1,
    source: 'coach', source_template_id: null, status: 'published', kind: 'regular',
    created_at: '', updated_at: '', total_shift_days: 2, latest_shift_created_at: '2026-01-02T00:00:00Z',
    days: [
      {
        id: 'shifted', plan_id: 'plan', day_of_week: 1, week_number: 1, sort_order: 0,
        shifted_to_date: '2026-01-03', exercises: [],
      },
      {
        id: 'same', plan_id: 'plan', day_of_week: 2, week_number: 1, sort_order: 1,
        shifted_to_date: '2026-01-02', exercises: [],
      },
      {
        id: 'null', plan_id: 'plan', day_of_week: 3, week_number: 1, sort_order: 2,
        shifted_to_date: null, exercises: [],
      },
    ],
  }
}

describe('mapPlanToWeeks shifted dates', () => {
  const catalog: Catalog = new Map()

  it('uses a differing shifted_to_date and carries its ordinal-date delta', () => {
    expect(mapPlanToWeeks(plan(), catalog)[0].days[0]).toMatchObject({
      dowLabel: '周六',
      dateLabel: '1/3',
      shiftedToDate: '2026-01-03',
      shiftBadge: { originalDate: '2026-01-01', days: 2 },
    })
  })

  it('does not mark equal or null shifted_to_date values', () => {
    const days = mapPlanToWeeks(plan(), catalog)[0].days
    expect(days[1]).toMatchObject({
      dowLabel: '周五', dateLabel: '1/2', shiftedToDate: null, shiftBadge: null,
    })
    expect(days[2]).toMatchObject({
      dowLabel: '周六', dateLabel: '1/3', shiftedToDate: null, shiftBadge: null,
    })
  })

  it('returns to ordinal labels and clears the server snapshot after a start-date relabel', () => {
    const relabelled = relabelWeeksForStartDate(mapPlanToWeeks(plan(), catalog), '2026-02-02')
    expect(relabelled[0].days[0]).toMatchObject({
      dowLabel: '周一', dateLabel: '2/2', shiftedToDate: null, shiftBadge: null,
    })
  })

  it('computes the delta across month and year boundaries', () => {
    const p = plan()
    p.start_date = '2025-12-29'
    p.end_date = '2026-01-04'
    p.days = [{
      id: 'ny', plan_id: 'plan', day_of_week: 3, week_number: 1, sort_order: 0,
      shifted_to_date: '2026-01-02', exercises: [],
    }]
    // ordinal date 2025-12-31 → shifted into the next year
    expect(mapPlanToWeeks(p, catalog)[0].days[2]).toMatchObject({
      dowLabel: '周五',
      dateLabel: '1/2',
      shiftedToDate: '2026-01-02',
      shiftBadge: { originalDate: '2025-12-31', days: 2 },
    })
  })
})
