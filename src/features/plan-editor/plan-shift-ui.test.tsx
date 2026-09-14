import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlanWithChildren } from '../../api/types'
import { ApiException } from '../../api/client'
import { PlanEditor } from './PlanEditor'
import { reconcilePlan, type SaveResult } from './reconcile'
import { syncPlanScheduleToWeeks } from './mapping'
import type { DayCol, ExerciseRow, Week } from './types'

const planApi = vi.hoisted(() => ({
  shiftPlan: vi.fn(),
  undoPlanShift: vi.fn(),
  getPlan: vi.fn(),
  batchDays: vi.fn(),
}))
const pendingApi = vi.hoisted(() => ({
  getPendingRevision: vi.fn(),
  putPendingRevision: vi.fn(),
  deletePendingRevision: vi.fn(),
}))

vi.mock('../../api/plans', () => planApi)
vi.mock('../../api/pendingRevision', () => pendingApi)

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function row(id: string, name: string): ExerciseRow {
  return {
    id, serverRowId: id, serverSortOrder: 0, hasLogs: false, conflictMessage: null,
    exerciseId: id, name, ku: true, custom: false, isMain: true,
    aux: false, reps: '5', mode: 'kg', boxes: [{ val: '100', empty: false }], note: '',
  }
}

function week(status: Array<'pending' | 'completed' | 'empty'> = [
  'pending', 'empty', 'completed', 'empty', 'pending', 'empty', 'empty',
]): Week {
  return {
    num: 1, num2: '01', range: '7/20 – 7/26', isCurrent: false, vol: '',
    days: status.map((state, dow): DayCol => ({
      dow,
      dowLabel: `周${['一', '二', '三', '四', '五', '六', '日'][dow]}`,
      dateLabel: `7/${20 + dow}`,
      serverDayId: state === 'empty' ? null : `day-${dow}`,
      completedAt: state === 'completed' ? '2026-07-22T08:00:00Z' : null,
      rest: state === 'empty',
      rows: state === 'empty' ? [] : [row(`row-${dow}`, dow === 0 ? '深蹲' : '训练')],
    })),
  }
}

function plan(shifted = false): PlanWithChildren {
  return {
    id: 'plan', coach_id: 'coach', trainee_id: 'student', name: '计划',
    start_date: '2026-07-20', end_date: '2026-07-26', plan_weeks: 1,
    source: 'coach', source_template_id: null, status: 'published', kind: 'regular',
    created_at: '', updated_at: '', total_shift_days: shifted ? 2 : 0,
    latest_shift_created_at: shifted ? '2026-07-19T10:00:00Z' : null,
    latest_shift: shifted ? {
      batch_id: 'batch', actor_role: 'coach', anchor_date: '2026-07-20',
      offset_days: 2, created_at: '2026-07-19T10:00:00Z',
    } : null,
    days: [
      { id: 'day-0', plan_id: 'plan', day_of_week: 1, week_number: 1, sort_order: 0,
        shifted_to_date: shifted ? '2026-07-22' : null, completed_at: null, exercises: [] },
      { id: 'day-2', plan_id: 'plan', day_of_week: 3, week_number: 1, sort_order: 1,
        shifted_to_date: null, completed_at: '2026-07-22T08:00:00Z', exercises: [] },
      { id: 'day-4', plan_id: 'plan', day_of_week: 5, week_number: 1, sort_order: 2,
        shifted_to_date: shifted ? '2026-07-26' : null, completed_at: null, exercises: [] },
    ],
  }
}

function shiftedWeek(): Week {
  const shifted = week()
  shifted.range = '7/22 – 7/26'
  shifted.days[0] = {
    ...shifted.days[0], dowLabel: '周三', dateLabel: '7/22', shiftedToDate: '2026-07-22',
    shiftBadge: { originalDate: '2026-07-20', days: 2 },
  }
  shifted.days[4] = {
    ...shifted.days[4], dowLabel: '周日', dateLabel: '7/26', shiftedToDate: '2026-07-26',
    shiftBadge: { originalDate: '2026-07-24', days: 2 },
  }
  return shifted
}

