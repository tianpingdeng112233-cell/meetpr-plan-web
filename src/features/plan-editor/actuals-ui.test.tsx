import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StudentSetLog } from '../../api/types'
import { PlanEditor } from './PlanEditor'
import type { DayCol, ExerciseRow, Week } from './types'

const api = vi.hoisted(() => ({
  getExerciseStats: vi.fn(),
  getStudentSetLogs: vi.fn(),
}))

vi.mock('../../api/coach', () => ({
  getExerciseStats: api.getExerciseStats,
  getStudentSetLogs: api.getStudentSetLogs,
}))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function log(overrides: Partial<StudentSetLog>): StudentSetLog {
  return {
    id: `log-${overrides.set_index ?? 0}`, student_id: 'student-1', plan_exercise_id: 'pe-1',
    exercise_id: 'squat', set_index: 0, weight_kg: '90.00', reps: 5, rpe: '8.0', coach_rpe: null,
    completed: true, failed: false, assumed: false, adhoc: false,
    logged_date: '2026-08-10', logged_at: '2026-08-10T10:00:00Z',
    ...overrides,
  } as StudentSetLog
}

function row(): ExerciseRow {
  return {
    id: 'squat-row', serverRowId: 'pe-1', serverSortOrder: null, hasLogs: true, conflictMessage: null,
    exerciseId: 'squat', name: '低杠深蹲', ku: true, custom: false, isMain: true, aux: false,
    reps: '5', mode: 'kg', weightMode: 'per_set',
    intensity: { mode: 'rpe', value: '8', high: '' },
    intensityMode: 'uniform',
    intensityBoxes: [{ val: '8', empty: false }, { val: '8', empty: false }, { val: '8', empty: false }],
    boxes: [{ val: '90', empty: false }, { val: '95', empty: false }, { val: '100', empty: false }],
    note: '',
  }
}

function week(): Week {
  const days: DayCol[] = [{ dow: 0, dowLabel: '周一', dateLabel: '7/27', rest: false, rows: [row()] }]
  return { num: 1, num2: '01', range: '7/27–8/2', isCurrent: false, vol: '', days }
}

describe('plan editor actual-set chips (SPEC-038)', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    api.getExerciseStats.mockReset()
    api.getExerciseStats.mockResolvedValue({ one_rm_reference: null, e1rm: null, rep_prs: [], by_set_count: {}, recent_sessions: [] })
    api.getStudentSetLogs.mockReset()
    api.getStudentSetLogs.mockResolvedValue([
      log({ set_index: 0, weight_kg: '92.50', rpe: '9.0' }),
      log({ set_index: 1, weight_kg: '101.00', rpe: '9.5' }),
      log({ set_index: 2, weight_kg: '100.00', rpe: null, failed: true }),
    ])
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    Object.defineProperty(Element.prototype, 'scrollIntoView', { value: vi.fn(), configurable: true })
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.restoreAllMocks()
  })

  it('renders per-set actuals under the target cells with 红/黄 tones and thresholds', async () => {
    await act(async () => {
      root.render(
        <PlanEditor initialWeeks={[week()]} weeksCount={1} studentId="student-1" studentName="吕子豪"
          planName="Monster" planStartDate="2026-07-27" />,
      )
      await Promise.resolve()
    })
    await act(async () => { await Promise.resolve() })

    expect(api.getStudentSetLogs).toHaveBeenCalledTimes(1)
    expect(api.getStudentSetLogs.mock.calls[0]?.[0]).toBe('student-1')
    expect(api.getStudentSetLogs.mock.calls[0]?.[1]).toBe('2026-07-27')

    const weightChips = [...host.querySelectorAll('[data-actuals="weight"] .actual-chip')]
    expect(weightChips.map((chip) => chip.textContent)).toEqual(['92.5×5', '101×5', '100×5 力竭'])
    // ±5kg:92.5 对 90 阈内黄;101 对 95 超阈红;力竭强制红。
    expect(weightChips.map((chip) => chip.className)).toEqual([
      'actual-chip tone-ok', 'actual-chip tone-off', 'actual-chip tone-off',
    ])

    const rpeChips = [...host.querySelectorAll('[data-actuals="intensity"] .actual-chip')]
    expect(rpeChips.map((chip) => chip.textContent)).toEqual(['@9', '@9.5', '—'])
    // ±1:@9 对 8 阈内黄;@9.5 超阈红;力竭组无 RPE 也红显。
    expect(rpeChips.map((chip) => chip.className)).toEqual([
      'actual-chip tone-ok', 'actual-chip tone-off', 'actual-chip tone-off',
    ])
  })

  it('renders no actual lines for a draft plan without logs', async () => {
    api.getStudentSetLogs.mockResolvedValue([])
    const draftWeek = week()
    draftWeek.days[0]!.rows[0] = { ...row(), hasLogs: false, serverRowId: null }
    await act(async () => {
      root.render(
        <PlanEditor initialWeeks={[draftWeek]} weeksCount={1} studentId="student-1" studentName="吕子豪"
          planName="Monster" planStartDate="2026-07-27" />,
      )
      await Promise.resolve()
    })

    expect(api.getStudentSetLogs).not.toHaveBeenCalled()
    expect(host.querySelector('[data-actuals]')).toBeNull()
  })
})
