import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExerciseResponse } from '../../api/types'
import { PlanEditor } from './PlanEditor'
import { ExerciseIndex } from './exerciseIndex'
import { relabelWeeksForStartDate } from './mapping'
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

function datedWeeks(startDate: string, count = 1, rows: ExerciseRow[] = []): Week[] {
  return relabelWeeksForStartDate(
    Array.from({ length: count }, (_, index) => week(index + 1, index === 0 ? rows : [], index === 0)),
    startDate,
  )
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
    expect(host.querySelectorAll('.week-tab-list .week-tab')).toHaveLength(12)
    expect(host.textContent).not.toContain('跳到周')
    expect(host.textContent).not.toContain('缩放')
    expect(host.querySelector('.weekband .weekrow')?.children[0]?.classList.contains('day')).toBe(true)
    expect(host.querySelector('.weekband .weekrow')?.children[1]?.classList.contains('day')).toBe(true)
  })

  it('uses mandatory week-slot snapping and snaps to the nearest week when panning ends', async () => {
    act(() => root.render(
      <PlanEditor initialWeeks={[week(1, [], true), week(2), week(3)]} weeksCount={3}
        studentName="学员" planName="计划" />,
    ))
    await act(async () => new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve())))

    const scroller = host.querySelector<HTMLElement>('.scroller')!
    const track = host.querySelector<HTMLElement>('.week-band-track')!
    const slots = [...host.querySelectorAll<HTMLElement>('[data-week-slot]')]
    slots.forEach((slot, index) => {
      Object.defineProperty(slot, 'offsetLeft', { configurable: true, value: index * 948 })
    })
    const scrollTo = vi.fn()
    scroller.scrollTo = scrollTo

    expect(scroller.style.scrollSnapType).toBe('x mandatory')
    expect(track.style.gap).toBe('28px')
    expect(slots[0].style.scrollSnapAlign).toBe('start')

    act(() => scroller.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true, button: 1, clientX: 100, clientY: 0,
    })))
    expect(scroller.classList.contains('panning')).toBe(true)
    expect(scroller.style.scrollSnapType).toBe('none')

    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: -450, clientY: 0 }))
      window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 1 }))
    })

    expect(scroller.classList.contains('panning')).toBe(false)
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 948, behavior: 'smooth' })
    expect(scroller.style.scrollSnapType).toBe('x mandatory')
  })

  it('keeps adjacent week-step buttons beside the toolbar indicator and disables week boundaries', async () => {
    act(() => root.render(
      <PlanEditor initialWeeks={[week(1), week(2, [], true), week(3)]} weeksCount={3}
        studentName="学员" planName="计划" />,
    ))
    await act(async () => new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve())))

    const scroller = host.querySelector<HTMLElement>('.scroller')!
    const slots = [...host.querySelectorAll<HTMLElement>('[data-week-slot]')]
    slots.forEach((slot, index) => {
      Object.defineProperty(slot, 'offsetLeft', { configurable: true, value: index * 948 })
    })
    const scrollTo = vi.fn()
    scroller.scrollTo = scrollTo
    const controls = host.querySelector<HTMLElement>('[data-week-jump-controls]')!
    const previous = host.querySelector<HTMLButtonElement>('[aria-label="上一周"]')!
    const next = host.querySelector<HTMLButtonElement>('[aria-label="下一周"]')!

    expect(controls.closest('.plan-toolbar')).not.toBeNull()
    expect(controls.querySelectorAll('button')).toHaveLength(2)
    expect(previous.nextElementSibling).toBe(next)
    expect(host.querySelector('.week-tabs [aria-label="上一周"]')).toBeNull()
    expect(host.querySelector('.week-tabs [aria-label="下一周"]')).toBeNull()
    expect(previous.disabled).toBe(false)
    expect(next.disabled).toBe(false)
    await act(async () => {
      previous.click()
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
    })
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 0, behavior: 'smooth' })
    expect(previous.disabled).toBe(true)

    await act(async () => {
      next.click()
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
    })
    await act(async () => {
      next.click()
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
    })
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 1896, behavior: 'smooth' })
    expect(next.disabled).toBe(true)
    expect(controls.querySelectorAll('button')).toHaveLength(2)
    expect(previous.nextElementSibling).toBe(next)
  })

  it('steps weeks with Alt+Arrow from an input while plain arrows keep cell navigation', async () => {
    act(() => root.render(
      <PlanEditor
        initialWeeks={[week(1), week(2, [row('sq', 'sq', '深蹲', true)], true), week(3)]}
        weeksCount={3}
        studentName="学员"
        planName="计划"
      />,
    ))
    await act(async () => new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve())))

    const scroller = host.querySelector<HTMLElement>('.scroller')!
    const slots = [...host.querySelectorAll<HTMLElement>('[data-week-slot]')]
    slots.forEach((slot, index) => {
      Object.defineProperty(slot, 'offsetLeft', { configurable: true, value: index * 948 })
    })
    const scrollTo = vi.fn()
    scroller.scrollTo = scrollTo
    const nameInput = host.querySelector<HTMLInputElement>(
      '.weekband[data-wnum="2"] [data-plan-cell="name"] input',
    )!

    await act(async () => {
      nameInput.focus()
      nameInput.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'ArrowRight', altKey: true, bubbles: true, cancelable: true,
      }))
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
    })
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 1896, behavior: 'smooth' })
    expect(host.querySelector<HTMLButtonElement>('[aria-label="下一周"]')?.disabled).toBe(true)

    await act(async () => {
      nameInput.focus()
      nameInput.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'ArrowLeft', altKey: true, bubbles: true, cancelable: true,
      }))
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
    })
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 948, behavior: 'smooth' })

    scrollTo.mockClear()
    await act(async () => {
      nameInput.blur()
      nameInput.focus()
    })
    await act(async () => {
      nameInput.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'ArrowRight', bubbles: true, cancelable: true,
      }))
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })
    expect(host.querySelector('.plan-cell-selected')?.getAttribute('data-plan-cell')).toBe('sets')
    expect(scrollTo).not.toHaveBeenCalled()

    const character = new KeyboardEvent('keydown', { key: 'x', bubbles: true, cancelable: true })
    act(() => nameInput.dispatchEvent(character))
    expect(character.defaultPrevented).toBe(false)
  })

  it('renders all seven positions and derives compact rest cards without D badges', () => {
    act(() => root.render(
      <PlanEditor initialWeeks={datedWeeks('2026-08-01', 1, [row('sq', 'sq', '深蹲', true)])} weeksCount={1}
        studentName="学员" planName="计划" planStartDate="2026-08-01" />,
    ))

    const days = host.querySelectorAll('.weekband[data-wnum="1"] .weekrow > .day')
    expect(days).toHaveLength(7)
    expect(host.querySelectorAll('.weekband[data-wnum="1"] [data-derived-rest="true"]')).toHaveLength(6)
    expect(days[0].querySelector('[data-rowid="sq"]')).not.toBeNull()
    expect(days[0].textContent).toContain('D1')
    expect(days[1].querySelector('.dayhead-primary')).toBeNull()
    expect(days[1].textContent).not.toContain('D2')
    expect(days[1].querySelector('[data-day-calendar-label]')?.textContent).toBe('周日8/2')
    expect(days[1].textContent).toContain('休息')
    const restLine = days[1].querySelector('.week-band-rest-line')!
    const restAdd = days[1].querySelector('.week-band-rest-add')!
    expect([...restLine.children]).toContain(restAdd)
    expect(days[1].children).toHaveLength(1)
    expect(restAdd.textContent).toContain('加动作')
  })

  it('numbers only training days continuously and syncs selected-day context', () => {
    const sparse = week(1, [], true)
    sparse.days[1] = { ...sparse.days[1], rest: false, rows: [row('sq', 'sq', '深蹲', true)] }
    sparse.days[4] = { ...sparse.days[4], rest: false, rows: [row('bench', 'bench', '卧推', true)] }
    const [dated] = relabelWeeksForStartDate([sparse], '2026-08-01')
    act(() => root.render(
      <PlanEditor initialWeeks={[dated]} weeksCount={1} studentName="学员" planName="计划" planStartDate="2026-08-01" />,
    ))

    const days = host.querySelectorAll<HTMLElement>('.weekband[data-wnum="1"] .weekrow > .day')
    expect(days[0].querySelector('.dayhead-primary')).toBeNull()
    expect(days[1].querySelector('.dayhead-primary')?.textContent).toBe('D1')
    expect(days[2].querySelector('.dayhead-primary')).toBeNull()
    expect(days[4].querySelector('.dayhead-primary')?.textContent).toBe('D2')
    expect(days[4].querySelector('[data-day-calendar-label]')?.textContent).toBe('周三8/5')

    act(() => days[4].dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(host.querySelector('.selected-context-bar b')?.textContent).toBe('D2 · 周三 8/5（第 1 周）')
  })

  it('always shows weekday labels derived from start_date, ignoring legacy labels', () => {
    const dated = datedWeeks('2026-08-10', 1, [row('sq', 'sq', '深蹲', true)])
    act(() => root.render(
      <PlanEditor initialWeeks={dated} weeksCount={1} studentName="学员" planName="计划" planStartDate="2026-08-10" />,
    ))

    const days = host.querySelectorAll<HTMLElement>('.weekband[data-wnum="1"] .weekrow > .day')
    expect(days[0].querySelector('[data-day-calendar-label]')?.textContent).toBe('周一8/10')
    expect(days[1].querySelector('[data-day-calendar-label]')?.textContent).toBe('周二8/11')
    expect(host.querySelectorAll('.weekband[data-wnum="1"] .dayhead-weekday')).toHaveLength(7)
    expect(host.querySelector('.anchor-weekday-select')).toBeNull()
    expect(host.querySelector('[aria-label="设置每周第一天周几"]')).toBeNull()
    expect(host.querySelector('[aria-label="修改每周第一天周几"]')).toBeNull()
  })

  it('keeps the start_date-derived weekday label on the first position even when it is a rest day', () => {
    const anchored = datedWeeks('2026-08-10')[0]
    anchored.days[3] = { ...anchored.days[3], rest: false, rows: [row('sq', 'sq', '深蹲', true)] }
    act(() => root.render(
      <PlanEditor initialWeeks={[anchored]} weeksCount={1}
        studentName="学员" planName="计划" planStartDate="2026-08-10" onChangeStartDate={vi.fn()} />,
    ))

    expect(host.querySelector('.day[data-dow="0"] [data-day-calendar-label]')?.textContent).toBe('周一8/10')
    expect(host.querySelector('.day[data-dow="3"] .dayhead-primary')?.textContent).toBe('D1')
  })

  it('puts low-key add actions after both section rows and removes day-header add/rest actions', () => {
    act(() => root.render(
      <PlanEditor initialWeeks={[week(1, [
        row('main', 'sq', '深蹲', true),
        row('aux', 'fly', '飞鸟', false),
      ], true)]} weeksCount={1} studentName="学员" planName="计划" />,
    ))

    const trainingDay = host.querySelector<HTMLElement>('.weekband[data-wnum="1"] .day[data-dow="0"]')!
    const additions = [...trainingDay.querySelectorAll<HTMLButtonElement>('.week-band-section-add')]
    expect(additions.map((button) => button.textContent?.trim())).toEqual(['＋ 主项/主项变式', '＋ 辅助项'])
    expect(additions[0].previousElementSibling?.getAttribute('data-rowid')).toBe('main')
    expect(additions[1].previousElementSibling?.getAttribute('data-rowid')).toBe('aux')
    expect(trainingDay.querySelector('.dayhead [data-add-tier]')).toBeNull()
    expect(trainingDay.textContent).not.toContain('设为休息')
  })

  it('returns to the derived rest card after clearing the final editable action', () => {
    act(() => root.render(
      <PlanEditor initialWeeks={[week(1, [row('only', 'sq', '深蹲', true)], true)]} weeksCount={1}
        studentName="学员" planName="计划" />,
    ))
    const trainingDay = host.querySelector<HTMLElement>('.weekband[data-wnum="1"] .day[data-dow="0"]')!
    act(() => trainingDay.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    const clear = [...host.querySelectorAll<HTMLElement>('.selected-context-bar .ctxbtn')]
      .find((button) => button.textContent === '清空本日')!
    act(() => clear.dispatchEvent(new MouseEvent('click', { bubbles: true })))

    const cleared = host.querySelector<HTMLElement>('.weekband[data-wnum="1"] .day[data-dow="0"]')!
    expect(cleared.dataset.derivedRest).toBe('true')
    expect(cleared.textContent).toContain('休息')
    expect(cleared.querySelector('.daygrid')).toBeNull()
  })

  it('renders stored rest-marked days with actions as ordinary editable training days', () => {
    const legacy = week(1, [row('legacy', 'sq', '存量深蹲', true)], true)
    legacy.days[0] = { ...legacy.days[0], rest: true }
    act(() => root.render(
      <PlanEditor initialWeeks={[legacy]} weeksCount={1} studentName="学员" planName="计划" />,
    ))

    const day = host.querySelector<HTMLElement>('.weekband[data-wnum="1"] .day[data-dow="0"]')!
    expect(day.dataset.derivedRest).toBeUndefined()
    expect(day.classList.contains('restday')).toBe(false)
    expect(day.querySelector('[data-rowid="legacy"]')).not.toBeNull()
    expect(day.querySelector('.daygrid')).not.toBeNull()
  })

  it('renders only each week\'s stored rows while keeping derived badges on real action names', () => {
    const squat = row('sq-w1', 'sq', '竞技深蹲', true)
    const fly = row('fly-w2', 'fly', '哑铃飞鸟', false)
    const index = new ExerciseIndex([
      exercise('sq', { name: '竞技深蹲', exercise_type: 'main_lift', main_lift_family: 'squat', muscle_groups: ['quad'] }),
      exercise('fly', { name: '哑铃飞鸟', exercise_type: 'accessory', muscle_groups: ['chest'] }),
    ])
    act(() => root.render(
      <PlanEditor initialWeeks={[week(1, [squat], true), week(2, [fly])]} weeksCount={2}
        studentName="学员" planName="计划" exerciseIndex={index} />,
    ))

    const firstHeaderCells = [...host.querySelectorAll<HTMLElement>('.weekband[data-wnum="1"] .gridhead > [data-c]')]
    expect(firstHeaderCells.slice(0, 2).map((cell) => cell.dataset.c)).toEqual(['index', 'name'])
    expect(firstHeaderCells[0].style.width).toBe('28px')
    expect(firstHeaderCells[1].style.width).toBe('156px')
    expect(firstHeaderCells.slice(0, 2).every((cell) => cell.classList.contains('week-band-frozen'))).toBe(true)
    expect(host.querySelector('[data-c="target"]')).toBeNull()
    expect(host.querySelector('[data-rowid="sq-w1"] [data-c="name"] .week-band-badge.squat')?.textContent).toBe('蹲')
    expect(host.querySelector('[data-rowid="fly-w2"] [data-c="name"] .week-band-badge.muscle')?.textContent).toBe('胸')
    expect([...host.querySelectorAll<HTMLElement>('.weekband[data-wnum="1"] [data-rowid]')]
      .map((element) => element.dataset.rowid)).toEqual(['sq-w1'])
    expect([...host.querySelectorAll<HTMLElement>('.weekband[data-wnum="2"] [data-rowid]')]
      .map((element) => element.dataset.rowid)).toEqual(['fly-w2'])
    expect(host.querySelector('[data-empty-exercise-id]')).toBeNull()
    expect(host.textContent).not.toContain('本周未安排')
    expect(host.textContent).not.toContain('添加到本周')
  })

  it('shows the student summary context on a selected empty rest day', () => {
    act(() => root.render(
      <PlanEditor initialWeeks={[week(1, [row('sq', 'sq', '深蹲', true)], true)]} weeksCount={1}
        studentName="走查学员" studentId="stu-1" planName="计划" />,
    ))
    const restDay = host.querySelector<HTMLElement>('.weekband[data-wnum="1"] .day[data-dow="1"]')!
    act(() => restDay.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    const context = host.querySelector<HTMLElement>('.weekband[data-wnum="1"] .day[data-dow="1"] [data-dayhead-context]')
    expect(context).not.toBeNull()
    expect(context!.dataset.contextState).toBe('student')
    expect(context!.textContent).toContain('走查学员')

    const details = context!.querySelector<HTMLDetailsElement>('details.dayhead-profile')!
    act(() => { details.open = true })
    expect(context!.querySelector('.dayhead-profile-popover')).not.toBeNull()
    expect(context!.textContent).toContain('画像载入中')
  })

  it('chooses the lower-index week on a wide-viewport centre tie and moves the virtual window', () => {
    act(() => root.render(
      <PlanEditor initialWeeks={[week(1), week(2, [], true), week(3)]} weeksCount={3}
        studentName="学员" planName="计划" />,
    ))
    const scroller = host.querySelector<HTMLElement>('.scroller')!
    Object.defineProperty(scroller, 'clientWidth', { configurable: true, value: 1868 })
    scroller.getBoundingClientRect = () => ({ left: 0, width: 1868 } as DOMRect)
    const slots = [...host.querySelectorAll<HTMLElement>('[data-week-slot]')]
    slots.forEach((slot, index) => {
      slot.getBoundingClientRect = () => ({ left: index * 948, width: 920 } as DOMRect)
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
    expect(host.querySelectorAll('.week-tab-list .week-tab')).toHaveLength(4)
    expect(host.querySelector('.week-tabs button.active')?.textContent).toBe('W04')
    expect(host.querySelector('.weekband[data-wnum="4"]')?.textContent).toContain('第 4 周')
  })

  it('uses the current week row order for adjacent Shift selection', () => {
    act(() => root.render(
      <PlanEditor initialWeeks={visualOrderWeeks()} weeksCount={2} studentName="学员" planName="计划" />,
    ))

    act(() => pointerClick(host.querySelector('[data-rowid="w2-a"]')!))
    act(() => pointerClick(host.querySelector('[data-rowid="w2-b"]')!, { shiftKey: true }))
    expect([...host.querySelectorAll<HTMLElement>('.weekband[data-wnum="2"] .exrow.row-sel')]
      .map((element) => element.dataset.rowid)).toEqual(['w2-a', 'w2-c', 'w2-b'])
  })

  it('uses the current week row order for vertical keyboard navigation', async () => {
    await act(async () => root.render(
      <PlanEditor initialWeeks={visualOrderWeeks()} weeksCount={2} studentName="学员" planName="计划" />,
    ))
    const sets = host.querySelector<HTMLInputElement>('[data-rowid="w2-a"] [data-plan-cell="sets"] input')!
    await act(async () => sets.focus())
    await act(async () => {
      sets.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })

    expect(host.querySelector('.plan-cell-selected')?.closest('[data-rowid]')?.getAttribute('data-rowid')).toBe('w2-c')
    expect(host.querySelector('.plan-cell-selected')?.getAttribute('data-plan-cell')).toBe('sets')
  })

  it('reorders and persists only the dragged week', async () => {
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
    expect(renderedOrder(1)).toEqual(['动作 A', '动作 B', '动作 C'])
    expect(renderedOrder(2)).toEqual(['动作 C', '动作 B', '动作 A'])
    const save = [...host.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === '保存草稿')!
    await act(async () => {
      save.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(savedRows).toEqual([
      ['a', 'b', 'c'],
      ['c', 'b', 'a'],
    ])
    expect(savedRows.map((rows) => Object.fromEntries(rows.map((exerciseId, sortOrder) => [exerciseId, sortOrder]))))
      .toEqual([
        { a: 0, b: 1, c: 2 },
        { c: 0, b: 1, a: 2 },
      ])
    Reflect.deleteProperty(document, 'elementsFromPoint')
  })

})
