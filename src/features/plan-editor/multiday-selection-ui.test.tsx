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
    aux: false,
    reps: '5',
    mode: 'kg',
    boxes: [{ val: '100', empty: false }],
    note: '',
    ...partial,
  }
}

function week(num: number, rowsByDow: Partial<Record<number, ExerciseRow[]>> = {}): Week {
  const labels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
  const days: DayCol[] = Array.from({ length: 7 }, (_, dow) => {
    const rows = rowsByDow[dow] ?? []
    return {
      dow,
      dowLabel: labels[dow],
      dateLabel: `8/${num * 7 + dow - 4}`,
      rest: rows.length === 0,
      rows,
    }
  })
  return {
    num,
    num2: String(num).padStart(2, '0'),
    range: '',
    isCurrent: num === 1,
    vol: '',
    days,
  }
}

function click(element: Element, modifiers: MouseEventInit = {}): void {
  element.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0, ...modifiers }))
}

function pointerClick(element: Element, modifiers: MouseEventInit = {}): void {
  element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, ...modifiers }))
  element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, ...modifiers }))
  click(element, modifiers)
}

function day(host: HTMLElement, wnum: number, dow: number): HTMLElement {
  return host.querySelector<HTMLElement>(`.weekband[data-wnum="${wnum}"] .day[data-dow="${dow}"]`)!
}

function selectedDayKeys(host: HTMLElement): string[] {
  return [...host.querySelectorAll<HTMLElement>('.weekband')].flatMap((weekElement) => (
    [...weekElement.querySelectorAll<HTMLElement>('.day.sel')]
      .map((dayElement) => `${weekElement.dataset.wnum}:${dayElement.dataset.dow}`)
  ))
}

function contextAction(host: HTMLElement, exactText: string): HTMLElement {
  const action = [...host.querySelectorAll<HTMLElement>('.ctxbtn')]
    .find((element) => element.textContent === exactText)
  if (!action) throw new Error(`context action not found: ${exactText}`)
  return action
}

function jumpToWeek(host: HTMLElement, weekNumber: number): void {
  const target = [...host.querySelectorAll('.week-tab')].find((button) => button.textContent === `W${String(weekNumber).padStart(2, '0')}`)!
  act(() => click(target))
}

