import { describe, expect, it } from 'vitest'
import type { PlanResponse } from '../../api/types'
import { isStudentPendingNextWeek, nextWeekRange } from './pendingPlan'

function plan(overrides: Partial<PlanResponse> = {}): PlanResponse {
  return {
    id: 'plan',
    coach_id: 'coach',
    trainee_id: 'student',
    name: '计划',
    start_date: '2026-08-03',
    end_date: '2026-08-09',
    plan_weeks: 1,
    source: 'coach',
    source_template_id: null,
    status: 'published',
    kind: 'regular',
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    total_shift_days: 0,
    latest_shift_created_at: null,
    ...overrides,
  }
}

describe('isStudentPendingNextWeek', () => {
  const monday = new Date(2026, 6, 27, 12)

  it('always targets the following Monday through Sunday', () => {
    expect(nextWeekRange(monday)).toEqual({ monday: '2026-08-03', sunday: '2026-08-09' })
    expect(nextWeekRange(new Date(2026, 7, 2, 12))).toEqual({ monday: '2026-08-03', sunday: '2026-08-09' })
  })

  it('is not pending when a published plan overlaps any day next week', () => {
    expect(isStudentPendingNextWeek([plan({ start_date: '2026-07-20', end_date: '2026-08-03' })], monday)).toBe(false)
    expect(isStudentPendingNextWeek([plan({ start_date: '2026-08-09', end_date: '2026-08-16' })], monday)).toBe(false)
  })

  it('is pending for gaps, drafts, completed plans, and an empty plan list', () => {
    expect(isStudentPendingNextWeek([], monday)).toBe(true)
    expect(isStudentPendingNextWeek([plan({ end_date: '2026-08-02' })], monday)).toBe(true)
    expect(isStudentPendingNextWeek([plan({ start_date: '2026-08-10' })], monday)).toBe(true)
    expect(isStudentPendingNextWeek([plan({ status: 'draft' })], monday)).toBe(true)
    expect(isStudentPendingNextWeek([plan({ status: 'completed' })], monday)).toBe(true)
  })
})
