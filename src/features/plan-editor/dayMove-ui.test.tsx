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
      <PlanEditor initialWeeks={[week(1, { 0: [row('squat')] })]} weeksCount={1}
        studentName="学员" planName="计划" />,
    ))

    const source = dayAt(host, 1, 0)
    const target = dayAt(host, 1, 2)
    pointAt(target)
    act(() => source.querySelector<HTMLElement>('[data-day-move-handle]')!
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 0, clientY: 0 })))
    act(() => window.dispatchEvent(new MouseEvent('mousemove', { buttons: 1, clientX: 8, clientY: 0 })))

    expect(source.className).toContain('day-move-source')
    expect(target.className).toContain('day-move-target')
    expect(document.body.style.cursor).toBe('grabbing')

    act(() => window.dispatchEvent(new MouseEvent('mouseup', { clientX: 8, clientY: 0 })))
    expect(dayAt(host, 1, 0).className).toContain('restday')
    expect(dayAt(host, 1, 2).querySelector('[data-rowid="squat"]')).not.toBeNull()
    expect(dayAt(host, 1, 2).className).toContain('sel')

    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true })))
    expect(dayAt(host, 1, 0).querySelector('[data-rowid="squat"]')).not.toBeNull()
    expect(dayAt(host, 1, 2).className).toContain('restday')
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

  it('does not start from a non-draft header, while the resize edge still owns its drag', () => {
    act(() => root?.render(
      <PlanEditor initialWeeks={[week(1, { 0: [row('squat')] })]} weeksCount={1}
        studentName="学员" planName="计划" planStatus="completed" />,
    ))

    const source = dayAt(host, 1, 0)
    const header = source.querySelector<HTMLElement>('[data-day-move-handle]')!
    expect(header.title).toBe('仅草稿计划可移动训练日')
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
    const onSave = vi.fn(async (weeks: Week[]) => ({ changedDays: 2, skippedRows: 0, weeks }))
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
})
