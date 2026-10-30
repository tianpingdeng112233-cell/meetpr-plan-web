import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as plans from '../../api/plans'
import { reconcileImportedPlan, resizeServerPlanWeeks } from './reconcile'
import type { Week } from './types'
import { buildWeeks, type ParsedWeek } from './import'
import { ExerciseIndex } from './exerciseIndex'
import { planDayDateLabel } from './mapping'

vi.mock('../../api/plans')

function emptyWeek(num: number): Week {
  return {
    num,
    num2: String(num).padStart(2, '0'),
    range: '',
    isCurrent: false,
    vol: '',
    days: Array.from({ length: 7 }, (_, d) => ({ dow: d, dowLabel: '', dateLabel: '', rest: true, rows: [] })),
  }
}

describe('reconcileImportedPlan — align backend plan to the import', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(plans.patchPlan).mockResolvedValue({} as never)
    vi.mocked(plans.deleteDay).mockResolvedValue(undefined as never)
    vi.mocked(plans.batchDays).mockImplementation(async (_id, body) => ({
      id: 'p', status: 'draft', days: [], start_date: '2026-01-01', ...body.plan_patch,
    } as never))
  })

  it('batches out-of-range deletes with plan_weeks and source dates', async () => {
    // server plan is 14 weeks; import only the latest 12 → W13/W14 must be removed.
    vi.mocked(plans.getPlan).mockResolvedValue({
      id: 'p',
      plan_weeks: 14,
      start_date: '2026-01-01',
      days: [
        { id: 'd1', week_number: 1, day_of_week: 1, exercises: [] },
        { id: 'd13', week_number: 13, day_of_week: 1, exercises: [] },
        { id: 'd14', week_number: 14, day_of_week: 1, exercises: [] },
      ],
    } as never)

    const result = await reconcileImportedPlan('p', Array.from({ length: 12 }, (_, i) => emptyWeek(i + 1)), '2025-12-29')

    expect(plans.deleteDay).not.toHaveBeenCalled()
    expect(plans.patchPlan).not.toHaveBeenCalled()
    expect(plans.batchDays).toHaveBeenCalledWith('p', {
      plan_patch: { plan_weeks: 12, start_date: '2025-12-29', end_date: '2026-03-22' },
      delete_day_ids: ['d13', 'd14'],
      upsert_days: [],
    })
    expect(result).toMatchObject({
      planStartDate: '2025-12-29',
      planEndDate: '2026-03-22',
      planWeeks: 12,
    })
    expect(result.weeks[0].days[0].dateLabel).toBe('12/29')
  })

  it('routes frozen out-of-range days through the per-day endpoint, never the batch', async () => {
    vi.mocked(plans.getPlan).mockResolvedValue({
      id: 'p',
      plan_weeks: 14,
      start_date: '2026-01-01',
      days: [
        { id: 'd13', week_number: 13, day_of_week: 1, exercises: [{ id: 'a', has_logs: true, sets: [] }] },
        { id: 'd14', week_number: 14, day_of_week: 1, exercises: [] },
      ],
    } as never)

    await reconcileImportedPlan('p', Array.from({ length: 12 }, (_, i) => emptyWeek(i + 1)), '2025-12-29')

    expect(plans.deleteDay).toHaveBeenCalledTimes(1)
    expect(plans.deleteDay).toHaveBeenCalledWith('d13')
    expect(plans.batchDays).toHaveBeenCalledWith('p', expect.objectContaining({
      delete_day_ids: ['d14'],
    }))
  })

  it('saves the regrouped import as five weeks with unchanged training dates', async () => {
    const index = new ExerciseIndex([{
      id: 'squat', name: '深蹲', name_en: null, exercise_type: 'main_lift',
      main_lift_family: 'squat', is_competition_lift: true, muscle_groups: [],
      equipment: [], movement_pattern: [], competition_stance: null,
      created_by_coach_id: null, created_at: '',
    }])
    const source: ParsedWeek[] = Array.from({ length: 6 }, (_, w) => ({
      blockIndex: w,
      dateSerials: Array.from({ length: 7 }, (_, d) => 46321 + w * 7 + d),
      days: (w === 0 ? [5, 6] : w === 5 ? [1, 2] : [1, 2, 5, 6]).map(dayOfWeek => ({
        dayOfWeek, rest: false,
        exercises: [{ rawName: '深蹲', setCount: 1, reps: '5', intensityKind: null, intensityValues: [], weightValues: ['100'], note: '' }],
      })),
    }))
    vi.mocked(plans.getPlan).mockResolvedValue({
      id: 'p', status: 'draft', plan_weeks: 6, start_date: '2026-10-26', days: [],
    } as never)

    const imported = buildWeeks(source, index, '2026-10-26')
    const result = await reconcileImportedPlan('p', imported.weeks, imported.startDate)

    expect(plans.batchDays).toHaveBeenCalledTimes(1)
    const request = vi.mocked(plans.batchDays).mock.calls[0][1]
    expect(request.plan_patch).toEqual({ start_date: '2026-10-31', end_date: '2026-12-04', plan_weeks: 5 })
    expect(request.upsert_days.map(day => planDayDateLabel('2026-10-31', day.week_number, day.day_of_week - 1)))
      .toEqual(['10/31', '11/1', '11/3', '11/4', '11/7', '11/8', '11/10', '11/11', '11/14', '11/15', '11/17', '11/18', '11/21', '11/22', '11/24', '11/25', '11/28', '11/29', '12/1', '12/2'])
    expect(result).toMatchObject({ planStartDate: '2026-10-31', planEndDate: '2026-12-04', planWeeks: 5 })
    expect(result.weeks).toHaveLength(5)
  })
})

