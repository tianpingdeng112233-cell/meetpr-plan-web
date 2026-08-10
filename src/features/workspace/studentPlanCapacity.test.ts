import { describe, expect, it } from 'vitest'
import type { PlanResponse } from '../../api/types'
import type { Week } from '../plan-editor/types'
import { latestCapacityPlan, locateCapacityWeek } from './studentPlanCapacity'

function week(num: number, content = true): Week {
  return {
    num,
    num2: String(num).padStart(2, '0'),
    range: '',
    isCurrent: false,
    vol: '',
    days: [{
      dow: 0,
      dowLabel: '周一',
      dateLabel: '',
      rest: !content,
      rows: content ? [{
        id: `row-${num}`,
        serverRowId: null,
        serverSortOrder: null,
        hasLogs: false,
        conflictMessage: null,
        exerciseId: 'exercise',
        name: '动作',
        ku: true,
        custom: false,
        isMain: true,
        target: null,
        aux: false,
        reps: '5',
        mode: 'kg',
        boxes: [{ val: '100', empty: false }],
        note: '',
      }] : [],
    }],
  }
}

function plan(id: string, status: PlanResponse['status'], updatedAt: string): PlanResponse {
  return {
    id,
    coach_id: 'coach',
    trainee_id: 'student',
    name: id,
    start_date: '2026-01-05',
    end_date: '2026-01-25',
    plan_weeks: 3,
    source: 'coach',
    source_template_id: null,
    status,
    kind: 'regular',
    created_at: updatedAt,
    updated_at: updatedAt,
    total_shift_days: 0,
    latest_shift_created_at: null,
  }
}

describe('student plan capacity selection', () => {
  it('uses the calendar week while the plan is in progress', () => {
    expect(locateCapacityWeek([week(1), week(2), week(3)], '2026-01-05', '2026-01-15')?.num).toBe(2)
  })

  it('uses the earliest contentful week before the plan begins', () => {
    expect(locateCapacityWeek([week(1, false), week(2), week(3)], '2026-01-05', '2025-12-20')?.num).toBe(2)
  })

  it('uses the latest contentful week after the plan ends', () => {
    expect(locateCapacityWeek([week(1), week(2), week(3, false)], '2026-01-05', '2026-02-20')?.num).toBe(2)
  })

  it('keeps an empty current calendar week (honest zero capacity) when other weeks have content', () => {
    expect(locateCapacityWeek([week(1), week(2, false), week(3)], '2026-01-05', '2026-01-15')?.num).toBe(2)
  })

  it('returns no capacity week for an empty plan', () => {
    expect(locateCapacityWeek([week(1, false), week(2, false)], '2026-01-05', '2026-01-08')).toBeNull()
  })

  it('prefers the latest published plan, then falls back to the latest plan', () => {
    expect(latestCapacityPlan([
      plan('new-draft', 'draft', '2026-03-01T00:00:00Z'),
      plan('old-live', 'published', '2026-01-01T00:00:00Z'),
      plan('new-live', 'published', '2026-02-01T00:00:00Z'),
    ])?.id).toBe('new-live')
    expect(latestCapacityPlan([
      plan('old-draft', 'draft', '2026-01-01T00:00:00Z'),
      plan('new-completed', 'completed', '2026-02-01T00:00:00Z'),
    ])?.id).toBe('new-completed')
  })
})
