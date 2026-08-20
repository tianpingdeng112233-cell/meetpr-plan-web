import { describe, expect, it } from 'vitest'
import type { PlanDayResponse, PlanWithChildren } from '../../api/types'
import { deriveStudentPlanCursor } from './mapping'

function day(
  id: string,
  weekNumber: number,
  dayOfWeek: number,
  completedAt: string | null,
  shiftedToDate: string | null = null,
): PlanDayResponse {
  return {
    id,
    plan_id: 'plan',
    week_number: weekNumber,
    day_of_week: dayOfWeek,
    sort_order: 0,
    shifted_to_date: shiftedToDate,
    completed_at: completedAt,
    completion_source: completedAt ? 'student' : null,
    exercises: [],
  }
}

function plan(days: PlanDayResponse[], status: PlanWithChildren['status'] = 'published'): PlanWithChildren {
  return {
    id: 'plan', coach_id: 'coach', trainee_id: 'student', name: '计划',
    start_date: '2026-08-03', end_date: '2026-08-30', plan_weeks: 4,
    source: 'coach', source_template_id: null, status, kind: 'regular',
    created_at: '', updated_at: '', total_shift_days: 0, latest_shift_created_at: null,
    days,
  }
}

describe('deriveStudentPlanCursor', () => {
  it('sorts by week and weekday instead of input order or the browser clock', () => {
    const source = plan([
      day('w2d1', 2, 1, null),
      day('w1d5', 1, 5, null),
      day('w1d1', 1, 1, '2026-08-03T10:00:00Z'),
    ])

    expect(deriveStudentPlanCursor(source, '2026-08-04')).toMatchObject({
      kind: 'day', dayId: 'w1d5', weekNumber: 1, dayOrdinal: 2,
    })
    expect(deriveStudentPlanCursor(source, '2030-01-01')).toMatchObject({
      kind: 'day', dayId: 'w1d5', weekNumber: 1, dayOrdinal: 2,
    })
  })

  it('uses shifted_to_date for cross-week lag and falls back to the shared start-date calendar', () => {
    const shifted = deriveStudentPlanCursor(
      plan([day('shifted', 2, 2, null, '2026-08-14')]),
      '2026-08-21',
    )
    expect(shifted).toEqual({
      kind: 'day', dayId: 'shifted', weekNumber: 2, dayOrdinal: 1,
      calendarDate: '2026-08-14', lagDays: 7,
    })

    const ordinal = deriveStudentPlanCursor(plan([day('ordinal', 2, 2, null)]), '2026-08-21')
    expect(ordinal).toMatchObject({ calendarDate: '2026-08-11', lagDays: 10 })
  })

  it('keeps same-weekday server order stable and gives duplicates one visible D ordinal', () => {
    const source = plan([
      day('same-first', 1, 3, '2026-08-05T10:00:00Z'),
      day('same-second', 1, 3, null),
      day('later', 1, 6, null),
    ])
    expect(deriveStudentPlanCursor(source, '2026-08-05')).toMatchObject({
      dayId: 'same-second', weekNumber: 1, dayOrdinal: 1,
    })
  })

  it('reports all completed and has no cursor without published days', () => {
    expect(deriveStudentPlanCursor(plan([
      day('one', 1, 1, '2026-08-03T10:00:00Z'),
      day('two', 1, 3, '2026-08-05T10:00:00Z'),
    ]))).toEqual({ kind: 'completed' })
    expect(deriveStudentPlanCursor(plan([]))).toBeNull()
    expect(deriveStudentPlanCursor(plan([day('draft', 1, 1, null)], 'draft'))).toBeNull()
  })

  it('hides the cursor when any legacy day omits completed_at', () => {
    const legacy = day('legacy', 1, 1, null)
    delete legacy.completed_at
    expect(deriveStudentPlanCursor(plan([
      day('known', 1, 2, null),
      legacy,
    ]))).toBeNull()
  })
})