describe('resizeServerPlanWeeks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(plans.patchPlan).mockResolvedValue({} as never)
    vi.mocked(plans.deleteDay).mockResolvedValue(undefined as never)
  })

  it('deletes every out-of-range server day before shrinking plan_weeks', async () => {
    vi.mocked(plans.getPlan).mockResolvedValue({
      id: 'p', status: 'draft', plan_weeks: 12, start_date: '2026-01-01',
      days: [
        { id: 'w11', week_number: 11, day_of_week: 1, exercises: [] },
        { id: 'w12a', week_number: 12, day_of_week: 1, exercises: [{ id: 'a', sets: [] }] },
        { id: 'w12b', week_number: 12, day_of_week: 3, exercises: [{ id: 'b', sets: [] }, { id: 'c', sets: [] }] },
      ],
    } as never)

    const result = await resizeServerPlanWeeks('p', 11)

    expect(plans.deleteDay).toHaveBeenCalledTimes(2)
    expect(plans.deleteDay).toHaveBeenNthCalledWith(1, 'w12a')
    expect(plans.deleteDay).toHaveBeenNthCalledWith(2, 'w12b')
    expect(plans.patchPlan).toHaveBeenCalledWith('p', { plan_weeks: 11 })
    const deleteOrders = vi.mocked(plans.deleteDay).mock.invocationCallOrder
    const patchOrder = vi.mocked(plans.patchPlan).mock.invocationCallOrder[0]
    expect(Math.max(...deleteOrders)).toBeLessThan(patchOrder)
    expect(result).toEqual({ deletedDays: 2, deletedExercises: 3 })
  })

  it('adds weeks with a single plan_weeks PATCH and no day deletion', async () => {
    vi.mocked(plans.getPlan).mockResolvedValue({
      id: 'p', status: 'draft', plan_weeks: 11, start_date: '2026-01-01', days: [],
    } as never)

    await resizeServerPlanWeeks('p', 12)

    expect(plans.deleteDay).not.toHaveBeenCalled()
    expect(plans.patchPlan).toHaveBeenCalledWith('p', { plan_weeks: 12 })
  })
})
