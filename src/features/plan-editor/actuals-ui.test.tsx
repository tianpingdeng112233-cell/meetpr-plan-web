import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StudentSetLog } from '../../api/types'
import { PlanEditor } from './PlanEditor'
import { ExerciseIndex } from './exerciseIndex'
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
    vi.useRealTimers()
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

  it('uses the browser-local calendar date as the actuals upper bound', async () => {
    vi.useFakeTimers()
    const localNow = new Date(2026, 7, 22, 0, 30)
    vi.setSystemTime(localNow)
    const nativeToISOString = Date.prototype.toISOString
    vi.spyOn(Date.prototype, 'toISOString').mockImplementation(function (this: Date) {
      return this.getTime() === localNow.getTime()
        ? '2026-08-21T23:30:00.000Z'
        : nativeToISOString.call(this)
    })
    api.getStudentSetLogs.mockResolvedValue([])

    await act(async () => {
      root.render(
        <PlanEditor initialWeeks={[week()]} weeksCount={1} studentId="student-1" studentName="吕子豪"
          planName="Monster" planStartDate="2026-08-22" />,
      )
      await Promise.resolve()
    })

    expect(api.getStudentSetLogs).toHaveBeenCalledWith('student-1', '2026-08-22', '2026-08-23')
  })

  it('loads student-added-only days, isolates same-date days by id, and keeps save/publish plan rows unchanged', async () => {
    const source = week()
    source.days[0] = { ...source.days[0], serverDayId: 'day-1', rows: [{ ...row(), hasLogs: false }] }
    source.days.push({ ...source.days[0], dow: 1, serverDayId: 'day-2', rows: [{ ...row(), id: 'row-2', serverRowId: 'pe-2', hasLogs: false }] })
    api.getStudentSetLogs.mockResolvedValue([
      log({ adhoc: true, plan_exercise_id: null, plan_day_id: 'day-1', exercise_id: 'curl', set_index: 0 }),
      log({ adhoc: true, plan_exercise_id: null, plan_day_id: 'day-1', exercise_id: 'curl', set_index: 1 }),
      log({ adhoc: true, plan_exercise_id: null, plan_day_id: 'day-2', exercise_id: 'press' }),
      log({ adhoc: true, plan_exercise_id: null, exercise_id: 'unlinked' }),
    ])
    const onSave = vi.fn(async (weeks: Week[]) => ({ weeks, skippedRows: 0, degradedRows: 0, changedDays: 0 }))
    const onPublish = vi.fn(async () => {})
    await act(async () => root.render(<PlanEditor initialWeeks={[source]} weeksCount={1} studentId="student-1" studentName="学员"
      planName="计划" planStartDate="2026-07-27" onSave={onSave} onPublish={onPublish} />))
    expect(api.getStudentSetLogs).toHaveBeenCalledTimes(1)
    expect(host.querySelector('[data-dow="0"] [data-student-added="curl"]')).not.toBeNull()
    expect(host.querySelector('[data-dow="1"] [data-student-added="press"]')).not.toBeNull()
    expect(host.querySelector('[data-dow="1"] [data-student-added="curl"]')).toBeNull()
    expect(host.querySelector('[data-student-added="unlinked"]')).toBeNull()
    const publish = [...host.querySelectorAll('button')].find((button) => button.textContent === '发布给学员')!
    await act(async () => publish.click())
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onPublish).toHaveBeenCalledTimes(1)
    const savedWeeks = onSave.mock.calls[0][0]
    expect(savedWeeks.flatMap((w) => w.days.flatMap((d) => d.rows.map((r) => r.exerciseId)))).toEqual(['squat', 'squat'])
    expect(JSON.stringify(savedWeeks)).not.toContain('curl')
    expect(JSON.stringify(savedWeeks)).not.toContain('press')
  })


  it('keeps old-backend rendering unchanged and shows catalog names in completed read-only plans', async () => {
    const source = week()
    source.days[0].serverDayId = 'day-1'
    const index = new ExerciseIndex([{
      id: 'curl', name: '哑铃弯举', name_en: 'Dumbbell curl', exercise_type: 'accessory', main_lift_family: null,
      is_competition_lift: false, muscle_groups: ['biceps'], equipment: ['dumbbell'], movement_pattern: ['other'],
      competition_stance: null, created_by_coach_id: null, created_at: '',
    }])
    const render = () => root.render(<PlanEditor initialWeeks={[source]} weeksCount={1} studentId="student-1" studentName="学员"
      planName="历史" planStartDate="2026-07-27" planStatus="completed" exerciseIndex={index} />)
    api.getStudentSetLogs.mockResolvedValue([log({}), log({ adhoc: true, plan_exercise_id: null, exercise_id: 'curl' })])
    await act(async () => render())
    expect(host.querySelector('[data-student-added]')).toBeNull()
    expect(host.textContent).not.toContain('学员自加')
    expect(host.querySelectorAll('[data-actuals="weight"] .actual-chip')).toHaveLength(1)
    await act(async () => root.unmount())
    root = createRoot(host)
    api.getStudentSetLogs.mockResolvedValue([log({ adhoc: true, plan_exercise_id: null, plan_day_id: 'day-1', exercise_id: 'curl' })])
    await act(async () => render())
    expect(host.querySelector('[data-student-added="curl"] [data-c="name"]')?.textContent).toBe('哑铃弯举学员自加')
    expect(host.querySelector('[data-student-added="curl"] input')).toBeNull()
  })


  it("includes today's logs by requesting tomorrow as the exclusive upper bound", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 22, 12))
    const source = week()
    source.days[0].serverDayId = 'day-1'
    const todaysLogs = [
      log({ logged_date: '2026-08-22' }),
      log({ set_index: 3, logged_date: '2026-08-22' }),
      log({ adhoc: true, plan_exercise_id: null, plan_day_id: 'day-1', exercise_id: 'curl', logged_date: '2026-08-22' }),
    ]
    api.getStudentSetLogs.mockImplementation(async (_studentId: string, from: string, to: string) => (
      todaysLogs.filter((entry) => entry.logged_date >= from && entry.logged_date < to)
    ))
    await act(async () => root.render(<PlanEditor initialWeeks={[source]} weeksCount={1} studentId="student-1" studentName="学员"
      planName="计划" planStartDate="2026-07-27" />))
    expect(api.getStudentSetLogs).toHaveBeenCalledWith('student-1', '2026-07-27', '2026-08-23')
    expect(host.querySelectorAll('[data-rowid="squat-row"] [data-actuals="weight"] .actual-chip')).toHaveLength(2)
    expect(host.querySelector('[data-rowid="squat-row"] .actual-added-first')).not.toBeNull()
    expect(host.querySelector('[data-student-added="curl"]')).not.toBeNull()
  })

})
