import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DayColumn } from './components/DayColumn'
import { PlanEditor, findIssueRows, replaceUnlockedRows } from './PlanEditor'
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
        colW={{ name: 92, sets: 26, reps: 26, int: 142, weight: 118, note: 36 }} selected
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

  it('disables row dragging for the entire mixed day', () => {
    const reorder = vi.fn()
    act(() => root?.render(
      <DayColumn
        day={{
          dow: 0, dowLabel: '周一', dateLabel: '1/1', rest: false,
          rows: [row('editable'), row('locked', { hasLogs: true })],
        }}
        colW={{ name: 92, sets: 26, reps: 26, int: 142, weight: 118, note: 36 }} selected
        onSelect={vi.fn()} onSelectRow={vi.fn()} onResizeStart={vi.fn()} onNameFocus={vi.fn()}
        onNameChange={vi.fn()} onNameBlur={vi.fn()} onAddRow={vi.fn()}
        onEditRow={vi.fn()} onReorderRow={reorder} onDeleteRow={vi.fn()}
      />,
    ))

    const handle = host.querySelector<HTMLElement>('[data-rowid="editable"] .rowdrag')!
    expect(handle.title).toContain('整天不可拖排')
    act(() => handle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })))
    expect(reorder).not.toHaveBeenCalled()
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

  it('marks filled invalid cells with their reason and leaves missing cells unmarked', () => {
    act(() => root?.render(
      <DayColumn
        day={{
          dow: 0, dowLabel: '周一', dateLabel: '1/1', rest: false,
          rows: [row('invalid', {
            reps: '99', mode: 'rpe', boxes: [{ val: '7.3', empty: false }, { val: '', empty: true }],
          })],
        }}
        colW={{ name: 92, sets: 26, reps: 26, int: 142, weight: 118, note: 36 }} selected
        onSelect={vi.fn()} onResizeStart={vi.fn()} onNameFocus={vi.fn()}
        onNameChange={vi.fn()} onNameBlur={vi.fn()} onAddRow={vi.fn()}
        onEditRow={vi.fn()} onDeleteRow={vi.fn()}
      />,
    ))

    const invalid = host.querySelectorAll<HTMLInputElement>('[data-input-invalid="true"]')
    expect(invalid).toHaveLength(2)
    expect(invalid[0].title).toContain('次数需 1–50')
    expect(invalid[1].title).toContain('RPE 需 1–10 半分档')
    const emptyLegacyRpe = host.querySelectorAll<HTMLInputElement>('[data-guard-field="intensity"]')[1]
    expect(emptyLegacyRpe.className).not.toContain('guard-invalid')
    expect(host.querySelector<HTMLSelectElement>('[aria-label="强度类型"]')?.value).toBe('rpe')
    expect([...host.querySelectorAll<HTMLInputElement>('[data-guard-field="weight"]')].map((input) => input.value))
      .toEqual([''])
  })

  it('focuses a filled invalid cell before an empty prescription cell', async () => {
    vi.useFakeTimers()
    act(() => root?.render(
      <PlanEditor initialWeeks={[week(1, [
        row('invalid', { reps: '99', boxes: [{ val: '', empty: true }] }),
      ])]} weeksCount={1} studentName="学员" planName="计划" />,
    ))

    const issueButton = buttonByText(host, '待核对')
    expect(issueButton.title).toContain('值无效')
    expect(issueButton.title).toContain('次数需 1–50')
    act(() => issueButton.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    await act(async () => { await vi.advanceTimersByTimeAsync(60) })
    expect(document.activeElement).toBe(host.querySelector('[data-guard-field="reps"]'))
  })

  it('disables copy on a mixed day and clear-day removes only unlocked rows', () => {
    const locked = row('locked', { serverRowId: 'pe-lock', serverSortOrder: 0, hasLogs: true })
    const editable = row('editable', { serverRowId: 'pe-edit', serverSortOrder: 1 })
    act(() => root?.render(
      <PlanEditor initialWeeks={[week(1, [row('source')]), week(2, [locked, editable])]}
        weeksCount={2} studentName="学员" planName="计划" />,
    ))
    const targetDay = host.querySelector<HTMLElement>('.weekband[data-wnum="2"] .day[data-dow="0"]')!
    act(() => targetDay.dispatchEvent(new MouseEvent('click', { bubbles: true })))

    const copy = elementByText(host, '复制上周计划到本周')
    expect(copy.className).toContain('disabled')
    expect(copy.title).toContain('已打卡')
    expect(host.textContent).not.toContain('设为休息')

    act(() => {
      copy.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      elementByText(host, '清空本日').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    const remaining = host.querySelectorAll('.weekband[data-wnum="2"] [data-rowid]')
    expect(remaining).toHaveLength(1)
    expect((remaining[0] as HTMLElement).dataset.rowid).toBe('locked')
    expect(host.querySelector('.weekband[data-wnum="2"] .restday[data-dow="0"]')).toBeNull()
  })

  it('disables shift-all with a plan-level history tooltip when any row has logs', () => {
    act(() => root?.render(
      <PlanEditor initialWeeks={[week(1, [row('locked', { hasLogs: true })])]} weeksCount={1}
        studentName="学员" planName="计划" planStartDate="2026-01-01" />,
    ))

    const shift = [...host.querySelectorAll('button')].find((button) => button.textContent?.includes('起始'))
    if (!shift) throw new Error('start-date button not found')
    expect(shift.disabled).toBe(true)
    expect(shift.title).toContain('已有学员打卡动作')
  })

  it('whole-day paste replaces only unlocked rows and appends overflow after locked rows', () => {
    const day: DayCol = {
      dow: 0, dowLabel: '周一', dateLabel: '1/1', rest: false,
      rows: [
        row('editable', { serverRowId: 'pe-edit', serverSortOrder: 0 }),
        row('locked', { serverRowId: 'pe-lock', serverSortOrder: 1, hasLogs: true }),
      ],
    }
    const pasted = replaceUnlockedRows(day, [row('first', { name: '卧推' }), row('overflow', { name: '硬拉' })])

    expect(pasted.rows.map((item) => item.name)).toEqual(['卧推', '深蹲', '硬拉'])
    expect(pasted.rows[0]).toMatchObject({ serverRowId: null, serverSortOrder: 0, hasLogs: false })
    expect(pasted.rows[1]).toBe(day.rows[1])
    expect(pasted.rows[2]).toMatchObject({ serverRowId: null, serverSortOrder: null, hasLogs: false })
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
    act(() => host.querySelector<HTMLElement>('[data-add-tier]')!.dispatchEvent(new MouseEvent('click', { bubbles: true })))

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

  it('published update confirm folds in the unbound-row skip warning', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false) // cancel: only the message matters
    const onSave = vi.fn(async (weeks: Week[]) => ({ changedDays: 0, skippedRows: 0, weeks }))
    act(() => root?.render(
      <PlanEditor initialWeeks={[week(1, [
        row('bound'),
        row('loose', { exerciseId: null, name: '手写动作', ku: false }),
      ])]} weeksCount={1}
        studentName="学员" planName="已发布计划" initialPublished onSave={onSave} />,
    ))
    await act(async () => {
      buttonByText(host, '更新计划').dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('1 行未绑定动作库'))
    expect(onSave).not.toHaveBeenCalled()
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

describe('guarded input filtering ergonomics', () => {
  let host: HTMLDivElement
  let root: Root | null

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(() => {
    if (root) act(() => root?.unmount())
    host.remove()
    vi.restoreAllMocks()
  })

  // Stateful wrapper: the guarded inputs are controlled, so filtering behavior
  // only shows once edits round-trip through row state like in the real editor.
  function GuardHarness({ initial }: { initial: ExerciseRow }) {
    const [current, setCurrent] = useState(initial)
    return (
      <DayColumn
        day={{ dow: 0, dowLabel: '周一', dateLabel: '1/1', rest: false, rows: [current] }}
        colW={{ name: 92, sets: 26, reps: 26, int: 142, weight: 118, note: 36 }} selected
        onSelect={vi.fn()} onResizeStart={vi.fn()} onNameFocus={vi.fn()}
        onNameChange={vi.fn()} onNameBlur={vi.fn()} onAddRow={vi.fn()}
        onEditRow={(_, updater) => setCurrent((prev) => updater(prev))} onDeleteRow={vi.fn()}
      />
    )
  }

  function strengthInput(): HTMLInputElement {
    return host.querySelector<HTMLInputElement>('[data-guard-field="weight"]')!
  }

  function setValueWithCaret(input: HTMLInputElement, value: string, caret: number): void {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
    input.setSelectionRange(caret, caret)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }

  it('keeps the caret at the kept prefix when filtering drops pasted characters mid-value', () => {
    act(() => root?.render(<GuardHarness initial={row('r1')} />))
    const input = strengthInput()
    expect(input.value).toBe('100')

    // Paste "你" at 1|00 → DOM briefly "1你00" with caret after the paste (index 2).
    act(() => setValueWithCaret(input, '1你00', 2))

    expect(input.value).toBe('100')
    expect(input.selectionStart).toBe(1) // right after the kept "1", not at the end
  })

  it('lets IME composition text through untouched and filters once on compositionend', () => {
    act(() => root?.render(<GuardHarness initial={row('r1', { boxes: [{ val: '8', empty: false }] })} />))
    const input = strengthInput()

    act(() => { input.dispatchEvent(new Event('compositionstart', { bubbles: true })) })
    // Mid-composition keystrokes must stay verbatim so the candidate window survives.
    act(() => setValueWithCaret(input, '8ni', 3))
    expect(input.value).toBe('8ni')

    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, '8你')
    act(() => { input.dispatchEvent(new Event('compositionend', { bubbles: true })) })
    expect(input.value).toBe('8')
  })

  it('filters the reps field while preserving range and amrap notation', () => {
    act(() => root?.render(<GuardHarness initial={row('r1', { reps: '8' })} />))
    const reps = host.querySelector<HTMLInputElement>('[data-guard-field="reps"]')!

    act(() => setValueWithCaret(reps, '8-10', 4))
    expect(reps.value).toBe('8-10')

    act(() => setValueWithCaret(reps, '8-10次', 5))
    expect(reps.value).toBe('8-10')
  })

  it('offers six intensity types and preserves the uniform-to-per-set weight handoff', () => {
    act(() => root?.render(<GuardHarness initial={row('r1', {
      intensity: null,
      weightMode: 'uniform',
      boxes: [{ val: '', empty: true }, { val: '', empty: true }],
    })} />))

    const select = host.querySelector<HTMLSelectElement>('[aria-label="强度类型"]')!
    expect([...select.options].map((option) => option.value).filter(Boolean)).toEqual([
      'pct', 'rpe', 'rir', 'weight_range', 'rpe_range', 'fixed_weight',
    ])
    expect(select.textContent).not.toContain('旧逐组')

    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(select, 'rpe')
    act(() => select.dispatchEvent(new Event('change', { bubbles: true })))
    expect(host.querySelectorAll('[data-guard-field="intensity"]')).toHaveLength(1)
    const perSetIntensity = [...host.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === '逐组')!
    act(() => perSetIntensity.click())
    expect(host.querySelectorAll('[data-guard-field="intensity"]')).toHaveLength(2)

    const uniform = host.querySelector<HTMLInputElement>('[data-guard-field="weight"]')!
    act(() => setValueWithCaret(uniform, '170', 3))
    expect(host.querySelectorAll('[data-guard-field="weight"]')).toHaveLength(1)

    const perSet = [...host.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === '逐组标重')!
    act(() => perSet.click())
    expect([...host.querySelectorAll<HTMLInputElement>('[data-guard-field="weight"]')].map((input) => input.value))
      .toEqual(['170', '170'])
  })

  it('surfaces the weight-range conflict directly in the row', () => {
    act(() => root?.render(<GuardHarness initial={row('r1', {
      intensity: null,
      weightMode: 'uniform',
      boxes: [{ val: '170', empty: false }],
    })} />))
    const select = host.querySelector<HTMLSelectElement>('[aria-label="强度类型"]')!
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(select, 'weight_range')
    act(() => select.dispatchEvent(new Event('change', { bubbles: true })))
    const inputs = host.querySelectorAll<HTMLInputElement>('[data-guard-field^="intensity"]')
    act(() => setValueWithCaret(inputs[0], '165', 3))
    act(() => setValueWithCaret(inputs[1], '175', 3))

    expect(host.querySelector<HTMLElement>('.matrix-warning')?.title)
      .toBe('重量区间不能同时填写重量列')
  })
})
