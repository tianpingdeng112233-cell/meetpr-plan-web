import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlanEditor } from './PlanEditor'
import type { DayCol, ExerciseRow, Week } from './types'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function row(): ExerciseRow {
  return {
    id: 'squat',
    serverRowId: null,
    serverSortOrder: null,
    hasLogs: false,
    conflictMessage: null,
    exerciseId: 'squat',
    name: '竞技深蹲',
    ku: true,
    custom: false,
    isMain: true,
    aux: false,
    reps: '3',
    mode: 'kg',
    boxes: [{ val: '150', empty: false }],
    note: '',
  }
}

function week(num = 31): Week {
  const days: DayCol[] = Array.from({ length: 7 }, (_, dow) => ({
    dow,
    dowLabel: `周${dow + 1}`,
    dateLabel: `${num === 31 ? 7 : 8}/${num === 31 ? 27 + dow : 3 + dow}`,
    rest: dow !== 0,
    rows: dow === 0 ? [{ ...row(), id: `squat-${num}` }] : [],
  }))
  return {
    num,
    num2: String(num).padStart(2, '0'),
    range: num === 31 ? '7/27–8/2' : '8/3–8/9',
    isCurrent: num === 31,
    vol: '',
    days,
  }
}

function keyboardWeek(): Week {
  const first = {
    ...row(),
    id: 'squat-first',
    boxes: [
      { val: '150', empty: false },
      { val: '145', empty: false },
      { val: '140', empty: false },
    ],
  }
  const second = {
    ...row(),
    id: 'squat-second',
    name: '暂停深蹲',
    boxes: [
      { val: '130', empty: false },
      { val: '125', empty: false },
      { val: '120', empty: false },
    ],
  }
  const base = week()
  return {
    ...base,
    days: base.days.map((day) => day.dow === 0 ? { ...day, rows: [first, second] } : day),
  }
}

