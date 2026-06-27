import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as plans from '../../api/plans'
import { reconcileImportedPlan } from './reconcile'
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

    await reconcileImportedPlan('p', Array.from({ length: 12 }, (_, i) => emptyWeek(i + 1)), '2025-12-29')

    expect(plans.deleteDay).toHaveBeenCalledWith('d13')
    expect(plans.deleteDay).toHaveBeenCalledWith('d14')
    expect(plans.deleteDay).not.toHaveBeenCalledWith('d1')
    expect(plans.patchPlan).toHaveBeenCalledWith(
      'p',
      expect.objectContaining({ plan_weeks: 12, start_date: '2025-12-29' }),
    )
  })
})
