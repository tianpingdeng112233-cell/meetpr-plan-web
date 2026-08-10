import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExerciseResponse } from '../../api/types'
import { PlanEditor } from './PlanEditor'
import { ExerciseIndex } from './exerciseIndex'
import { getBoundRowInputIssue } from './inputGuard'
import type { DayCol, ExerciseRow, Week } from './types'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function exercise(id: string, partial: Partial<ExerciseResponse>): ExerciseResponse {
  return {
    id, name: id, name_en: null, exercise_type: 'accessory', main_lift_family: null,
    is_competition_lift: false, muscle_groups: ['core'], equipment: ['barbell'],
    movement_pattern: ['other'], competition_stance: null, created_by_coach_id: null,
    created_at: '2026-01-01', ...partial,
  }
}

function row(id: string, exerciseId: string, name: string, isMain: boolean): ExerciseRow {
  return {
    id, serverRowId: null, serverSortOrder: null, hasLogs: false, conflictMessage: null,
    exerciseId, name, ku: true, custom: false, isMain, aux: false, reps: '5', mode: 'kg',
    boxes: [{ val: '100', empty: false }], note: '',
  }
}

function week(num: number, rows: ExerciseRow[] = [], current = false): Week {
  const days: DayCol[] = Array.from({ length: 7 }, (_, dow) => ({
    dow, dowLabel: `旧标签${dow + 1}`, dateLabel: `8/${dow + 1}`, rest: dow !== 0,
    rows: dow === 0 ? rows : [],
  }))
  return { num, num2: String(num).padStart(2, '0'), range: '', isCurrent: current, vol: '', days }
}

function visualOrderWeeks(): Week[] {
  const first = week(1, [
    row('w1-a', 'a', '动作 A', true),
    row('w1-b', 'b', '动作 B', true),
    row('w1-c', 'c', '动作 C', true),
  ])
  const second = week(2, [
    row('w2-a', 'a', '动作 A', true),
    row('w2-c', 'c', '动作 C', true),
    row('w2-b', 'b', '动作 B', true),
  ], true)
  return [first, second]
}

function pointerClick(element: Element, modifiers: MouseEventInit = {}): void {
  element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, ...modifiers }))
  element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, ...modifiers }))
  element.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0, detail: 1, ...modifiers }))
}

