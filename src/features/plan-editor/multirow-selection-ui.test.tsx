import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlanEditor } from './PlanEditor'
import type { DayCol, ExerciseRow, Week } from './types'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function row(id: string, name: string, partial: Partial<ExerciseRow> = {}): ExerciseRow {
  return {
    id,
    serverRowId: null,
    serverSortOrder: null,
    hasLogs: false,
    conflictMessage: null,
    exerciseId: id,
    name,
    ku: true,
    custom: false,
    isMain: false,
    target: null,
    aux: false,
    reps: '8',
    mode: 'kg',
    boxes: [{ val: '40', empty: false }],
    note: `${name}备注`,
    ...partial,
  }
}

function week(secondDayRows: ExerciseRow[] = []): Week {
  const firstDayRows = [
    row('row-a', '动作 A'),
    row('row-b', '动作 B'),
    row('row-c', '动作 C'),
    row('row-d', '动作 D'),
  ]
  const days: DayCol[] = Array.from({ length: 7 }, (_, dow) => ({
    dow,
    dowLabel: `周${dow + 1}`,
    dateLabel: `7/${27 + dow}`,
    rest: dow > 1 || (dow === 1 && secondDayRows.length === 0),
    rows: dow === 0 ? firstDayRows : dow === 1 ? secondDayRows : [],
  }))
  return {
    num: 31,
    num2: '31',
    range: '7/27–8/2',
    isCurrent: true,
    vol: '',
    days,
  }
}

function pointerClick(element: Element, modifiers: MouseEventInit = {}): void {
  element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, ...modifiers }))
  element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, ...modifiers }))
  element.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0, detail: 1, ...modifiers }))
}

