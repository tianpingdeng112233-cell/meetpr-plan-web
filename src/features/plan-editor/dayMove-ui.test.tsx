import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlanEditor } from './PlanEditor'
import type { DayCol, ExerciseRow, Week } from './types'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function row(id: string, hasLogs = false): ExerciseRow {
  return {
    id, serverRowId: id, serverSortOrder: 0, hasLogs, conflictMessage: null,
    exerciseId: id, name: id, ku: true, custom: false, isMain: false,
    aux: false, reps: '5', mode: 'kg', boxes: [{ val: '100', empty: false }], note: '',
  }
}

function week(num: number, daysByDow: Partial<Record<number, ExerciseRow[]>>): Week {
  return {
    num, num2: String(num).padStart(2, '0'), range: '', isCurrent: false, vol: '',
    days: Array.from({ length: 7 }, (_, dow): DayCol => {
      const rows = daysByDow[dow] ?? []
      return { dow, dowLabel: `周${dow + 1}`, dateLabel: `7/${20 + dow}`, rest: rows.length === 0, rows }
    }),
  }
}

function dayAt(host: HTMLElement, wnum: number, dow: number): HTMLElement {
  return host.querySelector<HTMLElement>(`.weekband[data-wnum="${wnum}"] .day[data-dow="${dow}"]`)!
}

function pointAt(element: Element): void {
  ;(document as Document & { elementsFromPoint: (x: number, y: number) => Element[] })
    .elementsFromPoint = () => [element]
}