describe('spec 037 week-band UI', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.restoreAllMocks()
  })

  it('mounts only the active week ±1 while keeping all scroll slots and tabs', () => {
    const weeks = Array.from({ length: 12 }, (_, index) => week(index + 1, [], index === 5))
    act(() => root.render(<PlanEditor initialWeeks={weeks} weeksCount={12} studentName="学员" planName="计划" />))

    expect(host.querySelectorAll('[data-week-slot]')).toHaveLength(12)
    expect(host.querySelectorAll('.weekband[data-wnum]')).toHaveLength(3)
    expect(host.querySelectorAll('.week-tabs button:not(.week-tab-add)')).toHaveLength(12)
    expect(host.textContent).not.toContain('跳到周')
    expect(host.textContent).not.toContain('缩放')
    expect(host.querySelector('.weekband .weekrow')?.children[0]?.classList.contains('day')).toBe(true)
    expect(host.querySelector('.weekband .weekrow')?.children[1]?.classList.contains('day')).toBe(true)
  })

  it('aligns the exercise union and quick-adds an accessory as a guarded structured row', async () => {
    const squat = row('sq-w1', 'sq', '竞技深蹲', true)
    const fly = row('fly-w2', 'fly', '哑铃飞鸟', false)
    let savedAdded: ExerciseRow | undefined
    const onSave = vi.fn(async (savedWeeks: Week[]) => {
      savedAdded = savedWeeks[0].days[0].rows.find((item) => item.exerciseId === 'fly')
      return { changedDays: 1, skippedRows: 0, weeks: savedWeeks }
    })
    const index = new ExerciseIndex([
      exercise('sq', { name: '竞技深蹲', exercise_type: 'main_lift', main_lift_family: 'squat', muscle_groups: ['quad'] }),
      exercise('fly', { name: '哑铃飞鸟', exercise_type: 'accessory', muscle_groups: ['chest'] }),
    ])
    act(() => root.render(
      <PlanEditor initialWeeks={[week(1, [squat], true), week(2, [fly])]} weeksCount={2}
        studentName="学员" planName="计划" exerciseIndex={index} onSave={onSave} />,
    ))

    expect(host.querySelector('.weekband[data-wnum="1"] .week-band-badge.squat')?.textContent).toBe('蹲')
    expect(host.querySelector('.weekband[data-wnum="2"] .week-band-badge.muscle')?.textContent).toBe('胸')
    const empty = host.querySelector<HTMLButtonElement>('.weekband[data-wnum="1"] [data-empty-exercise-id="fly"]')!
    expect(empty.textContent).toContain('哑铃飞鸟')
    act(() => empty.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(host.querySelector('.weekband[data-wnum="1"] [data-empty-exercise-id="fly"]')).toBeNull()
    const addedName = [...host.querySelectorAll<HTMLInputElement>('.weekband[data-wnum="1"] [data-plan-cell="name"] input')]
      .find((input) => input.value === '哑铃飞鸟')!
    const addedRow = addedName.closest<HTMLElement>('[data-rowid]')!
    expect(addedRow.querySelector('[data-plan-cell="intensity"] select[aria-label="强度类型"]')).not.toBeNull()
    expect(addedRow.querySelector('.weightcell[data-c="weight"]')).not.toBeNull()
    expect(host.textContent).toContain('1 处待核对')
    const save = [...host.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === '保存草稿')!
    await act(async () => {
      save.click()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(savedAdded?.aux).toBe(false)
    expect(getBoundRowInputIssue(savedAdded!)).not.toBeNull()
  })

  it('chooses the lower-index week on a wide-viewport centre tie and moves the virtual window', () => {
    act(() => root.render(
      <PlanEditor initialWeeks={[week(1), week(2, [], true), week(3)]} weeksCount={3}
        studentName="学员" planName="计划" />,
    ))
    const scroller = host.querySelector<HTMLElement>('.scroller')!
    Object.defineProperty(scroller, 'clientWidth', { configurable: true, value: 1840 })
    scroller.getBoundingClientRect = () => ({ left: 0, width: 1840 } as DOMRect)
    const slots = [...host.querySelectorAll<HTMLElement>('[data-week-slot]')]
    slots.forEach((slot, index) => {
      slot.getBoundingClientRect = () => ({ left: index * 920, width: 920 } as DOMRect)
    })

    act(() => scroller.dispatchEvent(new Event('scroll')))

    expect(host.querySelector('.week-tabs button.active')?.textContent).toBe('W01')
    expect([...host.querySelectorAll<HTMLElement>('.weekband[data-wnum]')]
      .map((element) => element.dataset.wnum)).toEqual(['1', '2'])
  })

  it('clamps a late viewport to the new final week after shrinking the plan', async () => {
    const onChangePlanWeeks = vi.fn().mockResolvedValue(undefined)
    const weeks = Array.from({ length: 12 }, (_, index) => week(index + 1, [], index === 11))
    await act(async () => root.render(
      <PlanEditor initialWeeks={weeks} weeksCount={12} studentName="学员" planName="计划"
        planStartDate="2026-08-03" onChangePlanWeeks={onChangePlanWeeks} />,
    ))

    const cycleButton = [...host.querySelectorAll<HTMLButtonElement>('.plan-toolbar button')]
      .find((button) => button.textContent?.includes('12 周 · 周期化'))!
    act(() => cycleButton.click())
    const reduce = host.querySelector<HTMLButtonElement>('[aria-label="减少一周"]')!
    act(() => { for (let count = 0; count < 8; count++) reduce.click() })
    const apply = [...host.querySelectorAll<HTMLButtonElement>('.plan-toolbar button')]
      .find((button) => button.textContent === '应用')!
    await act(async () => {
      apply.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(onChangePlanWeeks).toHaveBeenCalledWith(4)
    expect(host.querySelectorAll('.week-tabs button:not(.week-tab-add)')).toHaveLength(4)
    expect(host.querySelector('.week-tabs button.active')?.textContent).toBe('W04')
    expect(host.querySelector('.weekband[data-wnum="4"]')?.textContent).toContain('第 4 周')
  })

  it('uses shared slot order for adjacent Shift selection when storage is A/C/B', () => {
    act(() => root.render(
      <PlanEditor initialWeeks={visualOrderWeeks()} weeksCount={2} studentName="学员" planName="计划" />,
    ))

    act(() => pointerClick(host.querySelector('[data-rowid="w2-a"]')!))
    act(() => pointerClick(host.querySelector('[data-rowid="w2-b"]')!, { shiftKey: true }))
    expect([...host.querySelectorAll<HTMLElement>('.weekband[data-wnum="2"] .exrow.row-sel')]
      .map((element) => element.dataset.rowid)).toEqual(['w2-a', 'w2-b'])
  })

  it('uses shared slot order for vertical keyboard navigation when storage is A/C/B', async () => {
    await act(async () => root.render(
      <PlanEditor initialWeeks={visualOrderWeeks()} weeksCount={2} studentName="学员" planName="计划" />,
    ))
    const sets = host.querySelector<HTMLInputElement>('[data-rowid="w2-a"] [data-plan-cell="sets"] input')!
    await act(async () => sets.focus())
    await act(async () => {
      sets.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })

    expect(host.querySelector('.plan-cell-selected')?.closest('[data-rowid]')?.getAttribute('data-rowid')).toBe('w2-b')
    expect(host.querySelector('.plan-cell-selected')?.getAttribute('data-plan-cell')).toBe('sets')
  })

  it('moves the shared skeleton in both rendered weeks and persists both sort orders', async () => {
    let savedRows: string[][] = []
    const onSave = vi.fn(async (savedWeeks: Week[]) => {
      savedRows = savedWeeks.map((item) => item.days[0].rows.map((entry) => entry.exerciseId!))
      return { changedDays: 1, skippedRows: 0, weeks: savedWeeks }
    })
    await act(async () => root.render(
      <PlanEditor initialWeeks={visualOrderWeeks()} weeksCount={2} studentName="学员" planName="计划" onSave={onSave} />,
    ))
    const target = host.querySelector<HTMLElement>('[data-rowid="w2-b"]')!
    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: () => [target],
    })
    const handle = host.querySelector<HTMLElement>('[data-rowid="w2-a"] .rowdrag')!
    act(() => {
      handle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))
      window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientY: 1 }))
      window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientY: 1 }))
    })
    const renderedOrder = (weekNumber: number) => (
      [...host.querySelectorAll<HTMLElement>(`.weekband[data-wnum="${weekNumber}"] [data-rowid]`)]
        .map((element) => element.querySelector<HTMLInputElement>('[data-plan-cell="name"] input')?.value)
    )
    expect(renderedOrder(1)).toEqual(['动作 B', '动作 A', '动作 C'])
    expect(renderedOrder(2)).toEqual(['动作 B', '动作 A', '动作 C'])
    const save = [...host.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === '保存草稿')!
    await act(async () => {
      save.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(savedRows).toEqual([
      ['b', 'a', 'c'],
      ['b', 'a', 'c'],
    ])
    expect(savedRows.map((rows) => Object.fromEntries(rows.map((exerciseId, sortOrder) => [exerciseId, sortOrder]))))
      .toEqual([
        { b: 0, a: 1, c: 2 },
        { b: 0, a: 1, c: 2 },
      ])
    Reflect.deleteProperty(document, 'elementsFromPoint')
  })

  it('patches the plan-level D1 anchor and derives the weekday labels', async () => {
    const onChange = vi.fn().mockResolvedValue(undefined)
    await act(async () => root.render(
      <PlanEditor initialWeeks={[week(1, [], true)]} weeksCount={1} studentName="学员" planName="计划"
        anchorWeekday={null} onChangeAnchorWeekday={onChange} />,
    ))
    const select = host.querySelector<HTMLSelectElement>('[aria-label="设置 D1 周几"]')!
    expect(select.value).toBe('')
    await act(async () => {
      select.value = '7'
      select.dispatchEvent(new Event('change', { bubbles: true }))
      await Promise.resolve()
    })
    expect(onChange).toHaveBeenCalledWith(7)
    const heads = [...host.querySelectorAll<HTMLElement>('.dayhead')]
    expect(heads[0].textContent).toContain('D1')
    expect(heads[0].textContent).toContain('周日')
    expect(heads[1].textContent).toContain('D2')
    expect(heads[1].textContent).toContain('周一')
  })
})
