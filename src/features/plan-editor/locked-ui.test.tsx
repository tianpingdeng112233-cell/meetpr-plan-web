import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DayColumn } from './components/DayColumn'
import { PlanEditor, findIssueRows } from './PlanEditor'
import { ExerciseIndex } from './exerciseIndex'
import { ReconcileConflict } from './reconcile'
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
      dow, dowLabel: `周${dow + 1}`, dateLabel: '', rest: dow !== 0, rows: dow === 0 ? mondayRows : [],
    })),
  }
}

function buttonByText(container: HTMLElement, text: string): HTMLButtonElement {
  const button = [...container.querySelectorAll('button')].find((item) => item.textContent?.includes(text))
  if (!button) throw new Error(`button not found: ${text}`)
  return button
}

function elementByText(container: HTMLElement, text: string): HTMLElement {
  const element = [...container.querySelectorAll<HTMLElement>('span')].find((item) => item.textContent?.includes(text))
  if (!element) throw new Error(`element not found: ${text}`)
  return element
}

function setInput(input: HTMLInputElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('exercise history lock UI', () => {
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
    vi.useRealTimers()
  })

  it('disables every editable field, renders the lock tooltip, and hides row delete', () => {
    const locked = row('locked', {
      serverRowId: 'pe-1', serverSortOrder: 0, hasLogs: true,
      boxes: [{ val: '100', empty: false }, { val: '105', empty: false }], note: '保持节奏',
    })
    act(() => root?.render(
      <DayColumn
        day={{ dow: 0, dowLabel: '周一', dateLabel: '1/1', rest: false, rows: [locked] }}
        colW={{ name: 92, sets: 26, reps: 26, int: 110, note: 36 }} selected
        onSelect={vi.fn()} onResizeStart={vi.fn()} onNameFocus={vi.fn()}
        onNameChange={vi.fn()} onNameBlur={vi.fn()} onAddRow={vi.fn()}
        onEditRow={vi.fn()} onDeleteRow={vi.fn()}
      />,
    ))

    const lockedRow = host.querySelector<HTMLElement>('[data-locked="true"]')!
    expect([...lockedRow.querySelectorAll('input')].every((input) => input.disabled)).toBe(true)
    expect(lockedRow.querySelector('.rowdel')).toBeNull()
    expect(lockedRow.querySelector('[title="学员已打卡,此行及其组不可修改"]')).not.toBeNull()
  })

  it('excludes locked rows from pending issues while preserving grid-order cursor numbering', () => {
    const issues = findIssueRows([week(1, [
      row('locked-unbound', { hasLogs: true, exerciseId: null, name: '未知动作', ku: false }),
      row('first', { exerciseId: null, name: '未绑定', ku: false }),
      row('locked-empty', { hasLogs: true, boxes: [] }),
      row('second', { boxes: [] }),
    ])])
    expect(issues).toEqual([
      { rowId: 'first', kind: 'unbound' },
      { rowId: 'second', kind: 'noSets' },
    ])
  })

  it('disables copy/rest conversion on a mixed day and clear-day removes only unlocked rows', () => {
    const locked = row('locked', { serverRowId: 'pe-lock', serverSortOrder: 0, hasLogs: true })
    const editable = row('editable', { serverRowId: 'pe-edit', serverSortOrder: 1 })
    act(() => root?.render(
      <PlanEditor initialWeeks={[week(1, [row('source')]), week(2, [locked, editable])]}
        weeksCount={2} studentName="学员" planName="计划" />,
    ))
    const targetDay = host.querySelector<HTMLElement>('.weekband[data-wnum="2"] .day[data-dow="0"]')!
    act(() => targetDay.dispatchEvent(new MouseEvent('click', { bubbles: true })))

    const copy = elementByText(host, '复制上周计划到本周')
    const rest = elementByText(host, '设为休息')
    expect(copy.className).toContain('disabled')
    expect(copy.title).toContain('已打卡')
    expect(rest.className).toContain('disabled')
    expect(rest.title).toContain('已打卡')

    act(() => {
      copy.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      rest.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      elementByText(host, '清空本日').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    const remaining = host.querySelectorAll('.weekband[data-wnum="2"] [data-rowid]')
    expect(remaining).toHaveLength(1)
    expect((remaining[0] as HTMLElement).dataset.rowid).toBe('locked')
    expect(host.querySelector('.weekband[data-wnum="2"] .restday[data-dow="0"]')).toBeNull()
  })

  it('renders a new row in a just-released mixed-day slot before save, avoiding order jumps', () => {
    const editable = row('editable', { serverRowId: 'pe-edit', serverSortOrder: 0 })
    const locked = row('locked', { serverRowId: 'pe-lock', serverSortOrder: 1, hasLogs: true })
    act(() => root?.render(
      <PlanEditor initialWeeks={[week(1, [editable, locked])]} weeksCount={1}
        studentName="学员" planName="计划" />,
    ))
    const day = host.querySelector<HTMLElement>('.weekband[data-wnum="1"] .day[data-dow="0"]')!
    act(() => day.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    const remove = day.querySelector<HTMLElement>('[data-rowid="editable"] .rowdel')!
    act(() => remove.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    act(() => elementByText(host, '＋ 加动作').dispatchEvent(new MouseEvent('click', { bubbles: true })))

    const ids = [...host.querySelectorAll<HTMLElement>('.weekband[data-wnum="1"] [data-rowid]')]
      .map((element) => element.dataset.rowid)
    expect(ids).toHaveLength(2)
    expect(ids[0]).not.toBe('locked')
    expect(ids[1]).toBe('locked')
  })

  it('published edits never autosave, require update confirmation, and arm the leave guard', async () => {
    vi.useFakeTimers()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const onSave = vi.fn(async (weeks: Week[]) => ({ changedDays: 1, skippedRows: 0, weeks }))
    act(() => root?.render(
      <PlanEditor initialWeeks={[week(1, [row('editable')])]} weeksCount={1}
        studentName="学员" planName="已发布计划" initialPublished onSave={onSave} />,
    ))
    const note = host.querySelector<HTMLInputElement>('[data-c="note"] input')!
    act(() => setInput(note, '本地修改'))
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000) })
    expect(onSave).not.toHaveBeenCalled()

    const leave = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(leave)
    expect(leave.defaultPrevented).toBe(true)

    await act(async () => {
      buttonByText(host, '更新计划').dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('保存会立即改变 ta 正在看的计划'))
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(buttonByText(host, '已发布 · 不可撤回').disabled).toBe(true)
  })

  it('keeps xlsx import forbidden for a published plan', async () => {
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {})
    act(() => root?.render(
      <PlanEditor initialWeeks={[week(1, [])]} weeksCount={1} studentName="学员" planName="已发布计划"
        initialPublished planStartDate="2026-01-01" exerciseIndex={new ExerciseIndex([])} />,
    ))
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!
    Object.defineProperty(input, 'files', { value: [new File(['x'], 'plan.xlsx')], configurable: true })
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })))
    expect(alert).toHaveBeenCalledWith(expect.stringContaining('请先点右上「新建计划」'))
  })

  it('keeps published changes unsaved after a scoped 409 instead of showing a false saved state', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const merged = [week(1, [row('editable', {
      serverRowId: 'pe', serverSortOrder: 0, hasLogs: true,
      conflictMessage: '学员刚打了卡,该行已锁定并还原',
    })])]
    const onSave = vi.fn().mockRejectedValue(new ReconcileConflict('EXERCISE_HISTORY_IMMUTABLE', merged))
    act(() => root?.render(
      <PlanEditor initialWeeks={[week(1, [row('editable', { serverRowId: 'pe', serverSortOrder: 0 })])]}
        weeksCount={1} studentName="学员" planName="已发布计划" initialPublished onSave={onSave} />,
    ))
    const note = host.querySelector<HTMLInputElement>('[data-c="note"] input')!
    act(() => setInput(note, '竞态中的本地修改'))
    await act(async () => {
      buttonByText(host, '更新计划').dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(host.textContent).toContain('相关动作已锁定并还原，其余修改仍保留')
    expect(host.querySelector('[data-locked="true"]')).not.toBeNull()
    const leave = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(leave)
    expect(leave.defaultPrevented).toBe(true)
  })
})
