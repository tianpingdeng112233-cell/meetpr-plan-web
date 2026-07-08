import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as plans from '../../api/plans'
import { reconcilePlan } from './reconcile'
import type { Week, ExerciseRow, DayCol } from './types'

vi.mock('../../api/plans')

function row(partial: Partial<ExerciseRow>): ExerciseRow {
  return {
    id: 'r', exerciseId: null, name: '', ku: false, custom: false,
    isMain: false, aux: false, reps: '5', mode: 'kg', boxes: [], note: '',
    ...partial,
  }
}

// One training day (Mon) carrying `rows`; the other six days are rest.
function weekWithMondayRows(rows: ExerciseRow[]): Week {
  const days: DayCol[] = Array.from({ length: 7 }, (_, d) => ({
    dow: d, dowLabel: '', dateLabel: '', rest: d !== 0, rows: d === 0 ? rows : [],
  }))
  return { num: 1, num2: '01', range: '', isCurrent: true, vol: '', days }
}

describe('reconcilePlan — skippedRows counts only contentful unbound rows', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(plans.getPlan).mockResolvedValue({ id: 'p', plan_weeks: 1, start_date: '2026-01-01', days: [] } as never)
    vi.mocked(plans.createDay).mockResolvedValue({ id: 'day1' } as never)
    vi.mocked(plans.createExercise).mockResolvedValue({ id: 'pe1' } as never)
    vi.mocked(plans.createSet).mockResolvedValue(undefined as never)
    vi.mocked(plans.deleteDay).mockResolvedValue(undefined as never)
  })

  it('counts a named-but-unbound row and ignores empty placeholder rows', async () => {
    const rows = [
      row({ id: 'a', exerciseId: 'ex1', name: '深蹲', boxes: [{ val: '100', empty: false }] }), // bound
      row({ id: 'b', exerciseId: null, name: '卧推' }),                                          // named, unbound → counts
      row({ id: 'c', exerciseId: null, name: '', boxes: [] }),                                   // empty placeholder → ignored
    ]
    const res = await reconcilePlan('p', [weekWithMondayRows(rows)])
    expect(res.skippedRows).toBe(1)
  })

  it('counts an unbound row that carries set values but no name', async () => {
    const rows = [
      row({ id: 'a', exerciseId: 'ex1', name: '深蹲', boxes: [{ val: '100', empty: false }] }), // bound
      row({ id: 'b', exerciseId: null, name: '', boxes: [{ val: '80', empty: false }] }),        // values, unbound → counts
    ]
    const res = await reconcilePlan('p', [weekWithMondayRows(rows)])
    expect(res.skippedRows).toBe(1)
  })

  it('reports zero skipped when every row is either bound or an empty placeholder', async () => {
    const rows = [
      row({ id: 'a', exerciseId: 'ex1', name: '深蹲', boxes: [{ val: '100', empty: false }] }),
      row({ id: 'c', exerciseId: null, name: '', boxes: [] }),
    ]
    const res = await reconcilePlan('p', [weekWithMondayRows(rows)])
    expect(res.skippedRows).toBe(0)
  })

  it('writes rep ranges as target_reps_max and includes the max in diffing', async () => {
    const rows = [
      row({
        id: 'a',
        exerciseId: 'ex1',
        name: '帕洛夫推+旋转',
        reps: '10-12',
        boxes: [{ val: '9', empty: false }],
        mode: 'rpe',
      }),
    ]

    await reconcilePlan('p', [weekWithMondayRows(rows)])

    expect(plans.createSet).toHaveBeenCalledWith('pe1', expect.objectContaining({
      target_reps: 10,
      target_reps_max: 12,
      intensity_mode: 'rpe',
      target_value: '9',
    }))
  })

  it('persists bodyweight rows as publishable sets with a bodyweight coach note', async () => {
    const rows = [
      row({
        id: 'a',
        exerciseId: 'ex1',
        name: '双杠臂屈伸',
        reps: '10-15',
        mode: 'bodyweight',
        boxes: Array.from({ length: 4 }, () => ({ val: '', empty: true })),
        note: '先自重',
      }),
    ]

    await reconcilePlan('p', [weekWithMondayRows(rows)])

    expect(plans.createSet).toHaveBeenCalledTimes(4)
    expect(plans.createSet).toHaveBeenCalledWith('pe1', expect.objectContaining({
      target_reps: 10,
      target_reps_max: 15,
      intensity_mode: 'rpe',
      target_value: '10',
      coach_note: '自重',
    }))
  })
})