function setInput(input: HTMLInputElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function selectedIds(host: HTMLElement): string[] {
  return [...host.querySelectorAll<HTMLElement>('.exrow.row-sel')].map((element) => element.dataset.rowid ?? '')
}

describe('plan editor multi-row selection UI', () => {
  let host: HTMLDivElement
  let root: Root
  let writeText: ReturnType<typeof vi.fn>
  let readText: ReturnType<typeof vi.fn>
  let originalClipboard: PropertyDescriptor | undefined

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    writeText = vi.fn().mockResolvedValue(undefined)
    readText = vi.fn().mockResolvedValue('')
    originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText, readText },
    })
    Object.defineProperty(Element.prototype, 'scrollIntoView', { value: vi.fn(), configurable: true })
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard)
    else Reflect.deleteProperty(navigator, 'clipboard')
    vi.restoreAllMocks()
  })

  it('adds a row with Command-click while keeping the original row as anchor', () => {
    act(() => root.render(
      <PlanEditor initialWeeks={[week()]} weeksCount={1} studentName="学员" planName="计划" />,
    ))

    act(() => pointerClick(host.querySelector('[data-rowid="row-b"]')!))
    act(() => pointerClick(host.querySelector('[data-rowid="row-d"] [data-plan-cell="name"] input')!, { metaKey: true }))

    expect(selectedIds(host)).toEqual(['row-b', 'row-d'])
    expect(host.textContent).toContain('当前行 · 动作 B')
  })

  it('toggles rows off, moves a removed anchor to the earliest remaining row, and collapses extras on Escape', () => {
    act(() => root.render(
      <PlanEditor initialWeeks={[week()]} weeksCount={1} studentName="学员" planName="计划" />,
    ))
    act(() => pointerClick(host.querySelector('[data-rowid="row-c"]')!))
    act(() => pointerClick(host.querySelector('[data-rowid="row-a"]')!, { metaKey: true }))

    act(() => pointerClick(host.querySelector('[data-rowid="row-c"]')!, { metaKey: true }))
    expect(selectedIds(host)).toEqual(['row-a'])
    expect(host.textContent).toContain('当前行 · 动作 A')

    act(() => pointerClick(host.querySelector('[data-rowid="row-b"]')!, { ctrlKey: true }))
    expect(selectedIds(host)).toEqual(['row-a', 'row-b'])
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(selectedIds(host)).toEqual(['row-a'])
  })

  it('selects the inclusive row interval from the anchor with Shift-click', () => {
    act(() => root.render(
      <PlanEditor initialWeeks={[week()]} weeksCount={1} studentName="学员" planName="计划" />,
    ))
    act(() => pointerClick(host.querySelector('[data-rowid="row-b"]')!))
    act(() => pointerClick(host.querySelector('[data-rowid="row-d"]')!, { shiftKey: true }))

    expect(selectedIds(host)).toEqual(['row-b', 'row-c', 'row-d'])
    expect(host.textContent).toContain('当前行 · 动作 B')
  })

  it('uses tiered display order for an interleaved Shift range and multi-row copy', async () => {
    const interleaved = week()
    interleaved.days[0] = {
      ...interleaved.days[0],
      rows: [
        row('main-1', '主项 1', { isMain: true }),
        row('aux-1', '辅助项 1'),
        row('main-2', '主项 2', { isMain: true }),
      ],
    }
    await act(async () => {
      root.render(<PlanEditor initialWeeks={[interleaved]} weeksCount={1} studentName="学员" planName="计划" />)
    })

    act(() => pointerClick(host.querySelector('[data-rowid="main-1"]')!))
    act(() => pointerClick(host.querySelector('[data-rowid="aux-1"]')!, { shiftKey: true }))

    expect(selectedIds(host)).toEqual(['main-1', 'main-2', 'aux-1'])
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', metaKey: true, bubbles: true }))
      await Promise.resolve()
    })
    const copied = String(writeText.mock.calls[0]?.[0] ?? '')
    expect(copied.split('\n').slice(1).map((line) => line.split('\t')[0]))
      .toEqual(['主项 1', '主项 2', '辅助项 1'])
  })

  it('resets to a single row when clicking a different day, even with Command held', () => {
    const target = row('row-target', '目标日动作')
    act(() => root.render(
      <PlanEditor initialWeeks={[week([target])]} weeksCount={1} studentName="学员" planName="计划" />,
    ))
    act(() => pointerClick(host.querySelector('[data-rowid="row-a"]')!))
    act(() => pointerClick(host.querySelector('[data-rowid="row-c"]')!, { metaKey: true }))

    act(() => pointerClick(host.querySelector('[data-rowid="row-target"]')!, { metaKey: true }))

    expect(selectedIds(host)).toEqual(['row-target'])
    expect(host.querySelector('[data-rowid="row-target"]')?.closest('.day')?.className).toContain('sel')
  })

  it('serializes a multi-row copy in day order rather than click order', async () => {
    await act(async () => {
      root.render(<PlanEditor initialWeeks={[week()]} weeksCount={1} studentName="学员" planName="计划" />)
    })
    act(() => pointerClick(host.querySelector('[data-rowid="row-c"]')!))
    act(() => pointerClick(host.querySelector('[data-rowid="row-a"]')!, { metaKey: true }))
    act(() => pointerClick(host.querySelector('[data-rowid="row-b"]')!, { metaKey: true }))

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', metaKey: true, bubbles: true }))
      await Promise.resolve()
    })

    const copied = String(writeText.mock.calls[0]?.[0] ?? '')
    expect(copied.split('\n').slice(1).map((line) => line.split('\t')[0])).toEqual(['动作 A', '动作 B', '动作 C'])
    expect(host.querySelector('.plan-autosave-status')?.textContent).toContain('已复制 3 个动作')
  })

  it('copies all selected rows when Command-C originates from a focused grid input', async () => {
    await act(async () => {
      root.render(<PlanEditor initialWeeks={[week()]} weeksCount={1} studentName="学员" planName="计划" />)
    })
    act(() => pointerClick(host.querySelector('[data-rowid="row-a"]')!))
    act(() => pointerClick(host.querySelector('[data-rowid="row-b"]')!, { metaKey: true }))
    const focusedInput = host.querySelector<HTMLInputElement>('[data-rowid="row-b"] [data-plan-cell="name"] input')!
    act(() => focusedInput.focus())
    expect(document.activeElement).toBe(focusedInput)
    expect(selectedIds(host)).toEqual(['row-a', 'row-b'])

    await act(async () => {
      focusedInput.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'c', metaKey: true, bubbles: true, cancelable: true,
      }))
      await Promise.resolve()
    })

    const copied = String(writeText.mock.calls[0]?.[0] ?? '')
    expect(copied.split('\n').slice(1).map((line) => line.split('\t')[0])).toEqual(['动作 A', '动作 B'])
  })

  it('clears an out-of-range intensity cell after reducing sets while preserving the valid row selection', () => {
    const data = week()
    data.days[0] = {
      ...data.days[0],
      rows: [
        row('row-a', '动作 A'),
        row('row-b', '动作 B', {
          boxes: [
            { val: '40', empty: false },
            { val: '42', empty: false },
            { val: '44', empty: false },
          ],
        }),
      ],
    }
    act(() => root.render(
      <PlanEditor initialWeeks={[data]} weeksCount={1} studentName="学员" planName="计划" />,
    ))
    act(() => pointerClick(host.querySelector('[data-rowid="row-a"]')!))
    act(() => pointerClick(host.querySelector('[data-rowid="row-b"]')!, { metaKey: true }))
    const thirdIntensity = host.querySelector<HTMLInputElement>('[data-rowid="row-b"] [data-set-index="2"]')!
    act(() => thirdIntensity.focus())
    expect(host.querySelector('.plan-cell-selected')?.getAttribute('data-set-index')).toBe('2')
    expect(selectedIds(host)).toEqual(['row-a', 'row-b'])

    const setsInput = host.querySelector<HTMLInputElement>('[data-rowid="row-b"] [data-plan-cell="sets"] input')!
    act(() => setInput(setsInput, '1'))

    expect(host.querySelector('.plan-cell-selected')).toBeNull()
    expect(host.querySelector('[data-cell-reference]')?.textContent).toBe('—')
    expect(selectedIds(host)).toEqual(['row-a', 'row-b'])
    expect(host.textContent).toContain('当前行 · 动作 A')
  })

  it('pastes the whole copied selection into another day in one Command-V', async () => {
    await act(async () => {
      root.render(<PlanEditor initialWeeks={[week()]} weeksCount={1} studentName="学员" planName="计划" />)
    })
    act(() => pointerClick(host.querySelector('[data-rowid="row-a"]')!))
    act(() => pointerClick(host.querySelector('[data-rowid="row-c"]')!, { metaKey: true }))
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', metaKey: true, bubbles: true }))
      await Promise.resolve()
    })

    act(() => pointerClick(host.querySelector('.day[data-dow="1"]')!))
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', metaKey: true, bubbles: true }))
      await Promise.resolve()
    })

    const pastedNames = [...host.querySelectorAll<HTMLInputElement>('.day[data-dow="1"] [data-plan-cell="name"] input')]
      .map((input) => input.value)
    expect(pastedNames).toEqual(['动作 A', '动作 C'])
    expect(host.querySelectorAll('.day[data-dow="1"] .exrow')).toHaveLength(2)

    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true })))
    expect(host.querySelectorAll('.day[data-dow="1"] .exrow')).toHaveLength(0)
    expect(host.querySelector('.exrow.row-sel')).toBeNull()

    act(() => window.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'z', metaKey: true, shiftKey: true, bubbles: true,
    })))
    expect(host.querySelectorAll('.day[data-dow="1"] .exrow')).toHaveLength(2)
    expect(host.querySelector('.exrow.row-sel')).toBeNull()
  })
})