async function changeWeekCount(host: HTMLElement, direction: 'increase' | 'decrease'): Promise<void> {
  const cycleButton = [...host.querySelectorAll<HTMLButtonElement>('button')]
    .find((button) => button.textContent?.includes('周 · 周期化'))!
  act(() => click(cycleButton))
  act(() => click(host.querySelector<HTMLButtonElement>(
    direction === 'increase' ? '[aria-label="增加一周"]' : '[aria-label="减少一周"]',
  )!))
  const apply = [...host.querySelectorAll<HTMLButtonElement>('button')]
    .find((button) => button.textContent === '应用')!
  await act(async () => {
    click(apply)
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('plan editor multi-day selection UI', () => {
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

  it('adds and removes days with Command-click while keeping a valid anchor', () => {
    act(() => root.render(
      <PlanEditor initialWeeks={[week(1)]} weeksCount={1} studentName="学员" planName="计划" />,
    ))

    act(() => click(day(host, 1, 0)))
    act(() => click(day(host, 1, 2), { metaKey: true }))
    expect(selectedDayKeys(host)).toEqual(['1:0', '1:2'])
    expect(host.querySelector('[data-selected-context]')?.textContent).toContain('已选 2 天')

    act(() => click(day(host, 1, 0), { metaKey: true }))
    expect(selectedDayKeys(host)).toEqual(['1:2'])
    expect(host.querySelector('[data-selected-context]')?.textContent).toContain('周三')
  })

  it('selects an inclusive Shift range across week boundaries', () => {
    act(() => root.render(
      <PlanEditor initialWeeks={[week(1), week(2)]} weeksCount={2} studentName="学员" planName="计划" />,
    ))

    act(() => click(day(host, 1, 5)))
    act(() => click(day(host, 2, 1), { shiftKey: true }))

    expect(selectedDayKeys(host)).toEqual(['1:5', '1:6', '2:0', '2:1'])
    expect(host.querySelector('[data-selected-context]')?.textContent).toContain('已选 4 天')

    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(selectedDayKeys(host)).toEqual(['1:5'])
  })

  it('keeps a cross-week range selected when the visible week changes', () => {
    act(() => root.render(
      <PlanEditor initialWeeks={[week(1), week(2)]} weeksCount={2} studentName="学员" planName="计划" />,
    ))
    act(() => click(day(host, 1, 5)))
    act(() => click(day(host, 2, 1), { shiftKey: true }))

    jumpToWeek(host, 2)
    expect(host.querySelector<HTMLElement>('[data-selected-context]')?.hidden).toBe(false)

    expect(selectedDayKeys(host)).toEqual(['1:5', '1:6', '2:0', '2:1'])
  })

  it('retains the W1 Shift anchor after W2 becomes visible', () => {
    act(() => root.render(
      <PlanEditor initialWeeks={[week(1), week(2)]} weeksCount={2} studentName="学员" planName="计划" />,
    ))
    act(() => click(day(host, 1, 5)))
    jumpToWeek(host, 2)
    expect(selectedDayKeys(host)).toEqual([])

    act(() => click(day(host, 2, 1), { shiftKey: true }))

    expect(selectedDayKeys(host)).toEqual(['1:5', '1:6', '2:0', '2:1'])
  })

  it.each([
    ['原文 LF', (text: string) => text],
    ['CRLF 回读', (text: string) => text.replace(/\n/g, '\r\n')],
  ])('pastes copied days as one translated shape on %s', async (_case, clipboardRead) => {
    const weeks = [
      week(1, { 0: [row('source-a', '动作 A')], 2: [row('source-c', '动作 C')] }),
      week(2),
    ]
    await act(async () => {
      root.render(<PlanEditor initialWeeks={weeks} weeksCount={2} studentName="学员" planName="计划" />)
    })

    act(() => click(day(host, 1, 2)))
    act(() => click(day(host, 1, 0), { metaKey: true }))
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', metaKey: true, bubbles: true }))
      await Promise.resolve()
    })
    expect(String(writeText.mock.calls[0]?.[0])).toContain('# W01 周一')
    expect(String(writeText.mock.calls[0]?.[0])).toContain('# W01 周三')
    readText.mockResolvedValue(clipboardRead(String(writeText.mock.calls[0]?.[0])))

    act(() => click(day(host, 2, 1)))
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', metaKey: true, bubbles: true }))
      await Promise.resolve()
    })

    expect(day(host, 2, 1).querySelector<HTMLInputElement>('[data-plan-cell="name"] input')?.value).toBe('动作 A')
    expect(day(host, 2, 3).querySelector<HTMLInputElement>('[data-plan-cell="name"] input')?.value).toBe('动作 C')
    expect(day(host, 2, 1).querySelectorAll('[data-rowid]')).toHaveLength(1)
    expect(host.querySelector('.plan-autosave-status')?.textContent).toContain('已粘贴 2 天')
  })

  it('skips translated days beyond the plan range and reports the count', async () => {
    const weeks = [
      week(1, { 4: [row('source-fri', '周五内容')], 6: [row('source-sun', '周日内容')] }),
      week(2),
    ]
    await act(async () => {
      root.render(<PlanEditor initialWeeks={weeks} weeksCount={2} studentName="学员" planName="计划" />)
    })
    act(() => click(day(host, 1, 4)))
    act(() => click(day(host, 1, 6), { ctrlKey: true }))
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true }))
      await Promise.resolve()
    })

    act(() => click(day(host, 2, 5)))
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, bubbles: true }))
      await Promise.resolve()
    })

    expect(day(host, 2, 5).querySelector<HTMLInputElement>('[data-plan-cell="name"] input')?.value).toBe('周五内容')
    expect(host.querySelector('.plan-autosave-status')?.textContent)
      .toContain('已粘贴 1 天,1 天超出计划范围已跳过')
  })

  it('keeps the internal day clipboard usable after shrinking and expanding the plan', async () => {
    const onChangePlanWeeks = vi.fn().mockResolvedValue(undefined)
    const weeks = [
      week(1, { 0: [row('source-mon', '周一内容')], 2: [row('source-wed', '周三内容')] }),
      week(2),
    ]
    await act(async () => {
      root.render(
        <PlanEditor
          initialWeeks={weeks}
          weeksCount={2}
          planStartDate="2026-08-03"
          studentName="学员"
          planName="计划"
          onChangePlanWeeks={onChangePlanWeeks}
        />,
      )
    })
    act(() => click(day(host, 1, 0)))
    act(() => click(day(host, 1, 2), { metaKey: true }))
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', metaKey: true, bubbles: true }))
      await Promise.resolve()
    })

    await changeWeekCount(host, 'decrease')
    expect(host.querySelectorAll('.weekband')).toHaveLength(1)
    await changeWeekCount(host, 'increase')
    expect(host.querySelectorAll('.weekband')).toHaveLength(2)

    act(() => click(day(host, 2, 1)))
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', metaKey: true, bubbles: true }))
      await Promise.resolve()
    })

    expect(day(host, 2, 1).querySelector<HTMLInputElement>('[data-plan-cell="name"] input')?.value).toBe('周一内容')
    expect(day(host, 2, 3).querySelector<HTMLInputElement>('[data-plan-cell="name"] input')?.value).toBe('周三内容')
  })

  it('confirms occupied translated targets once and keeps days paste ahead of a selected row', async () => {
    const weeks = [
      week(1, { 0: [row('source-a', '新动作 A')], 2: [row('source-c', '新动作 C')] }),
      week(2, { 1: [row('target-b', '旧动作 B')], 3: [row('target-d', '旧动作 D')] }),
    ]
    await act(async () => {
      root.render(<PlanEditor initialWeeks={weeks} weeksCount={2} studentName="学员" planName="计划" />)
    })
    act(() => click(day(host, 1, 0)))
    act(() => click(day(host, 1, 2), { metaKey: true }))
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', metaKey: true, bubbles: true }))
      await Promise.resolve()
    })

    act(() => pointerClick(host.querySelector('[data-rowid="target-b"]')!))
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', metaKey: true, bubbles: true }))
      await Promise.resolve()
    })

    expect(confirm).toHaveBeenCalledTimes(1)
    expect(confirm.mock.calls[0]?.[0]).toContain('2 个落点日已有训练内容')
    expect(day(host, 2, 1).querySelector<HTMLInputElement>('[data-plan-cell="name"] input')?.value).toBe('新动作 A')
    expect(day(host, 2, 3).querySelector<HTMLInputElement>('[data-plan-cell="name"] input')?.value).toBe('新动作 C')
  })

  it('batch-clears editable rows in mixed logged days and keeps the logged rows', () => {
    const locked = row('locked', '已打卡动作', { hasLogs: true, serverRowId: 'server-locked' })
    const editableMixedA = row('editable-mixed-a', '混合日动作 A', { serverSortOrder: 2 })
    const editableMixedB = row('editable-mixed-b', '混合日动作 B', { serverSortOrder: 3 })
    act(() => root.render(
      <PlanEditor
        initialWeeks={[week(1, {
          0: [row('editable-a', '动作 A')],
          1: [locked, editableMixedA, editableMixedB],
          2: [row('editable-c', '动作 C')],
        })]}
        weeksCount={1}
        studentName="学员"
        planName="计划"
      />,
    ))
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    act(() => click(day(host, 1, 0)))
    act(() => click(day(host, 1, 1), { metaKey: true }))
    act(() => click(day(host, 1, 2), { metaKey: true }))

    act(() => click(contextAction(host, '清空 3 天')))
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(day(host, 1, 0).querySelectorAll('[data-rowid]')).toHaveLength(0)
    expect([...day(host, 1, 1).querySelectorAll<HTMLElement>('[data-rowid]')]
      .map((element) => element.dataset.rowid)).toEqual(['locked'])
    expect(day(host, 1, 2).querySelectorAll('[data-rowid]')).toHaveLength(0)
    expect(host.querySelector('.plan-autosave-status')?.textContent)
      .toContain('已清空 3 天，1 天保留了已打卡动作')

    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true })))
    expect(day(host, 1, 0).querySelectorAll('[data-rowid]')).toHaveLength(1)
    expect(day(host, 1, 1).querySelectorAll('[data-rowid]')).toHaveLength(3)
  })

  it('keeps legacy rest flags from hiding logged training content', () => {
    const data = week(1, { 0: [row('logged-rest', '已打卡动作', { hasLogs: true })] })
    data.days[0] = { ...data.days[0], rest: true }
    act(() => root.render(
      <PlanEditor initialWeeks={[data]} weeksCount={1} studentName="学员" planName="计划" />,
    ))
    act(() => click(day(host, 1, 0)))
    act(() => click(day(host, 1, 2), { metaKey: true }))
    expect(day(host, 1, 0).querySelector('[data-rowid="logged-rest"]')).not.toBeNull()
    expect(host.querySelector('[data-selected-context]')?.textContent).not.toContain('改为训练日')
    expect(host.querySelector('[data-selected-context]')?.textContent).not.toContain('设为休息')
  })

  it('makes row and day multi-selection mutually exclusive', () => {
    act(() => root.render(
      <PlanEditor
        initialWeeks={[week(1, {
          0: [row('row-a', '动作 A'), row('row-b', '动作 B')],
          1: [row('row-c', '动作 C')],
        })]}
        weeksCount={1}
        studentName="学员"
        planName="计划"
      />,
    ))
    act(() => pointerClick(host.querySelector('[data-rowid="row-a"]')!))
    act(() => pointerClick(host.querySelector('[data-rowid="row-b"]')!, { metaKey: true }))
    expect(host.querySelectorAll('.exrow.row-sel')).toHaveLength(2)

    act(() => click(day(host, 1, 1), { metaKey: true }))
    expect(selectedDayKeys(host)).toEqual(['1:0', '1:1'])
    expect(host.querySelectorAll('.exrow.row-sel')).toHaveLength(0)

    act(() => pointerClick(host.querySelector('[data-rowid="row-c"]')!))
    expect(selectedDayKeys(host)).toEqual(['1:1'])
    expect(host.querySelectorAll('.exrow.row-sel')).toHaveLength(1)
  })

  it('returns to one selected day when pasting a row into a multi-day selection', async () => {
    act(() => root.render(
      <PlanEditor initialWeeks={[week(1, { 0: [row('source', '来源动作')] })]}
        weeksCount={1} studentName="学员" planName="计划" />,
    ))
    act(() => pointerClick(host.querySelector('[data-rowid="source"]')!))
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', metaKey: true, bubbles: true }))
      await Promise.resolve()
    })
    act(() => click(day(host, 1, 1)))
    act(() => click(day(host, 1, 2), { metaKey: true }))
    expect(selectedDayKeys(host)).toEqual(['1:1', '1:2'])
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', metaKey: true, bubbles: true }))
      await Promise.resolve()
    })
    expect(day(host, 1, 1).querySelectorAll('[data-rowid]')).toHaveLength(1)
    expect(selectedDayKeys(host)).toEqual(['1:1'])
    expect(host.querySelectorAll('.exrow.row-sel')).toHaveLength(1)
  })

  it('keeps ordinary single-day labels, controls, and no-confirm clear behavior unchanged', () => {
    act(() => root.render(
      <PlanEditor
        initialWeeks={[week(1, { 0: [row('single', '单日动作')] })]}
        weeksCount={1}
        studentName="学员"
        planName="计划"
      />,
    ))
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    act(() => click(day(host, 1, 0)))

    expect(host.querySelector('[data-selected-context] b')?.textContent).toBe('D1 · 周一 8/3（第 1 周）')
    act(() => click(contextAction(host, '清空本日')))
    expect(confirm).not.toHaveBeenCalled()
    expect(day(host, 1, 0).querySelectorAll('[data-rowid]')).toHaveLength(0)
  })
})
