import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as plans from '../../api/plans'
import { reconcileImportedPlan, resizeServerPlanWeeks } from './reconcile'
import type { Week } from './types'

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
  })

  it('deletes weeks beyond the import and PATCHes plan_weeks + start_date to the source', async () => {
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

    expect(plans.deleteDay).toHaveBeenCalledWith('d13')
    expect(plans.deleteDay).toHaveBeenCalledWith('d14')
    expect(plans.deleteDay).not.toHaveBeenCalledWith('d1')
    expect(plans.patchPlan).toHaveBeenCalledWith(
      'p',
      expect.objectContaining({ plan_weeks: 12, start_date: '2025-12-29' }),
    )
    expect(result).toMatchObject({
      planStartDate: '2025-12-29',
      planEndDate: '2026-03-22',
      planWeeks: 12,
    })
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