function click(button: Element): void {
  button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

function setInput(input: HTMLInputElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function historyKey(redo = false): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, shiftKey: redo, bubbles: true }))
}

function button(host: ParentNode, label: string): HTMLButtonElement {
  const found = [...host.querySelectorAll('button')].find((item) => item.textContent?.trim() === label)
  if (!found) throw new Error(`button not found: ${label}`)
  return found
}

describe('coach plan shift UI', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    planApi.shiftPlan.mockReset()
    planApi.undoPlanShift.mockReset()
    planApi.getPlan.mockReset()
    planApi.batchDays.mockReset()
    pendingApi.getPendingRevision.mockReset().mockResolvedValue(null)
    pendingApi.putPendingRevision.mockReset().mockResolvedValue({})
    pendingApi.deletePendingRevision.mockReset().mockResolvedValue(undefined)
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    Object.defineProperty(Element.prototype, 'scrollIntoView', { value: vi.fn(), configurable: true })
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    document.querySelectorAll('[data-plan-shift-panel]').forEach((element) => element.remove())
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('offers shifting for a newly saved day after the plan is published', async () => {
    const draftWeek = week(['pending', 'empty', 'empty', 'empty', 'empty', 'empty', 'empty'])
    draftWeek.days[0].serverDayId = null
    draftWeek.days[0].rows[0].serverRowId = null
    planApi.getPlan.mockResolvedValue({ ...plan(), status: 'draft', days: [] })
    planApi.batchDays.mockResolvedValue({ ...plan(), status: 'draft', days: [plan().days[0]] })
    const saved = await reconcilePlan('plan', [draftWeek])

    await act(async () => root.render(
      <PlanEditor initialWeeks={saved.weeks} weeksCount={1} planStartDate="2026-07-20"
        studentName="学员" planName="计划" currentPlanId="plan" planStatus="published"
        initialPublished />,
    ))

    const monday = host.querySelector<HTMLElement>('.day[data-dow="0"]')!
    act(() => click(monday))
    const entry = monday.querySelector<HTMLButtonElement>('.day-shift-action')
    expect(entry).not.toBeNull()
    act(() => click(entry!))
    expect(document.querySelector('[data-plan-shift-panel]')?.textContent).toContain('从 7/20（W1D1）起后移')
  })

  it('retains saved day identity when undoing draft edits after publication', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const draftWeek = week(['pending', 'empty', 'empty', 'empty', 'empty', 'empty', 'empty'])
    draftWeek.days[0].serverDayId = null
    draftWeek.days[0].rows[0].serverRowId = null
    planApi.getPlan.mockResolvedValue({ ...plan(), status: 'draft', days: [] })
    planApi.batchDays.mockResolvedValue({ ...plan(), status: 'draft', days: [plan().days[0]] })
    const onSave = vi.fn((saved: Week[]) => reconcilePlan('plan', saved))
    function EditorSession() {
      const [status, setStatus] = useState<'draft' | 'published'>('draft')
      return <PlanEditor initialWeeks={[draftWeek]} weeksCount={1} planStartDate="2026-07-20"
        studentName="学员" planName="计划" currentPlanId="plan" planStatus={status}
        onSave={onSave} onPublish={async () => setStatus('published')} />
    }
    await act(async () => root.render(<EditorSession />))
    const monday = host.querySelector<HTMLElement>('.day[data-dow="0"]')!
    const note = monday.querySelector<HTMLInputElement>('[data-c="note"] input')!
    act(() => setInput(note, 'draft edit'))
    await act(async () => click(button(host, '发布给学员')))
    act(() => historyKey())
    expect(note.value).toBe('')
    act(() => click(monday))
    expect(monday.querySelector('.day-shift-action')).not.toBeNull()
    act(() => historyKey(true))
    expect(note.value).toBe('draft edit')
    await act(async () => click(button(host, '更新计划')))
    expect(onSave.mock.calls[1][0][0].days[0].serverDayId).toBe('day-0')
  })

  it('previews affected days and refreshes the mapped grid and chip after shifting', async () => {
    vi.useFakeTimers()
    planApi.shiftPlan.mockResolvedValue({
      batch_id: 'batch', anchor_date: '2026-07-20', offset_days: 2,
      shifted_days: [
        { day_id: 'day-0', shifted_to_date: '2026-07-22' },
        { day_id: 'day-4', shifted_to_date: '2026-07-26' },
      ],
      skipped_completed_day_ids: ['day-2'], total_shift_days: 2,
    })
    planApi.getPlan.mockResolvedValue(plan(true))

    const onSave = vi.fn(async (saved: Week[]) => ({
      changedDays: 0, degradedRows: 0, skippedRows: 0, weeks: saved,
    }))
    act(() => root.render(
      <PlanEditor initialWeeks={[week()]} weeksCount={1} planStartDate="2026-07-20"
        studentName="学员" planName="计划" currentPlanId="plan" planStatus="published"
        initialPublished totalShiftDays={0} latestShift={null}
        onSave={onSave} />,
    ))

    const monday = host.querySelector<HTMLElement>('.day[data-dow="0"]')!
    act(() => click(monday))
    act(() => click(button(monday, '后移…')))

    const panel = document.body.querySelector<HTMLElement>('[data-plan-shift-panel]')!
    expect(panel.textContent).toContain('从 7/20（W1D1）起后移')
    expect(panel.textContent).toContain('W1D1 深蹲日 → 7/21 周二')
    expect(panel.textContent).toContain('影响 2 个训练日 · 已完成的 1 天不动')
    expect(panel.textContent).toContain('周期结束日 7/24 → 7/25')

    act(() => click(button(panel, '+')))
    expect(panel.textContent).toContain('W1D1 深蹲日 → 7/22 周三')
    expect(panel.textContent).toContain('周期结束日 7/24 → 7/26')

    await act(async () => { click(button(panel, '后移 2 天')); await Promise.resolve() })

    expect(planApi.shiftPlan).toHaveBeenCalledWith('plan', { anchor_date: '2026-07-20', offset_days: 2 })
    expect(planApi.getPlan).toHaveBeenCalledWith('plan')
    expect(host.querySelector('.day[data-dow="0"] [data-day-calendar-label]')?.textContent).toContain('7/22')
    expect(host.querySelector('.day[data-dow="0"] [data-shift-badge]')?.getAttribute('title'))
      .toBe('原定 7/20 · 已后移 2 天')
    expect(host.querySelector('[data-plan-shift-notice]')?.textContent).toContain('已后移 2 天 · 7/20 起')
    expect(host.querySelector('[data-testid="plan-save-status"]')?.textContent)
      .toContain('已后移 2 天 · 学员端将自动更新')
    expect(host.querySelector('[data-testid="plan-save-status"]')?.classList.contains('published-dirty')).toBe(false)
    await act(async () => { await vi.advanceTimersByTimeAsync(3_001) })
    expect(pendingApi.putPendingRevision).not.toHaveBeenCalled()
    expect(onSave).not.toHaveBeenCalled()
  })

  it.each(['refresh succeeds', 'refresh fails'] as const)('keeps the shifted schedule while undoing and redoing prescription edits when %s', async (refresh) => {
    planApi.shiftPlan.mockResolvedValue({
      batch_id: 'batch', anchor_date: '2026-07-20', offset_days: 2,
      shifted_days: [
        { day_id: 'day-0', shifted_to_date: '2026-07-22' },
        { day_id: 'day-4', shifted_to_date: '2026-07-26' },
      ],
      skipped_completed_day_ids: ['day-2'], total_shift_days: 2,
    })
    if (refresh === 'refresh fails') planApi.getPlan.mockRejectedValue(new Error('offline'))
    else planApi.getPlan.mockResolvedValue(plan(true))
    act(() => root.render(
      <PlanEditor initialWeeks={[week()]} weeksCount={1} planStartDate="2026-07-20"
        studentName="学员" planName="计划" currentPlanId="plan" planStatus="published"
        initialPublished totalShiftDays={0} latestShift={null} />,
    ))
    const monday = host.querySelector<HTMLElement>('.day[data-dow="0"]')!
    const note = monday.querySelector<HTMLInputElement>('[data-c="note"] input')!
    act(() => setInput(note, 'first edit'))
    act(() => setInput(note, 'second edit'))
    act(() => historyKey())
    expect(note.value).toBe('first edit')
    act(() => click(monday))
    act(() => click(button(monday, '后移…')))
    const panel = document.body.querySelector<HTMLElement>('[data-plan-shift-panel]')!
    act(() => click(button(panel, '+')))
    await act(async () => { click(button(panel, '后移 2 天')); await Promise.resolve() })

    act(() => historyKey())
    expect(note.value).toBe('')
    expect(monday.querySelector('[data-day-calendar-label]')?.textContent).toContain('7/22')
    expect(monday.querySelector('[data-shift-badge]')?.getAttribute('title')).toBe('原定 7/20 · 已后移 2 天')
    act(() => historyKey(true))
    expect(note.value).toBe('first edit')
    act(() => historyKey(true))
    expect(note.value).toBe('second edit')
    expect(monday.querySelector('[data-day-calendar-label]')?.textContent).toContain('7/22')
    act(() => click(button(monday, '后移…')))
    expect(document.body.querySelector('[data-plan-shift-panel]')?.textContent).toContain('从 7/22（W1D1）起后移')
  })

  it('keeps the restored schedule while undoing and redoing edits after undoing a shift', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    planApi.undoPlanShift.mockResolvedValue(undefined)
    planApi.getPlan.mockResolvedValue(plan(false))
    act(() => root.render(
      <PlanEditor initialWeeks={[shiftedWeek()]} weeksCount={1} planStartDate="2026-07-20"
        studentName="学员" planName="计划" currentPlanId="plan" planStatus="published"
        initialPublished totalShiftDays={2} latestShift={plan(true).latest_shift} />,
    ))
    const monday = host.querySelector<HTMLElement>('.day[data-dow="0"]')!
    const note = monday.querySelector<HTMLInputElement>('[data-c="note"] input')!
    act(() => setInput(note, 'first edit'))
    act(() => setInput(note, 'second edit'))
    act(() => historyKey())
    expect(note.value).toBe('first edit')
    await act(async () => { click(button(host, '撤销')); await Promise.resolve() })

    act(() => historyKey())
    expect(note.value).toBe('')
    expect(monday.querySelector('[data-day-calendar-label]')?.textContent).toContain('7/20')
    expect(monday.querySelector('[data-shift-badge]')).toBeNull()
    act(() => historyKey(true))
    expect(note.value).toBe('first edit')
    act(() => historyKey(true))
    expect(note.value).toBe('second edit')
    expect(monday.querySelector('[data-day-calendar-label]')?.textContent).toContain('7/20')
    expect(monday.querySelector('[data-shift-badge]')).toBeNull()
    expect(host.querySelector('[data-plan-shift-notice]')).toBeNull()
  })

  it.each([false, true])('keeps recreated day schedule through prescription undo/redo when save has concurrent edits: %s', async (editDuringSave) => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    let finishSave!: (result: SaveResult) => void
    const onSave = vi.fn((_: Week[]) => new Promise<SaveResult>(resolve => { finishSave = resolve }))
    await act(async () => root.render(
      <PlanEditor initialWeeks={[week()]} weeksCount={1} planStartDate="2026-07-20"
        studentName="学员" planName="计划" currentPlanId="plan" planStatus="published"
        initialPublished onSave={onSave} />,
    ))
    const monday = host.querySelector<HTMLElement>('.day[data-dow="0"]')!
    const note = monday.querySelector<HTMLInputElement>('[data-c="note"] input')!
    act(() => setInput(note, 'first edit'))
    act(() => setInput(note, 'second edit'))
    act(() => historyKey())
    act(() => click(button(host, '更新计划')))
    if (editDuringSave) act(() => setInput(note, 'during save'))
    const backend = plan(true)
    backend.days[0].id = 'recreated-day'
    await act(async () => finishSave({
      changedDays: 1, skippedRows: 0, degradedRows: 0,
      weeks: syncPlanScheduleToWeeks(onSave.mock.calls[0][0], backend),
    }))
    expect(note.value).toBe(editDuringSave ? 'during save' : 'first edit')
    expect(monday.querySelector('[data-day-calendar-label]')?.textContent).toContain('7/22')

    act(() => historyKey())
    expect(note.value).toBe(editDuringSave ? 'first edit' : '')
    expect(monday.querySelector('[data-day-calendar-label]')?.textContent).toContain('7/22')
    act(() => historyKey(true))
    expect(note.value).toBe(editDuringSave ? 'during save' : 'first edit')
    if (!editDuringSave) {
      act(() => historyKey(true))
      expect(note.value).toBe('second edit')
    }
    expect(monday.querySelector('[data-shift-badge]')?.getAttribute('title'))
      .toBe('原定 7/20 · 已后移 2 天')

    act(() => click(button(host, '更新计划')))
    expect(onSave.mock.calls[1][0][0].days[0].serverDayId).toBe('recreated-day')
    await act(async () => finishSave({
      changedDays: 0, skippedRows: 0, degradedRows: 0, weeks: onSave.mock.calls[1][0],
    }))
  })

  it('keeps the refreshed schedule through undo/redo after a save conflict', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.spyOn(window, 'alert').mockImplementation(() => {})
    const fresh = plan(true)
    fresh.days[0].id = 'live-day'
    planApi.getPlan.mockResolvedValueOnce(plan()).mockResolvedValueOnce(fresh)
    planApi.batchDays.mockRejectedValueOnce(new ApiException(409, 'PLAN_HISTORY_IMMUTABLE'))
    const onSave = vi.fn((saved: Week[]) => reconcilePlan('plan', saved))
    await act(async () => root.render(
      <PlanEditor initialWeeks={[week()]} weeksCount={1} planStartDate="2026-07-20"
        studentName="学员" planName="计划" currentPlanId="plan" planStatus="published"
        initialPublished onSave={onSave} />,
    ))
    const monday = host.querySelector<HTMLElement>('.day[data-dow="0"]')!
    const note = monday.querySelector<HTMLInputElement>('[data-c="note"] input')!
    act(() => setInput(note, 'first edit'))
    act(() => setInput(note, 'second edit'))
    act(() => historyKey())
    await act(async () => click(button(host, '更新计划')))

    expect(monday.querySelector('[data-day-calendar-label]')?.textContent).toContain('7/22')
    act(() => historyKey())
    expect(note.value).toBe('')
    expect(monday.querySelector('[data-day-calendar-label]')?.textContent).toContain('7/22')
    act(() => historyKey(true))
    expect(note.value).toBe('first edit')
    act(() => historyKey(true))
    expect(note.value).toBe('second edit')
    expect(monday.querySelector('[data-shift-badge]')?.getAttribute('title'))
      .toBe('原定 7/20 · 已后移 2 天')
    planApi.getPlan.mockResolvedValue(fresh)
    planApi.batchDays.mockResolvedValue(fresh)
    await act(async () => click(button(host, '更新计划')))
    expect(onSave.mock.calls[1][0][0].days[0].serverDayId).toBe('live-day')
  })

  it('keeps the cycle end unchanged when the final training day is completed', async () => {
    const finalCompleted = week([
      'pending', 'empty', 'empty', 'empty', 'empty', 'empty', 'completed',
    ])
    await act(async () => {
      root.render(
        <PlanEditor initialWeeks={[finalCompleted]} weeksCount={1} planStartDate="2026-07-20"
          studentName="学员" planName="计划" currentPlanId="plan" planStatus="published"
          initialPublished totalShiftDays={0} latestShift={null} />,
      )
      await Promise.resolve()
    })

    const monday = host.querySelector<HTMLElement>('.day[data-dow="0"]')!
    act(() => click(monday))
    act(() => click(button(monday, '后移…')))

    const panel = document.body.querySelector<HTMLElement>('[data-plan-shift-panel]')!
    expect(panel.textContent).toContain('周期结束日 7/26 → 7/26')
  })

  it('undoes the latest batch and restores the refreshed schedule', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    planApi.undoPlanShift.mockResolvedValue(undefined)
    planApi.getPlan.mockResolvedValue(plan(false))
    const latestShift = plan(true).latest_shift

    act(() => root.render(
      <PlanEditor initialWeeks={[shiftedWeek()]} weeksCount={1} planStartDate="2026-07-20"
        studentName="学员" planName="计划" currentPlanId="plan" planStatus="published"
        initialPublished totalShiftDays={2} latestShift={latestShift} />,
    ))

    await act(async () => { click(button(host, '撤销')); await Promise.resolve() })

    expect(confirm).toHaveBeenCalledWith('撤销最近一次后移（7/20 起 2 天）？学员端会同步恢复。')
    expect(planApi.undoPlanShift).toHaveBeenCalledWith('plan')
    expect(planApi.getPlan).toHaveBeenCalledWith('plan')
    expect(host.querySelector('.day[data-dow="0"] [data-day-calendar-label]')?.textContent).toContain('7/20')
    expect(host.querySelector('[data-plan-shift-notice]')).toBeNull()
  })

  it('undoes only one batch when undo is activated twice before the refresh finishes', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    let finishUndo!: () => void
    planApi.undoPlanShift.mockImplementation(() => new Promise<void>((resolve) => { finishUndo = resolve }))
    planApi.getPlan.mockResolvedValue(plan(false))
    act(() => root.render(
      <PlanEditor initialWeeks={[shiftedWeek()]} weeksCount={1} planStartDate="2026-07-20"
        studentName="学员" planName="计划" currentPlanId="plan" planStatus="published"
        initialPublished totalShiftDays={2} latestShift={plan(true).latest_shift} />,
    ))

    const undo = button(host, '撤销')
    act(() => { click(undo); click(undo) })
    expect(planApi.undoPlanShift).toHaveBeenCalledTimes(1)
    expect(undo.disabled).toBe(true)
    await act(async () => { finishUndo(); await Promise.resolve() })
    expect(host.querySelector('[data-plan-shift-notice]')).toBeNull()
  })

  it('retries only the refresh after undo succeeds but loading the remaining schedule fails', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    planApi.undoPlanShift.mockResolvedValue(undefined)
    planApi.getPlan.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(plan(false))
    act(() => root.render(
      <PlanEditor initialWeeks={[shiftedWeek()]} weeksCount={1} planStartDate="2026-07-20"
        studentName="学员" planName="计划" currentPlanId="plan" planStatus="published"
        initialPublished totalShiftDays={2} latestShift={plan(true).latest_shift} />,
    ))

    await act(async () => { click(button(host, '撤销')); await Promise.resolve() })
    expect(host.querySelector('[data-plan-shift-notice]')).not.toBeNull()
    expect(host.querySelector('[data-testid="plan-save-status"]')?.textContent).toContain('后移已撤销 · 日期刷新失败')
    await act(async () => { click(button(host, '重试刷新')); await Promise.resolve() })
    expect(planApi.undoPlanShift).toHaveBeenCalledTimes(1)
    expect(host.querySelector('[data-plan-shift-notice]')).toBeNull()
  })

  it('keeps historical plan schedules read-only, including undoing shifts', () => {
    act(() => root.render(
      <PlanEditor initialWeeks={[shiftedWeek()]} weeksCount={1} planStartDate="2026-07-20"
        studentName="学员" planName="已完成计划" currentPlanId="plan" planStatus="completed"
        readOnly totalShiftDays={2} latestShift={plan(true).latest_shift} />,
    ))

    expect(host.querySelector('[data-plan-shift-notice]')?.textContent).toContain('已后移 2 天')
    expect(host.querySelector('[data-plan-shift-undo]')).toBeNull()
  })

  it('does not render the shift entry for a draft plan', () => {
    act(() => root.render(
      <PlanEditor initialWeeks={[week()]} weeksCount={1} planStartDate="2026-07-20"
        studentName="学员" planName="草稿" currentPlanId="plan" planStatus="draft"
        totalShiftDays={0} latestShift={null} />,
    ))

    const monday = host.querySelector<HTMLElement>('.day[data-dow="0"]')!
    act(() => click(monday))
    expect([...monday.querySelectorAll('button')].some((item) => item.textContent?.includes('后移'))).toBe(false)
  })

  it('disables shifting when no incomplete training day remains at the anchor', async () => {
    const completed = week(['completed', 'empty', 'completed', 'empty', 'completed', 'empty', 'empty'])
    await act(async () => {
      root.render(
        <PlanEditor initialWeeks={[completed]} weeksCount={1} planStartDate="2026-07-20"
          studentName="学员" planName="计划" currentPlanId="plan" planStatus="published"
          initialPublished totalShiftDays={0} latestShift={null} />,
      )
      await Promise.resolve()
    })

    const monday = host.querySelector<HTMLElement>('.day[data-dow="0"]')!
    act(() => click(monday))
    act(() => click(button(monday, '后移…')))

    const panel = document.body.querySelector<HTMLElement>('[data-plan-shift-panel]')!
    expect(panel.textContent).toContain('影响 0 个训练日')
    expect(panel.textContent).toContain('该日期之后没有可后移的训练日')
    expect(button(panel, '后移 1 天').disabled).toBe(true)
    expect(planApi.shiftPlan).not.toHaveBeenCalled()
  })

  it('maps shift and undo 409 races to refreshed plan state', async () => {
    planApi.shiftPlan.mockRejectedValue(new ApiException(409, 'SHIFT_NO_TARGET_DAYS'))
    planApi.getPlan.mockResolvedValueOnce(plan(false))
    act(() => root.render(
      <PlanEditor initialWeeks={[week()]} weeksCount={1} planStartDate="2026-07-20"
        studentName="学员" planName="计划" currentPlanId="plan" planStatus="published"
        initialPublished totalShiftDays={0} latestShift={null} />,
    ))
    const monday = host.querySelector<HTMLElement>('.day[data-dow="0"]')!
    act(() => click(monday))
    act(() => click(button(monday, '后移…')))
    const panel = document.body.querySelector<HTMLElement>('[data-plan-shift-panel]')!

    await act(async () => { click(button(panel, '后移 1 天')); await Promise.resolve() })
    expect(panel.querySelector('[role="alert"]')?.textContent).toBe('该日期之后没有可后移的训练日')
    expect(planApi.getPlan).toHaveBeenCalledWith('plan')

    planApi.undoPlanShift.mockRejectedValue(new ApiException(409, 'NO_ACTIVE_SHIFT'))
    planApi.getPlan.mockResolvedValueOnce(plan(false))
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    act(() => root.render(
      <PlanEditor initialWeeks={[shiftedWeek()]} weeksCount={1} planStartDate="2026-07-20"
        studentName="学员" planName="计划" currentPlanId="plan-undo" planStatus="published"
        initialPublished totalShiftDays={2} latestShift={plan(true).latest_shift} />,
    ))

    await act(async () => { click(button(host, '撤销')); await Promise.resolve() })
    expect(confirm).toHaveBeenCalledOnce()
    expect(host.querySelector('[data-plan-shift-notice]')).toBeNull()
    expect(host.querySelector('[data-testid="plan-save-status"]')?.textContent).not.toContain('失败')
  })
})