function setInput(input: HTMLInputElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('plan editor cell selection UI', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
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

  it('selects one independent cell, reports A1 · W31, and clears it with Escape', () => {
    act(() => root.render(
      <PlanEditor initialWeeks={[week()]} weeksCount={1} studentName="学员" planName="计划" />,
    ))

    const nameInput = host.querySelector<HTMLInputElement>('[data-plan-cell="name"] input')!
    act(() => nameInput.dispatchEvent(new MouseEvent('click', { bubbles: true })))

    expect(host.querySelector('[data-plan-cell="name"]')?.className).toContain('plan-cell-selected')
    expect(host.querySelector('[data-cell-reference]')?.textContent).toBe('A1 · W31')
    expect(host.querySelector('.day.sel')).not.toBeNull()
    expect(host.querySelector('.exrow.row-sel')).not.toBeNull()

    const cases = [
      ['sets', '组数'],
      ['reps', '次数'],
      ['intensity', '强度'],
      ['weight', '统一重量'],
    ] as const
    for (const [field, label] of cases) {
      const cell = host.querySelector<HTMLElement>(`[data-plan-cell="${field}"]`)!
      const input = cell.matches('input,select') ? cell : cell.querySelector<HTMLElement>('input,select')!
      act(() => input.dispatchEvent(new MouseEvent('click', { bubbles: true })))
      expect(host.querySelectorAll('.plan-cell-selected')).toHaveLength(1)
      expect(host.querySelector(`[data-plan-cell="${field}"]`)?.className).toContain('plan-cell-selected')
      expect(host.querySelector('.plan-formula-label')?.textContent).toContain(label)
      expect(host.querySelector('[data-cell-reference]')?.textContent).toBe('A1 · W31')
    }

    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(host.querySelector('.plan-cell-selected')).toBeNull()
    expect(host.querySelector('[data-cell-reference]')?.textContent).toBe('—')
    expect(host.querySelector('.plan-formula-bar output')?.textContent).toBe('/')
  })

  it('clears old-week selections when jumping to another visible week', () => {
    act(() => root.render(
      <PlanEditor initialWeeks={[week(31), week(32)]} weeksCount={2} studentName="学员" planName="计划" />,
    ))

    const week31Name = host.querySelector<HTMLInputElement>('.weekband[data-wnum="31"] [data-plan-cell="name"] input')!
    act(() => week31Name.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(host.querySelector('[data-cell-reference]')?.textContent).toBe('A1 · W31')

    const jump = [...host.querySelectorAll<HTMLElement>('span')]
      .find((element) => element.childNodes[0]?.textContent?.trim() === '跳到周')!
    act(() => jump.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    const week32Jump = [...host.querySelectorAll<HTMLElement>('.popitem')]
      .find((element) => element.textContent === 'W32')!
    act(() => week32Jump.dispatchEvent(new MouseEvent('click', { bubbles: true })))

    expect(host.querySelector('.day.sel')).toBeNull()
    expect(host.querySelector('.exrow.row-sel')).toBeNull()
    expect(host.querySelector('.plan-cell-selected')).toBeNull()
    expect(host.querySelector('[data-cell-reference]')?.textContent).toBe('—')
    expect(host.textContent).toContain('W32 · 第 32 周')
  })

  it('selects the sets cell on focus and mirrors its local draft in the formula bar', () => {
    act(() => root.render(
      <PlanEditor initialWeeks={[week()]} weeksCount={1} studentName="学员" planName="计划" />,
    ))

    const setsInput = host.querySelector<HTMLInputElement>('[data-plan-cell="sets"] input')!
    act(() => setsInput.focus())
    expect(host.querySelector('[data-cell-reference]')?.textContent).toBe('A1 · W31')
    expect(host.querySelector('.plan-formula-label')?.textContent).toContain('组数')

    act(() => setInput(setsInput, ''))
    expect(host.querySelector('.plan-formula-bar output')?.textContent).toBe('/')

    act(() => setInput(setsInput, '4'))
    expect(host.querySelector('.plan-formula-bar output')?.textContent).toBe('4 组')
  })

  it('a blurred sets edit lands as one undo record and the formula bar follows the undo', () => {
    act(() => root.render(
      <PlanEditor initialWeeks={[week()]} weeksCount={1} studentName="学员" planName="计划" />,
    ))

    const setsInput = host.querySelector<HTMLInputElement>('[data-plan-cell="sets"] input')!
    const initialCount = setsInput.value
    act(() => setsInput.focus())
    act(() => setInput(setsInput, '4'))
    act(() => { setsInput.blur(); setsInput.dispatchEvent(new FocusEvent('blur', { bubbles: true })) })
    expect(host.querySelector<HTMLInputElement>('[data-plan-cell="sets"] input')!.value).toBe('4')

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true }))
    })
    expect(host.querySelector<HTMLInputElement>('[data-plan-cell="sets"] input')!.value).toBe(initialCount)
    const formulaValue = host.querySelector('.plan-formula-bar output')?.textContent ?? ''
    expect(formulaValue.startsWith(initialCount)).toBe(true)
  })

  it('moves through the Tab chain, wraps to the next row, and keeps Enter in the same column', async () => {
    await act(async () => {
      root.render(
        <PlanEditor key="mutable" initialWeeks={[keyboardWeek()]} weeksCount={1} studentName="学员" planName="计划" />,
      )
    })
    const firstName = host.querySelector<HTMLInputElement>('[data-rowid="squat-first"] [data-plan-cell="name"] input')!
    await act(async () => { firstName.focus() })

    for (const expected of ['sets', 'reps', 'intensity', 'weight', 'weight', 'weight', 'name']) {
      await act(async () => {
        document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Tab',
          bubbles: true,
          cancelable: true,
        }))
        await new Promise((resolve) => window.setTimeout(resolve, 0))
      })
      expect(host.querySelector('.plan-cell-selected')?.getAttribute('data-plan-cell')).toBe(expected)
    }
    expect(host.querySelector('.plan-cell-selected')?.closest('[data-rowid]')?.getAttribute('data-rowid')).toBe('squat-second')

    await act(async () => {
      document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }))
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })
    expect(host.querySelector('.plan-cell-selected')?.closest('[data-rowid]')?.getAttribute('data-rowid')).toBe('squat-first')
    expect(host.querySelector('.plan-cell-selected')?.getAttribute('data-set-index')).toBe('2')

    const firstStrength = host.querySelector<HTMLInputElement>('[data-rowid="squat-first"] [data-set-index="0"]')!
    await act(async () => { firstStrength.focus() })
    await act(async () => {
      firstStrength.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })
    expect(host.querySelector('.plan-cell-selected')?.closest('[data-rowid]')?.getAttribute('data-rowid')).toBe('squat-second')
    expect(host.querySelector('.plan-cell-selected')?.getAttribute('data-set-index')).toBe('0')
  })

  it('commits a set-count draft through blur before Tab moves', async () => {
    await act(async () => {
      root.render(
        <PlanEditor initialWeeks={[keyboardWeek()]} weeksCount={1} studentName="学员" planName="计划" />,
      )
    })
    const setsInput = host.querySelector<HTMLInputElement>('[data-rowid="squat-first"] [data-plan-cell="sets"] input')!
    await act(async () => { setsInput.focus() })
    act(() => setInput(setsInput, ''))

    await act(async () => {
      setsInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })
    expect(host.querySelector<HTMLInputElement>('[data-rowid="squat-first"] [data-plan-cell="sets"] input')?.value).toBe('')
    expect(host.querySelector('.plan-cell-selected')?.getAttribute('data-plan-cell')).toBe('reps')
  })

  it('fills the selected intensity downward with ⌘D and refuses the mutation in read-only plans', async () => {
    await act(async () => {
      root.render(
        <PlanEditor initialWeeks={[keyboardWeek()]} weeksCount={1} studentName="学员" planName="计划" />,
      )
    })
    const firstStrength = host.querySelector<HTMLInputElement>('[data-rowid="squat-first"] [data-set-index="0"]')!
    await act(async () => { firstStrength.focus() })
    await act(async () => {
      firstStrength.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'd',
        metaKey: true,
        bubbles: true,
        cancelable: true,
      }))
    })
    expect([...host.querySelectorAll<HTMLInputElement>('[data-rowid="squat-first"] [data-set-index]')].map((input) => input.value))
      .toEqual(['150', '150', '150'])

    await act(async () => {
      root.render(
        <PlanEditor
          key="read-only"
          initialWeeks={[keyboardWeek()]}
          weeksCount={1}
          studentName="学员"
          planName="计划"
          readOnly
        />,
      )
    })
    const readOnlyFirst = host.querySelector<HTMLInputElement>('[data-rowid="squat-first"] [data-set-index="0"]')!
    expect([...host.querySelectorAll<HTMLInputElement>('[data-rowid] input')].every((input) => input.disabled)).toBe(true)
    const shortcut = new KeyboardEvent('keydown', {
      key: 'd',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    })
    await act(async () => {
      readOnlyFirst.dispatchEvent(shortcut)
    })
    expect(shortcut.defaultPrevented).toBe(true)
    expect([...host.querySelectorAll<HTMLInputElement>('[data-rowid="squat-first"] [data-set-index]')].map((input) => input.value))
      .toEqual(['150', '145', '140'])
  })
})
