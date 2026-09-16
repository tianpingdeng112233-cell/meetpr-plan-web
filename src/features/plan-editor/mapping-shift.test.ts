import { describe, expect, it } from 'vitest'
import type { PlanWithChildren } from '../../api/types'
import {
  mapPlanToWeeks,
  planShiftNoticeText,
  relabelWeeksForStartDate,
  type Catalog,
} from './mapping'

function plan(): PlanWithChildren {
  return {
    id: 'plan', coach_id: 'coach', trainee_id: 'student', name: '计划',
    start_date: '2026-01-01', end_date: '2026-01-07', plan_weeks: 1,
    source: 'coach', source_template_id: null, status: 'published', kind: 'regular',
    created_at: '', updated_at: '', total_shift_days: 2, latest_shift_created_at: '2026-01-02T00:00:00Z', latest_shift: null,
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

  it('maps the effective dates, badge delta, and week range after stacked shifts', () => {
    const p = plan()
    p.days = [
      {
        id: 'first', plan_id: 'plan', day_of_week: 1, week_number: 1, sort_order: 0,
        shifted_to_date: '2026-01-04', exercises: [],
      },
      {
        id: 'last', plan_id: 'plan', day_of_week: 7, week_number: 1, sort_order: 1,
        shifted_to_date: '2026-01-10', exercises: [],
      },
    ]

    const mapped = mapPlanToWeeks(p, catalog)[0]
    expect(mapped.range).toBe('1/2 – 1/10')
    expect(mapped.days[0]).toMatchObject({
      dowLabel: '周日', dateLabel: '1/4', shiftBadge: { originalDate: '2026-01-01', days: 3 },
    })
    expect(mapped.days[6]).toMatchObject({
      dowLabel: '周六', dateLabel: '1/10', shiftBadge: { originalDate: '2026-01-07', days: 3 },
    })
  })

  it('uses the earliest effective training date when a completed day sits between shifted days', () => {
    const p = plan()
    p.days = [
      {
        id: 'first', plan_id: 'plan', day_of_week: 1, week_number: 1, sort_order: 0,
        shifted_to_date: '2026-01-04', exercises: [],
      },
      {
        id: 'completed', plan_id: 'plan', day_of_week: 2, week_number: 1, sort_order: 1,
        shifted_to_date: null, completed_at: '2026-01-02T08:00:00Z', exercises: [],
      },
      {
        id: 'last', plan_id: 'plan', day_of_week: 7, week_number: 1, sort_order: 2,
        shifted_to_date: '2026-01-10', exercises: [],
      },
    ]

    expect(mapPlanToWeeks(p, catalog)[0].range).toBe('1/2 – 1/10')
  })

  it('derives the plan-shift chip copy from the latest actor and batch', () => {
    expect(planShiftNoticeText(3, {
      batch_id: 'coach-batch', actor_role: 'coach', anchor_date: '2026-01-03',
      offset_days: 2, created_at: '2026-01-02T00:00:00Z',
    })).toBe('已后移 2 天 · 1/3 起')
    expect(planShiftNoticeText(3, {
      batch_id: 'student-batch', actor_role: 'coached_student', anchor_date: '2026-01-01',
      offset_days: 2, created_at: '2026-01-01T00:00:00Z',
    })).toBe('学员曾顺延 2 天')
    expect(planShiftNoticeText(0, null)).toBeNull()
  })
})