describe('whole-day column dragging', () => {
  let host: HTMLDivElement
  let root: Root | null

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    Object.defineProperty(Element.prototype, 'scrollIntoView', { value: vi.fn(), configurable: true })
  })

  afterEach(() => {
    if (root) act(() => root?.unmount())
    host.remove()
    root = null
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    Reflect.deleteProperty(document, 'elementsFromPoint')
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('keeps an ordinary header click as day selection', () => {
    act(() => root?.render(
      <PlanEditor initialWeeks={[week(1, { 0: [row('squat')] })]} weeksCount={1}
        studentName="学员" planName="计划" />,
    ))

    const tuesday = dayAt(host, 1, 1)
    const header = tuesday.querySelector<HTMLElement>('[data-day-move-handle]')!
    act(() => header.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })))
    act(() => window.dispatchEvent(new MouseEvent('mouseup', { clientX: 1, clientY: 1 })))
    act(() => header.dispatchEvent(new MouseEvent('click', { bubbles: true })))

    expect(tuesday.className).toContain('sel')
    expect(tuesday.className).not.toContain('day-move-')
  })

  it('starts after the threshold, previews both columns, then moves into a rest day', () => {
    act(() => root?.render(
      <PlanEditor initialWeeks={[week(1, { 0: [row('squat')], 1: [row('bench')] })]} weeksCount={1}
        studentName="学员" planName="计划" />,
    ))

    const source = dayAt(host, 1, 0)
    const target = dayAt(host, 1, 2)
    expect(source.querySelector('.dayhead-primary')?.textContent).toBe('D1')
    expect(dayAt(host, 1, 1).querySelector('.dayhead-primary')?.textContent).toBe('D2')
    pointAt(target)
    act(() => source.querySelector<HTMLElement>('[data-day-move-handle]')!
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 0, clientY: 0 })))
    act(() => window.dispatchEvent(new MouseEvent('mousemove', { buttons: 1, clientX: 8, clientY: 0 })))

    expect(source.className).toContain('day-move-source')
    expect(target.className).toContain('day-move-target')
    expect(document.body.style.cursor).toBe('grabbing')

    act(() => window.dispatchEvent(new MouseEvent('mouseup', { clientX: 8, clientY: 0 })))
    expect(dayAt(host, 1, 0).className).toContain('restday')
    expect(dayAt(host, 1, 0).querySelector('.dayhead-primary')).toBeNull()
    expect(dayAt(host, 1, 1).querySelector('.dayhead-primary')?.textContent).toBe('D1')
    expect(dayAt(host, 1, 2).querySelector('[data-rowid="squat"]')).not.toBeNull()
    expect(dayAt(host, 1, 2).querySelector('.dayhead-primary')?.textContent).toBe('D2')
    expect(dayAt(host, 1, 2).className).toContain('sel')
    expect(host.textContent).toContain('已移动 D1 · 周1 7/20 至 D2 · 周3 7/22')

    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true })))
    expect(dayAt(host, 1, 0).querySelector('[data-rowid="squat"]')).not.toBeNull()
    expect(dayAt(host, 1, 0).querySelector('.dayhead-primary')?.textContent).toBe('D1')
    expect(dayAt(host, 1, 1).querySelector('.dayhead-primary')?.textContent).toBe('D2')
    expect(dayAt(host, 1, 2).className).toContain('restday')
  })

  it('renders the shifted-day badge, tooltip details, and plan-level shift notice', () => {
    const shiftedWeek = week(1, { 0: [row('squat')] })
    shiftedWeek.days[0] = {
      ...shiftedWeek.days[0],
      dowLabel: '周三',
      dateLabel: '7/22',
      shiftedToDate: '2026-07-22',
      shiftBadge: { originalDate: '2026-07-20', days: 2 },
    }
    act(() => root?.render(
      <PlanEditor initialWeeks={[shiftedWeek]} weeksCount={1} totalShiftDays={2}
        studentName="学员" planName="计划" />,
    ))

    const badge = dayAt(host, 1, 0).querySelector<HTMLElement>('[data-shift-badge]')!
    expect(badge.textContent).toBe('顺延')
    expect(badge.title).toContain('原定日期：2026-07-20')
    expect(badge.title).toContain('顺延天数：2 天')
    expect(host.querySelector<HTMLElement>('[data-plan-shift-notice]')?.textContent)
      .toContain('学员已整体顺延 2 天')
  })

  it('asks before moving a shifted day and leaves it in place when cancelled', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const shiftedWeek = week(1, { 0: [row('squat')] })
    shiftedWeek.days[0] = {
      ...shiftedWeek.days[0],
      shiftedToDate: '2026-07-22',
      shiftBadge: { originalDate: '2026-07-20', days: 2 },
    }
    act(() => root?.render(
      <PlanEditor initialWeeks={[shiftedWeek]} weeksCount={1}
        studentName="学员" planName="计划" />,
    ))

    const source = dayAt(host, 1, 0)
    const target = dayAt(host, 1, 2)
    pointAt(target)
    act(() => source.querySelector<HTMLElement>('[data-day-move-handle]')!
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 0, clientY: 0 })))
    act(() => window.dispatchEvent(new MouseEvent('mousemove', { buttons: 1, clientX: 8, clientY: 0 })))
    act(() => window.dispatchEvent(new MouseEvent('mouseup', { clientX: 8, clientY: 0 })))

    expect(confirm).toHaveBeenCalledOnce()
    expect(confirm.mock.calls[0][0]).toContain('保存后该天的顺延日期会丢失')
    expect(dayAt(host, 1, 0).querySelector('[data-rowid="squat"]')).not.toBeNull()
    expect(dayAt(host, 1, 2).className).toContain('restday')
  })

  it('asks when the target is shifted, clears badges on accept, and undo restores them', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const shiftedWeek = week(1, { 0: [row('squat')] })
    shiftedWeek.days[2] = {
      ...shiftedWeek.days[2],
      dowLabel: '周四',
      dateLabel: '7/23',
      shiftedToDate: '2026-07-23',
      shiftBadge: { originalDate: '2026-07-22', days: 1 },
    }
    act(() => root?.render(
      <PlanEditor initialWeeks={[shiftedWeek]} weeksCount={1}
        studentName="学员" planName="计划" />,
    ))

    const source = dayAt(host, 1, 0)
    const target = dayAt(host, 1, 2)
    pointAt(target)
    act(() => source.querySelector<HTMLElement>('[data-day-move-handle]')!
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 0, clientY: 0 })))
    act(() => window.dispatchEvent(new MouseEvent('mousemove', { buttons: 1, clientX: 8, clientY: 0 })))
    act(() => window.dispatchEvent(new MouseEvent('mouseup', { clientX: 8, clientY: 0 })))

    expect(confirm).toHaveBeenCalledOnce()
    expect(dayAt(host, 1, 2).querySelector('[data-rowid="squat"]')).not.toBeNull()
    expect(host.querySelector('[data-shift-badge]')).toBeNull()
    expect(dayAt(host, 1, 2).textContent).toContain('D1')
    expect(dayAt(host, 1, 2).textContent).toContain('7/22')

    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true })))
    expect(host.querySelector('[data-shift-badge]')).not.toBeNull()
    expect(dayAt(host, 1, 2).textContent).toContain('7/23')
  })

  it('shows a logged target as invalid and refuses the exchange', () => {
    act(() => root?.render(
      <PlanEditor initialWeeks={[week(1, { 0: [row('squat')], 2: [row('logged', true)] })]} weeksCount={1}
        studentName="学员" planName="计划" />,
    ))

    const source = dayAt(host, 1, 0)
    const target = dayAt(host, 1, 2)
    expect(target.querySelector<HTMLElement>('[data-day-move-handle]')!.title).toContain('不可移动或交换')
    pointAt(target)
    act(() => source.querySelector<HTMLElement>('[data-day-move-handle]')!
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })))
    act(() => window.dispatchEvent(new MouseEvent('mousemove', { buttons: 1, clientX: 8, clientY: 0 })))

    expect(target.className).toContain('day-move-invalid')
    expect(document.body.style.cursor).toBe('not-allowed')

    act(() => window.dispatchEvent(new MouseEvent('mouseup', { clientX: 8, clientY: 0 })))
    expect(dayAt(host, 1, 0).querySelector('[data-rowid="squat"]')).not.toBeNull()
    expect(dayAt(host, 1, 2).querySelector('[data-rowid="logged"]')).not.toBeNull()
  })

  it('starts from a published-plan header: live plans drag too, only logged days stay frozen', () => {
    act(() => root?.render(
      <PlanEditor initialWeeks={[week(1, { 0: [row('squat')] })]} weeksCount={1}
        studentName="学员" planName="计划" planStatus="published" initialPublished />,
    ))
    const source = dayAt(host, 1, 0)
    const header = source.querySelector<HTMLElement>('[data-day-move-handle]')!
    expect(header.title).toContain('拖动搬到本周其他日期')
    pointAt(dayAt(host, 1, 2))
    act(() => header.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 0, clientY: 0 })))
    act(() => window.dispatchEvent(new MouseEvent('mousemove', { buttons: 1, clientX: 12, clientY: 0 })))
    expect(source.className).toContain('day-move-source')
    act(() => window.dispatchEvent(new MouseEvent('mouseup', { clientX: 12, clientY: 0 })))
    expect(dayAt(host, 1, 2).querySelector('[data-rowid="squat"]')).not.toBeNull()
  })

  it('does not start from a non-draft header, while the resize edge still owns its drag', () => {
    act(() => root?.render(
      <PlanEditor initialWeeks={[week(1, { 0: [row('squat')] })]} weeksCount={1}
        studentName="学员" planName="计划" planStatus="completed" />,
    ))

    const source = dayAt(host, 1, 0)
    const header = source.querySelector<HTMLElement>('[data-day-move-handle]')!
    expect(header.title).toBe('已完成/已停用的计划不可移动训练日')
    act(() => header.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })))
    act(() => window.dispatchEvent(new MouseEvent('mousemove', { buttons: 1, clientX: 12, clientY: 0 })))
    expect(source.className).not.toContain('day-move-source')

    const divider = source.querySelector<HTMLElement>('.coldiv')!
    act(() => divider.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })))
    expect(divider.className).toContain('dragging')
    act(() => window.dispatchEvent(new MouseEvent('mousemove', { buttons: 1, clientX: 20, clientY: 0 })))
    expect(source.className).not.toContain('day-move-source')
    act(() => window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })))
  })

  it('persists the moved weeks through the existing draft autosave callback', async () => {
    vi.useFakeTimers()
    const onSave = vi.fn(async (weeks: Week[]) => ({ changedDays: 2, degradedRows: 0, skippedRows: 0, weeks }))
    act(() => root?.render(
      <PlanEditor initialWeeks={[week(1, { 0: [row('bench')] })]} weeksCount={1}
        studentName="学员" planName="计划" onSave={onSave} />,
    ))

    const source = dayAt(host, 1, 0)
    const target = dayAt(host, 1, 3)
    pointAt(target)
    act(() => source.querySelector<HTMLElement>('[data-day-move-handle]')!
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })))
    act(() => window.dispatchEvent(new MouseEvent('mousemove', { buttons: 1, clientX: 8, clientY: 0 })))
    act(() => window.dispatchEvent(new MouseEvent('mouseup', { clientX: 8, clientY: 0 })))
    await act(async () => { await vi.advanceTimersByTimeAsync(1500) })

    expect(onSave).toHaveBeenCalledTimes(1)
    const savedWeeks = onSave.mock.calls[0][0]
    expect(savedWeeks[0].days[0]).toMatchObject({ rest: true, rows: [] })
    expect(savedWeeks[0].days[3].rows[0].id).toBe('bench')
  })

  it('renders completed plans as read-only and never autosaves or flushes them', async () => {
    vi.useFakeTimers()
    const onSave = vi.fn(async (weeks: Week[]) => ({ changedDays: 0, degradedRows: 0, skippedRows: 0, weeks }))
    act(() => root?.render(
      <PlanEditor initialWeeks={[week(1, { 0: [row('squat')] })]} weeksCount={1}
        studentName="学员" planName="历史计划" planStatus="completed" onSave={onSave} />,
    ))

    expect(host.querySelector('.scroller')?.getAttribute('aria-readonly')).toBe('true')
    expect(host.textContent).toContain('历史计划只读：可以查看，但不会保存任何修改')
    expect(host.textContent).not.toContain('保存到云端')
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    act(() => root?.unmount())
    root = null

    expect(onSave).not.toHaveBeenCalled()
  })
})
