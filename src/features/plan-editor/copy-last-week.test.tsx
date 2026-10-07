import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlanEditor } from './PlanEditor'
import { S } from '../../i18n/strings'
import type { DayCol, ExerciseRow, Week } from './types'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function row(id: string, partial: Partial<ExerciseRow> = {}): ExerciseRow {
  return {
    id, serverRowId: null, serverSortOrder: null, hasLogs: false, conflictMessage: null,
    exerciseId: 'ex', name: '深蹲', ku: true, custom: false, isMain: false,
    aux: false, reps: '5', mode: 'kg', boxes: [{ val: '100', empty: false }], note: '',
    ...partial,
  }
}

function week(num: number, mondayRows: ExerciseRow[]): Week {
  return {
    num, num2: String(num).padStart(2, '0'), range: '', isCurrent: num === 1, vol: '',
    days: Array.from({ length: 7 }, (_, dow): DayCol => ({
      dow, dowLabel: `周${dow + 1}`, dateLabel: '', rest: mondayRows.length === 0 || dow !== 0,
      rows: dow === 0 ? mondayRows : [],
    })),
  }
}

describe('copy last week into this week', () => {
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
    vi.restoreAllMocks()
  })

  function selectDay(wnum: number, dow = 0) {
    const day = host.querySelector<HTMLElement>(`.weekband[data-wnum="${wnum}"] [data-dow="${dow}"]`)!
    act(() => day.dispatchEvent(new MouseEvent('click', { bubbles: true })))
  }

  function copyLastWeek() {
    const copy = [...host.querySelectorAll<HTMLElement>('span.ctxbtn')]
      .find((item) => item.textContent?.includes(S.editor.copyLastWeek))!
    act(() => copy.dispatchEvent(new MouseEvent('click', { bubbles: true })))
  }

  function dayNames(wnum: number, dow: number) {
    const day = host.querySelector<HTMLElement>(`.weekband[data-wnum="${wnum}"] [data-dow="${dow}"]`)!
    return [...day.querySelectorAll<HTMLInputElement>(`input[placeholder="${S.editor.exercisePlaceholder}"]`)]
      .map((input) => input.value)
  }

  it('clicking the context-bar button copies last week rows into the selected week', () => {
    act(() => root?.render(
      <PlanEditor initialWeeks={[week(1, [row('source')]), week(2, [])]}
        weeksCount={2} studentName="学员" planName="计划" />,
    ))
    const targetDay = host.querySelector<HTMLElement>('.weekband[data-wnum="2"] [data-dow="0"]')!
    act(() => targetDay.dispatchEvent(new MouseEvent('click', { bubbles: true })))

    const copy = [...host.querySelectorAll<HTMLElement>('span.ctxbtn')]
      .find((item) => item.textContent?.includes(S.editor.copyLastWeek))!
    expect(copy.className).not.toContain('disabled')
    act(() => copy.dispatchEvent(new MouseEvent('click', { bubbles: true })))

    expect(host.textContent).toContain(S.editor.copiedLastWeek)
    expect(host.querySelectorAll('.weekband[data-wnum="2"] [data-rowid]')).toHaveLength(1)
  })

  it('does not report success or overwrite content when the source week is missing', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    act(() => root?.render(
      <PlanEditor initialWeeks={[week(2, [row('existing')])]}
        weeksCount={2} studentName="学员" planName="计划" />,
    ))
    selectDay(2)
    copyLastWeek()

    expect(host.textContent).not.toContain(S.editor.copiedLastWeek)
    expect(host.querySelectorAll('.weekband[data-wnum="2"] [data-rowid="existing"]')).toHaveLength(1)
    expect(confirm).not.toHaveBeenCalled()
  })

  it.each([true, false])('overwrites the whole occupied week only when confirm returns %s', (confirmed) => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(confirmed)
    const source = week(1, [row('source', { name: 'Source Monday' })])
    const target = week(2, [row('existing', { name: 'Existing Monday' })])
    target.days[4] = { ...target.days[4], rest: false, rows: [row('existing-friday', { name: 'Existing Friday' })] }
    act(() => root?.render(
      <PlanEditor initialWeeks={[source, target]}
        weeksCount={2} studentName="学员" planName="计划" />,
    ))
    selectDay(2, 4)
    copyLastWeek()

    expect(confirm).toHaveBeenCalledTimes(1)
    expect(confirm).toHaveBeenCalledWith(S.editor.overwriteWeekConfirm(2))
    expect(dayNames(2, 0)).toEqual([confirmed ? 'Source Monday' : 'Existing Monday'])
    expect(dayNames(2, 4)).toEqual(confirmed ? [] : ['Existing Friday'])
    expect(dayNames(1, 0)).toEqual(['Source Monday'])
    expect(host.textContent?.includes(S.editor.copiedLastWeek)).toBe(confirmed)
    expect(host.querySelectorAll('.weekband[data-wnum="2"] [data-rowid]')).toHaveLength(confirmed ? 1 : 2)
  })

  it('copies every training day by dow and keeps source rest days as rest days', () => {
    const source = week(1, [row('monday', { name: 'Source Monday' })])
    source.days[2] = { ...source.days[2], rest: false, rows: [
      row('wednesday-a', { name: 'Source Wednesday A' }),
      row('wednesday-b', { name: 'Source Wednesday B' }),
    ] }
    source.days[5] = { ...source.days[5], rest: false, rows: [row('saturday', { name: 'Source Saturday' })] }
    source.days.reverse()
    act(() => root?.render(
      <PlanEditor initialWeeks={[source, week(2, [])]}
        weeksCount={2} studentName="学员" planName="计划" />,
    ))
    selectDay(2, 5)
    copyLastWeek()

    expect(dayNames(2, 0)).toEqual(['Source Monday'])
    expect(dayNames(2, 2)).toEqual(['Source Wednesday A', 'Source Wednesday B'])
    expect(dayNames(2, 5)).toEqual(['Source Saturday'])
    for (const dow of [1, 3, 4, 6]) {
      const day = host.querySelector<HTMLElement>(`.weekband[data-wnum="2"] [data-dow="${dow}"]`)!
      expect(day.dataset.derivedRest).toBe('true')
      expect(day.textContent).toContain(S.editor.rest)
      expect(dayNames(2, dow)).toEqual([])
    }
    expect(host.textContent).toContain(S.editor.copiedLastWeek)
    const sourceIds = [...host.querySelectorAll<HTMLElement>('.weekband[data-wnum="1"] [data-rowid]')]
      .map((item) => item.dataset.rowid)
    const copiedIds = [...host.querySelectorAll<HTMLElement>('.weekband[data-wnum="2"] [data-rowid]')]
      .map((item) => item.dataset.rowid)
    expect(copiedIds).toHaveLength(4)
    expect(copiedIds.some((id) => sourceIds.includes(id))).toBe(false)
    expect(dayNames(1, 2)).toEqual(['Source Wednesday A', 'Source Wednesday B'])
  })

  it.each(['first-week', 'logged-target'] as const)('does not copy or report success for %s', (guard) => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    act(() => root?.render(
      <PlanEditor initialWeeks={[week(1, [row('source')]), week(2, [row('logged', { hasLogs: true })])]}
        weeksCount={2} studentName="学员" planName="计划" />,
    ))
    selectDay(guard === 'first-week' ? 1 : 2)
    copyLastWeek()

    expect(host.textContent).not.toContain(S.editor.copiedLastWeek)
    expect(host.querySelectorAll('.weekband[data-wnum="2"] [data-rowid="logged"]')).toHaveLength(1)
    expect(confirm).not.toHaveBeenCalled()
  })
})
