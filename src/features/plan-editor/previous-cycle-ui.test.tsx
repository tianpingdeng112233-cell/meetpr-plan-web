import { act, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PlanEditor } from './PlanEditor'
import { blockWeeks, blockRow, blockKey } from './blockGridTestUtils'
import { relabelWeeksForStartDate } from './mapping'
import { installLocalStorageMock } from '../../test/localStorageMock'
import { setLocale } from '../../i18n/strings'
import type { PlanResponse } from '../../api/types'

vi.mock('../../api/coach', () => ({ getStudentSetLogs: vi.fn().mockResolvedValue([]), getExerciseStats: vi.fn().mockResolvedValue({ recent_sessions: [] }), getStudentFeedback: vi.fn().mockResolvedValue([]) }))
let host: HTMLDivElement, root: Root
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 10, 16, 12))
  installLocalStorageMock(); sessionStorage.clear()
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.useRealTimers(); setLocale(undefined) })
const previous = () => ({
  plan: { id: 'old', name: '力量基础', start_date: '2026-10-19', plan_weeks: 5, status: 'published' } as PlanResponse,
  weeks: blockWeeks(Array.from({ length: 5 }, () => [0, 2, 4])), onRetry: vi.fn(),
})
const render = (props: Partial<ComponentProps<typeof PlanEditor>> = {}, key = 'one') => act(() => root.render(
  <PlanEditor key={key} initialWeeks={relabelWeeksForStartDate(blockWeeks(Array.from({ length: 12 }, () => [0, 2, 4])), '2026-11-23')}
    weeksCount={12} studentName="李小龙" coachId="coach" planName="备赛期" planStartDate="2026-11-23" previousCycle={previous()} {...props} />,
))
const zone = () => host.querySelector<HTMLElement>('[data-previous-cycle]')!
const click = (el: Element) => act(() => { el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); (el as HTMLElement).click() })
const button = (label: string) => [...host.querySelectorAll('button')].find(button => button.textContent === label)!
const numbers = () => [...zone().querySelectorAll('[data-week-slot]')].map(el => el.getAttribute('data-wnum'))

it('030 shows Li Xiaolong previous W4–W5 above current W1 with independent dates and current-week marker', () => {
  render()
  expect(zone()).not.toBeNull()
  expect(numbers()).toEqual(['4', '5'])
  expect(zone().textContent).toContain('10/19 起 · 5 周 · 已发布')
  expect(zone().textContent).not.toContain('只读 · 可以查看和复制')
  expect(zone().textContent).toContain('显示 W4–W5（最后 2 周）')
  expect(zone().querySelector('[data-wnum="5"] mark')?.textContent).toBe('当前周')
  expect(host.querySelector('[data-current-cycle]')?.textContent).toContain('当前周期备赛期')
  expect(host.querySelector('[data-current-cycle] mark')).toBeNull()
  expect(host.querySelector('[data-plan-menu-trigger] small')?.textContent).toBe('周期')
})

it('030 expands one week at a time, remembers collapse per coach, and resets visible count on reopen', () => {
  render()
  for (const expected of [['3','4','5'], ['2','3','4','5'], ['1','2','3','4','5']]) {
    click(button('↑ 再往前 1 周'))
    expect(numbers()).toEqual(expected)
  }
  expect(zone().textContent).toContain('显示 整份 W1–W5')
  expect(button('↑ 再往前 1 周')).toBeUndefined()
  expect(button('展开整份')).toBeUndefined()
  click(button('折叠'))
  expect(numbers()).toEqual([])
  expect(zone().textContent).toContain('· 已折叠')
  render({}, 'refresh')
  expect(numbers()).toEqual([])
  click(button('展开'))
  expect(numbers()).toEqual(['4','5'])
  click(button('展开整份'))
  expect(numbers()).toHaveLength(5)
  render({}, 'another-open')
  expect(numbers()).toEqual(['4','5'])
  click(button('折叠'))
  render({ coachId: 'other-coach' }, 'other-coach')
  expect(numbers()).toEqual(['4','5'])
})

it('030 aligns both blocks by weekday in by-day layout, points earlier left, and keeps each week number', () => {
  const old = previous()
  old.weeks = blockWeeks(Array.from({ length: 5 }, () => [0, 3]))
  render({ previousCycle: old })
  click(host.querySelector('[aria-label="按天排"]')!)
  expect(host.querySelector('.cycle-comparison')?.getAttribute('data-cycle-layout')).toBe('by-day')
  expect(zone().querySelector('.block-grid')?.getAttribute('data-layout')).toBe('by-day')
  expect(zone().querySelector<HTMLElement>('[data-block-week="4"][data-dow="3"]')?.style.gridRow).toBe('5')
  expect(host.querySelector<HTMLElement>('[data-current-cycle] [data-block-week="1"][data-dow="4"]')?.style.gridRow).toBe('6')
  expect(button('← 再往前 1 周')).toBeDefined()
  click(button('← 再往前 1 周'))
  expect(numbers()).toEqual(['3', '4', '5'])
  expect(zone().querySelector('[data-wnum="5"] mark')?.textContent).toBe('本周')
})

it.each(['row', 'day'] as const)('030 copies previous %s into current through existing clipboard and saves only current weeks', async kind => {
  const old = previous()
  old.weeks[4].days[0].rows = [blockRow('source', { name: '上一周期动作', serverRowId: 'server-old', hasLogs: true,
    note: '保持节奏', opaqueSets: [{ set_number: 1, target_reps: 3, target_reps_max: null, intensity_mode: 'weight', target_value: '120', set_type: 'working', rest_seconds: 180, coach_note: '组备注' }] })]
  const onSave = vi.fn(async (weeks: import('./types').Week[]) => ({ weeks, changedDays: 1, degradedRows: 0, skippedRows: 0 }))
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  render({ previousCycle: old, onSave })
  click(zone().querySelector(kind === 'row' ? '[data-rowid="source"]' : '[data-block-week="5"][data-dow="0"]')!)
  await blockKey('c', { metaKey: true })
  click(host.querySelector('[data-current-cycle] [data-block-week="1"][data-dow="0"]')!)
  await blockKey('v', { metaKey: true })
  await blockKey('Escape')
  expect(host.querySelector('[data-current-cycle]')?.textContent).toContain('上一周期动作')
  const leave = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(leave)
  expect(leave.defaultPrevented).toBe(true)
  await blockKey('s', { metaKey: true })
  expect(onSave).toHaveBeenCalledOnce()
  const saved = onSave.mock.calls[0][0]
  expect(saved).toHaveLength(12)
  expect(saved[0].days[0].rows.find(row => row.name === '上一周期动作')).toMatchObject({ serverRowId: null, hasLogs: false, note: '保持节奏', opaqueSets: [{ rest_seconds: 180, coach_note: '组备注' }] })
  expect(old.weeks[4].days[0].rows[0].serverRowId).toBe('server-old')
})

it('030 keeps previous read-only for keyboard and context menus and excludes it from issue counts', async () => {
  const old = previous()
  old.plan.status = 'completed'
  old.weeks[4].days[0].rows = [blockRow('unbound-previous', { exerciseId: null, ku: false })]
  const onSave = vi.fn()
  render({ previousCycle: old, onSave })
  expect(host.querySelector('[data-plan-context-bar]')?.textContent).not.toContain('待核对')
  click(host.querySelector('[data-current-cycle] [data-rowid]')!)
  await blockKey('c', { metaKey: true })
  click(zone().querySelector('[data-rowid="unbound-previous"]')!)
  for (const key of ['v', 'x', 'z', 'd']) await blockKey(key, { metaKey: true })
  await blockKey('Delete')
  act(() => zone().querySelector('[data-block-week="5"][data-dow="0"]')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })))
  expect(zone().querySelector('input, select, .block-insert-gap')).toBeNull()
  expect(host.querySelector('[role="menu"]')).toBeNull()
  expect(zone().textContent).toContain('unbound-previous')
  expect(onSave).not.toHaveBeenCalled()
})

it('030 rejects cross-block brick dragging and fill while allowing fill within current weeks', async () => {
  const old = previous(), current = blockWeeks([[0], [0]], 2)
  // Deliberately reuse local row IDs and week numbers across blocks.
  const onSave = vi.fn(async (weeks: import('./types').Week[]) => ({ weeks, changedDays: 1, degradedRows: 0, skippedRows: 0 }))
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  render({ previousCycle: old, initialWeeks: current, weeksCount: 2, onSave })
  click(button('展开整份'))
  const oldBrick = zone().querySelector<HTMLElement>('[data-rowid="w1-0-1"]') ?? zone().querySelector<HTMLElement>('[data-rowid="w1-0-0"]')!
  const source = host.querySelector<HTMLElement>('[data-current-cycle] [data-rowid="w1-0-1"]')!
  Object.defineProperty(document, 'elementsFromPoint', { configurable: true, value: () => [oldBrick] })
  act(() => source.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientY: 0 })))
  act(() => window.dispatchEvent(new MouseEvent('mousemove', { buttons: 1, clientY: 30 })))
  expect(document.body.style.cursor).toBe('not-allowed')
  act(() => window.dispatchEvent(new MouseEvent('mouseup', { clientY: 30 })))
  await act(async () => vi.advanceTimersByTime(0))
  const target = host.querySelector<HTMLElement>('[data-current-cycle] [data-block-week="1"][data-dow="0"]')!
  click(target)
  await blockKey('Escape')
  let hit: Element = zone().querySelector('[data-block-week="5"][data-dow="0"]')!
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => hit })
  const fill = () => {
    act(() => host.querySelector('[data-current-cycle] .block-fill-handle')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })))
    act(() => window.dispatchEvent(new MouseEvent('mousemove', { buttons: 1, clientY: 30 })))
    act(() => window.dispatchEvent(new MouseEvent('mouseup', { clientY: 30 })))
  }
  fill()
  await blockKey('s', { metaKey: true })
  expect(onSave.mock.calls[0][0][0].days[0].rows.map(row => row.name)).toEqual(['w1-0-0','w1-0-1'])
  expect(onSave.mock.calls[0][0][1].days[0].rows[0].name).toBe('w2-0-0')
  expect(zone().querySelector('.block-fill-handle')).toBeNull()
  hit = host.querySelector('[data-current-cycle] [data-block-week="2"][data-dow="0"]')!
  fill()
  await blockKey('s', { metaKey: true })
  expect(onSave.mock.lastCall![0][1].days[0].rows[0].name).toBe('w1-0-0')
  Reflect.deleteProperty(document, 'elementFromPoint'); Reflect.deleteProperty(document, 'elementsFromPoint')
})

it('030 shares the actuals toggle and one logs request across blocks, copying prescription rather than actual weight', async () => {
  const { getStudentSetLogs } = await import('../../api/coach')
  vi.mocked(getStudentSetLogs).mockResolvedValue([{
    id: 'log', student_id: 'student', plan_exercise_id: 'old-exercise', exercise_id: 'source', set_index: 0,
    weight_kg: '132.5', reps: 4, rpe: '9', coach_rpe: null, completed: true, failed: false, assumed: false, adhoc: false,
    logged_date: '2026-11-16', logged_at: '2026-11-16T10:00:00Z',
  } as import('../../api/types').StudentSetLog])
  const old = previous()
  old.weeks[4].days[0].rows = [blockRow('source', { serverRowId: 'old-exercise', hasLogs: true })]
  await act(async () => { render({ previousCycle: old, studentId: 'student' }); await Promise.resolve() })
  await act(async () => { click(host.querySelector('.show-actuals')!); await Promise.resolve() })
  expect(zone().querySelector('[data-rowid="source"] code')?.textContent).toContain('132.5')
  expect(getStudentSetLogs).toHaveBeenCalledOnce()
  expect(getStudentSetLogs).toHaveBeenCalledWith('student', '2026-10-19', '2026-11-17')
  click(zone().querySelector('[data-rowid="source"]')!)
  await blockKey('c', { metaKey: true })
  click(host.querySelector('[data-current-cycle] [data-block-week="1"][data-dow="0"]')!)
  await blockKey('v', { metaKey: true }); await blockKey('Escape')
  const copied = [...host.querySelectorAll('[data-current-cycle] .block-brick')].find(el => el.textContent?.startsWith('source'))!
  expect(copied.textContent).toContain('120')
  expect(copied.textContent).not.toContain('132.5')
})

it('030 shows previous actuals completed before its start date without an extra logs round trip', async () => {
  const { getStudentSetLogs } = await import('../../api/coach')
  vi.mocked(getStudentSetLogs).mockReset()
  vi.mocked(getStudentSetLogs).mockImplementation(async (_student, from) => from <= '2026-10-17' ? [{
    id: 'early', student_id: 'student', plan_day_id: 'early-day', plan_exercise_id: 'early-exercise', exercise_id: 'early', set_index: 0,
    weight_kg: '112.5', reps: 3, rpe: null, coach_rpe: null, completed: true, failed: false, assumed: false, adhoc: false,
    logged_date: '2026-10-17', logged_at: '2026-10-17T10:00:00Z',
  } as import('../../api/types').StudentSetLog] : [])
  const old = previous()
  old.weeks[4].days[0] = { ...old.weeks[4].days[0], serverDayId: 'early-day', completedAt: '2026-10-17T10:00:00Z', rows: [blockRow('early', { serverRowId: 'early-exercise', hasLogs: true })] }
  await act(async () => { render({ previousCycle: old, studentId: 'student' }); await Promise.resolve() })
  await act(async () => { click(host.querySelector('.show-actuals')!); await Promise.resolve() })
  expect(zone().querySelector('[data-rowid="early"] code')?.textContent).toContain('112.5')
  expect(getStudentSetLogs).toHaveBeenCalledOnce()
})

it.each([
  ['zh-Hant', '上一週期', '當前週期', '週期', '只讀 · 可以檢視和複製'],
  ['en', 'Previous block', 'Current block', 'Block', 'Read only · View and copy'],
] as const)('030 renders the short previous block and cycle headings in %s', (locale, prev, current, label, readOnly) => {
  setLocale(locale)
  const old = previous()
  old.plan.plan_weeks = 1; old.plan.status = 'completed'; old.weeks = old.weeks.slice(0, 1)
  render({ previousCycle: old })
  expect(numbers()).toEqual(['1'])
  expect(zone().textContent).toContain(prev)
  expect(host.querySelector('[data-current-cycle] .cycle-label')?.textContent).toBe(current)
  expect(host.querySelector('[data-plan-menu-trigger] small')?.textContent).toBe(label)
  expect(zone().textContent).toContain(readOnly)
  expect(zone().querySelectorAll('.cycle-actions button')).toHaveLength(1)
})

it('030-B edits previous W5 independently and submits every previous week from its heading', async () => {
  const savePrevious = vi.fn(async (weeks: import('./types').Week[]) => ({ weeks, changedDays: 1, degradedRows: 0, skippedRows: 0 }))
  const saveCurrent = vi.fn()
  const old = { ...previous(), onSave: savePrevious }
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  render({ previousCycle: old, onSave: saveCurrent })
  const top = host.querySelector('.block-topbar')!
  const before = top.textContent
  click(zone().querySelector('[data-block-week="5"][data-dow="0"]')!)
  const weight = zone().querySelector<HTMLInputElement>('[data-c="weight"] input')
  expect(weight).not.toBeNull()
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(weight, '135')
    weight!.dispatchEvent(new Event('input', { bubbles: true }))
  })
  expect(zone().textContent).toContain('未更新 · 学员还看不到这些改动')
  expect(top.textContent).toBe(before)
  expect(button('↑ 再往前 1 周')).toBeUndefined()
  await act(async () => { click(button('更新上一周期')); await Promise.resolve() })
  expect(savePrevious).toHaveBeenCalledOnce()
  expect(savePrevious.mock.calls[0][0]).toHaveLength(5)
  expect(savePrevious.mock.calls[0][0][4].days[0].rows[0].boxes[0].val).toBe('135')
  expect(savePrevious.mock.calls[0][0][0].days[0].rows[0].boxes[0].val).toBe('120')
  expect(saveCurrent).not.toHaveBeenCalled()
  expect(zone().textContent).not.toContain('未更新 · 学员还看不到这些改动')
})

function editWeight(area: HTMLElement, week: number, value: string) {
  click(area.querySelector(`[data-block-week="${week}"][data-dow="0"]`)!)
  const input = area.querySelector<HTMLInputElement>('[data-c="weight"] input')!
  act(() => {
    input.focus()
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.blur()
  })
}

it('030-B undo and redo follow the active cycle while Cmd S always saves current', async () => {
  const currentSave = vi.fn(async (weeks: import('./types').Week[]) => ({ weeks, changedDays: 1, degradedRows: 0, skippedRows: 0 }))
  const oldSave = vi.fn(async (weeks: import('./types').Week[]) => ({ weeks, changedDays: 1, degradedRows: 0, skippedRows: 0 }))
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  render({ onSave: currentSave, previousCycle: { ...previous(), onSave: oldSave } })
  const current = host.querySelector<HTMLElement>('[data-current-cycle]')!
  editWeight(current, 1, '145')
  editWeight(zone(), 5, '135')
  await blockKey('z', { metaKey: true })
  expect(zone().querySelector<HTMLInputElement>('[data-c="weight"] input')?.value).toBe('120')
  expect(current.querySelector<HTMLInputElement>('[data-c="weight"] input')?.value).toBe('145')
  await blockKey('z', { metaKey: true, shiftKey: true })
  expect(zone().querySelector<HTMLInputElement>('[data-c="weight"] input')?.value).toBe('135')
  await blockKey('s', { metaKey: true })
  expect(currentSave).toHaveBeenCalledOnce()
  expect(oldSave).not.toHaveBeenCalled()
})

it.each([false, true])('030-B confirms current-only delivery with a dirty previous cycle: published=%s', async published => {
  const saveCurrent = vi.fn(async (weeks: import('./types').Week[]) => ({ weeks, changedDays: 1, degradedRows: 0, skippedRows: 0 }))
  const savePrevious = vi.fn()
  const onPublish = vi.fn().mockResolvedValue(undefined)
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  render({ initialPublished: published, onSave: saveCurrent, onPublish, previousCycle: { ...previous(), onSave: savePrevious } })
  editWeight(zone(), 5, '135')
  const status = host.querySelector('[data-testid="plan-save-status"]')!.textContent
  click(host.querySelector('.block-topbar .block-primary')!)
  const dialog = host.querySelector('[role="dialog"]')!
  expect(dialog).not.toBeNull()
  expect(dialog.textContent).toContain(`只${published ? '更新' : '发布'}当前周期「备赛期」`)
  expect(dialog.textContent).toContain(`上一周期「力量基础」还有未更新的改动，这次不会一起提交。${published ? '更新' : '发布'}后可以在它的标题条上点「更新上一周期」。`)
  expect(saveCurrent).not.toHaveBeenCalled()
  click([...dialog.querySelectorAll('button')].find(b => b.textContent === '取消')!)
  expect(host.querySelector('[role="dialog"]')).toBeNull()
  expect(host.querySelector('[data-testid="plan-save-status"]')!.textContent).toBe(status)
  click(host.querySelector('.block-topbar .block-primary')!)
  await act(async () => { click(button(published ? '更新当前周期' : '发布当前周期')); await Promise.resolve() })
  expect(saveCurrent).toHaveBeenCalledOnce()
  expect(onPublish).toHaveBeenCalledTimes(published ? 0 : 1)
  expect(savePrevious).not.toHaveBeenCalled()
  expect(zone().textContent).toContain('未更新 · 学员还看不到这些改动')
})

it.each(['completed', 'paused', 'ended'] as const)('030-B keeps %s previous content read-only and copyable', async state => {
  const old = previous()
  if (state !== 'ended') old.plan.status = state
  const onSave = vi.fn()
  render({ previousCycle: { ...old, onSave }, student: state === 'ended' ? { id: 'student', bond_status: 'ended' } as import('../../api/types').CoachStudent : undefined })
  expect(zone().textContent).toContain('只读 · 可以查看和复制')
  click(zone().querySelector('[data-rowid]')!)
  await blockKey('c', { metaKey: true })
  const { clipboardStore } = await import('./clipboardStore')
  expect(clipboardStore.read()?.text).toContain('w4-0-0')
  for (const key of ['v', 'x', 'z', 'd']) await blockKey(key, { metaKey: true })
  await blockKey('Delete')
  expect(zone().querySelector('input, .block-insert-gap')).toBeNull()
  expect(onSave).not.toHaveBeenCalled()
})

it.each(['row', 'day'] as const)('030-B copies current %s back into previous without changing current', async kind => {
  const save = vi.fn(async (weeks: import('./types').Week[]) => ({ weeks, changedDays: 1, degradedRows: 0, skippedRows: 0 }))
  const current = blockWeeks([[0]])
  current[0].days[0].rows = [blockRow('from-current', { boxes: [{ val: '145', empty: false }] })]
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  render({ initialWeeks: current, weeksCount: 1, previousCycle: { ...previous(), onSave: save } })
  click(host.querySelector(`[data-current-cycle] ${kind === 'row' ? '[data-rowid]' : '[data-block-week="1"][data-dow="0"]'}`)!)
  await blockKey('c', { metaKey: true })
  click(zone().querySelector('[data-block-week="5"][data-dow="0"]')!)
  await blockKey('v', { metaKey: true }); await blockKey('Escape')
  expect(zone().textContent).toContain('from-current')
  await act(async () => { click(button('更新上一周期')); await Promise.resolve() })
  expect(save.mock.calls[0][0][4].days[0].rows.some(row => row.name === 'from-current')).toBe(true)
  expect(current[0].days[0].rows).toHaveLength(1)
})

it('030-B keeps the single history rail on the active previous selection while interacting with the rail', async () => {
  const { getExerciseStats, getStudentSetLogs, getStudentFeedback } = await import('../../api/coach')
  vi.mocked(getExerciseStats).mockResolvedValue({ recent_sessions: [], rep_prs: [], by_set_count: {}, e1rm: null, one_rm_reference: null })
  vi.mocked(getStudentSetLogs).mockResolvedValue([])
  vi.mocked(getStudentFeedback).mockResolvedValue([])
  const old = previous()
  old.weeks[4].days[0].rows = [blockRow('old-squat')]
  render({ previousCycle: old, studentId: 'student' })
  click(zone().querySelector('[data-block-week="5"][data-dow="0"]')!)
  act(() => zone().querySelector<HTMLInputElement>('[data-c="reps"] input')!.focus())
  await act(async () => { await Promise.resolve() })
  expect(host.querySelectorAll('.block-history')).toHaveLength(1)
  const history = host.querySelector('.block-history')!
  expect(history.textContent).toContain('old-squat')
  click(history)
  expect(host.querySelector('.block-history')!.textContent).toContain('old-squat')
})

it('030-B keyboard cell navigation stays in current despite duplicate local row IDs', async () => {
  render()
  click(button('展开整份'))
  editWeight(zone(), 1, '135')
  const current = host.querySelector<HTMLElement>('[data-current-cycle]')!
  editWeight(current, 1, '145')
  const input = current.querySelector<HTMLInputElement>('[data-c="reps"] input')!
  act(() => input.focus())
  act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })))
  await act(async () => vi.advanceTimersByTime(0))
  expect(current.contains(document.activeElement)).toBe(true)
  expect(zone().contains(document.activeElement)).toBe(false)
})

it('030-C rejects cross-cycle movement, preserves source during cross-fill, and allows previous internal fill', async () => {
  const old = previous()
  old.weeks = blockWeeks(Array.from({ length: 5 }, () => [0]), 2)
  old.weeks[3].days[0].rows[0].hasLogs = true
  const save = vi.fn(async (weeks: import('./types').Week[]) => ({ weeks, changedDays: 1, degradedRows: 0, skippedRows: 0 }))
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  render({ previousCycle: { ...old, onSave: save } })
  expect(zone().querySelector('[data-block-week="4"] [data-rowid]')?.getAttribute('data-drag-disabled')).toBe('true')
  click(button('展开整份'))
  const source = zone().querySelector<HTMLElement>('[data-block-week="1"] [data-rowid]')!
  const target = host.querySelector<HTMLElement>('[data-current-cycle] [data-rowid]')!
  Object.defineProperty(document, 'elementsFromPoint', { configurable: true, value: () => [target] })
  act(() => source.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientY: 0 })))
  act(() => window.dispatchEvent(new MouseEvent('mousemove', { buttons: 1, clientY: 30 })))
  expect(document.body.style.cursor).toBe('not-allowed')
  act(() => window.dispatchEvent(new MouseEvent('mouseup', { clientY: 30 })))
  await act(async () => vi.advanceTimersByTime(0))
  click(zone().querySelector('[data-block-week="1"][data-dow="0"]')!); await blockKey('Escape')
  let hit: Element = host.querySelector('[data-current-cycle] [data-block-week="12"][data-dow="0"]')!
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => hit })
  const fill = () => {
    act(() => zone().querySelector('.block-fill-handle')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })))
    act(() => window.dispatchEvent(new MouseEvent('mousemove', { buttons: 1, clientY: 30 })))
    act(() => window.dispatchEvent(new MouseEvent('mouseup', { clientY: 30 })))
  }
  fill()
  expect(button('更新上一周期')).toBeUndefined()
  hit = zone().querySelector('[data-block-week="5"][data-dow="0"]')!
  fill()
  await act(async () => { click(button('更新上一周期')); await Promise.resolve() })
  expect(save.mock.calls[0][0]).toHaveLength(5)
  expect(save.mock.calls[0][0][4].days[0].rows[0].name).toBe('w1-0-0')
  expect(save.mock.calls[0][0][3].days[0].rows[0].name).toBe('w4-0-0')
  expect(host.querySelector('[data-current-cycle] [data-block-week="1"]')!.textContent).toContain('w1-0-0')
  Reflect.deleteProperty(document, 'elementsFromPoint'); Reflect.deleteProperty(document, 'elementFromPoint')
})

it('030-B keeps previous submit disabled until current publication has finished', async () => {
  let finish!: () => void
  const publish = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
  const save = vi.fn(async (weeks: import('./types').Week[]) => ({ weeks, changedDays: 1, degradedRows: 0, skippedRows: 0 }))
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  render({ onSave: save, onPublish: publish, previousCycle: { ...previous(), onSave: save } })
  editWeight(zone(), 5, '135')
  click(host.querySelector('.block-topbar .block-primary')!)
  await act(async () => { click(button('发布当前周期')); await Promise.resolve() })
  expect(publish).toHaveBeenCalledOnce()
  expect(button('更新上一周期').disabled).toBe(true)
  await act(async () => { finish(); await Promise.resolve() })
  expect(button('更新上一周期').disabled).toBe(false)
})


it.each(['by-week', 'by-day'] as const)('030-C fills current W1 through the drop week without changing previous: %s', async layout => {
  const old = previous()
  old.weeks[3].days[0].rows = [blockRow('cross-source', { name: '跨周期处方', serverRowId: 'old-row', hasLogs: true,
    note: '源备注', opaqueSets: [{ set_number: 1, target_reps: 3, target_reps_max: null, intensity_mode: 'weight', target_value: '120', set_type: 'working', rest_seconds: 180, coach_note: '组备注' }] })]
  const original = structuredClone(old.weeks)
  const onSave = vi.fn(async (weeks: import('./types').Week[]) => ({ weeks, changedDays: 1, degradedRows: 0, skippedRows: 0 }))
  const oldSave = vi.fn()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  render({ previousCycle: { ...old, onSave: oldSave }, onSave })
  if (layout === 'by-day') click(host.querySelector('[aria-label="按天排"]')!)
  click(zone().querySelector('[data-block-week="4"][data-dow="0"]')!); await blockKey('Escape')
  const current = host.querySelector<HTMLElement>('[data-current-cycle]')!
  const target = current.querySelector('[data-block-week="2"][data-dow="0"]')!
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => target })
  act(() => zone().querySelector('.block-fill-handle')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })))
  act(() => window.dispatchEvent(new MouseEvent('mousemove', { buttons: 1, clientY: 30 })))
  expect(current.querySelectorAll('.fill-preview')).toHaveLength(2)
  expect(current.querySelector('.block-fill-ghost')?.textContent).toContain('跨周期处方')
  expect(zone().querySelector('.fill-preview')).toBeNull()
  act(() => window.dispatchEvent(new MouseEvent('mouseup', { clientY: 30 })))
  expect(current.querySelector('[data-block-week="1"][data-dow="0"]')!.textContent).toContain('跨周期处方')
  expect(current.querySelector('[data-block-week="2"][data-dow="0"]')!.textContent).toContain('跨周期处方')
  expect(current.querySelector('[data-block-week="3"][data-dow="0"]')!.textContent).toContain('w3-0-0')
  expect(button('更新上一周期')).toBeUndefined()
  await blockKey('z', { metaKey: true })
  expect(current.querySelector('[data-block-week="1"][data-dow="0"]')!.textContent).toContain('w1-0-0')
  await blockKey('z', { metaKey: true, shiftKey: true })
  await blockKey('s', { metaKey: true })
  const saved = onSave.mock.lastCall![0]
  const copies = [saved[0].days[0].rows[0], saved[1].days[0].rows[0]]
  for (const row of copies) {
    expect(row.name).toBe('跨周期处方'); expect(row.hasLogs).toBe(false); expect(row.serverRowId).toBeNull()
    expect(row.opaqueSets).toEqual(original[3].days[0].rows[0].opaqueSets)
    expect(row.note).toBe('源备注')
  }
  expect(new Set(copies.map(row => row.id)).size).toBe(2)
  expect(old.weeks).toEqual(original); expect(oldSave).not.toHaveBeenCalled()
  expect(zone().querySelector('[data-block-week="5"][data-dow="0"]')!.textContent).toContain('w5-0-0')
  Reflect.deleteProperty(document, 'elementFromPoint')
})


it.each(['published', 'completed', 'paused'] as const)('030-C copies the latest previous prescription with %s source status', async status => {
  const old = previous(); old.plan.status = status
  const save = vi.fn(async (weeks: import('./types').Week[]) => ({ weeks, changedDays: 1, degradedRows: 0, skippedRows: 0 }))
  const oldSave = vi.fn()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  render({ previousCycle: { ...old, onSave: oldSave }, onSave: save })
  if (status === 'published') editWeight(zone(), 5, '147.5')
  click(zone().querySelector('[data-block-week="5"][data-dow="0"]')!); await blockKey('Escape')
  const target = host.querySelector('[data-current-cycle] [data-block-week="1"][data-dow="0"]')!
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => target })
  act(() => zone().querySelector('.block-fill-handle')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })))
  act(() => window.dispatchEvent(new MouseEvent('mousemove', { buttons: 1 })))
  act(() => window.dispatchEvent(new MouseEvent('mouseup')))
  await blockKey('s', { metaKey: true })
  expect(save.mock.lastCall![0][0].days[0].rows[0].boxes[0].val).toBe(status === 'published' ? '147.5' : '120')
  expect(oldSave).not.toHaveBeenCalled()
  Reflect.deleteProperty(document, 'elementFromPoint')
})

it.each(['reject-overwrite', 'escape', 'blur', 'outside', 'layout', 'unmount'] as const)('030-C cancels without modifying either cycle: %s', async action => {
  const save = vi.fn(async (weeks: import('./types').Week[]) => ({ weeks, changedDays: 1, degradedRows: 0, skippedRows: 0 }))
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  render({ onSave: save })
  click(zone().querySelector('[data-block-week="5"][data-dow="0"]')!); await blockKey('Escape')
  const current = host.querySelector<HTMLElement>('[data-current-cycle]')!
  let target: Element | null = current.querySelector('[data-block-week="2"][data-dow="0"]')!
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => target })
  act(() => zone().querySelector('.block-fill-handle')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })))
  act(() => window.dispatchEvent(new MouseEvent('mousemove', { buttons: 1 })))
  expect(current.querySelectorAll('.fill-preview')).toHaveLength(2)
  if (action === 'escape') await blockKey('Escape')
  if (action === 'blur') act(() => window.dispatchEvent(new Event('blur')))
  if (action === 'outside') { target = null; act(() => window.dispatchEvent(new MouseEvent('mousemove', { buttons: 1 }))) }
  if (action === 'layout') click(host.querySelector('[aria-label="按天排"]')!)
  if (action === 'unmount') render({ onSave: save }, 'replacement')
  act(() => window.dispatchEvent(new MouseEvent('mouseup')))
  expect(host.querySelector('.fill-preview')).toBeNull()
  expect(confirm).toHaveBeenCalledTimes(action === 'reject-overwrite' ? 1 : 0)
  await blockKey('s', { metaKey: true })
  expect(save.mock.lastCall![0][0].days[0].rows[0].name).toBe('w1-0-0')
  expect(button('更新上一周期')).toBeUndefined()
  Reflect.deleteProperty(document, 'elementFromPoint')
})


it('030-C targets the hovered column, skips logged days and preserves target dates and IDs', async () => {
  const old = previous(), current = blockWeeks([[0,2], [0,2], [0,2]])
  old.weeks[4].days[0].rows[0].name = '复制源'
  current[0].days[2].rows[0].hasLogs = true
  current[0].days[2].serverDayId = 'logged-day'
  current[1].days[2].completedAt = '2026-11-24T10:00:00Z'
  current[2].days[2].serverDayId = 'target-day'
  const save = vi.fn(async (weeks: import('./types').Week[]) => ({ weeks, changedDays: 1, degradedRows: 0, skippedRows: 0 }))
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  render({ previousCycle: old, initialWeeks: current, weeksCount: 3, onSave: save })
  click(zone().querySelector('[data-block-week="5"][data-dow="0"]')!); await blockKey('Escape')
  const target = host.querySelector('[data-current-cycle] [data-block-week="3"][data-dow="2"]')!
  const date = target.querySelector('.block-date')?.textContent
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => target })
  act(() => zone().querySelector('.block-fill-handle')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })))
  act(() => window.dispatchEvent(new MouseEvent('mousemove', { buttons: 1 })))
  expect(host.querySelectorAll('.fill-preview')).toHaveLength(1)
  act(() => window.dispatchEvent(new MouseEvent('mouseup')))
  await blockKey('s', { metaKey: true })
  const saved = save.mock.lastCall![0]
  expect(saved[0].days[2]).toEqual(current[0].days[2])
  expect(saved[1].days[2]).toEqual(current[1].days[2])
  expect(saved[2].days[2]).toMatchObject({ serverDayId: 'target-day', rows: [{ name: '复制源' }] })
  expect(target.querySelector('.block-date')?.textContent).toBe(date)
  expect(saved[2].days[0].rows[0].name).toBe('w3-0-0')
  Reflect.deleteProperty(document, 'elementFromPoint')
})

it.each(['completed', 'paused', 'ended'] as const)('030-C refuses a %s target without changing the source', async state => {
  const old = previous(), save = vi.fn(), oldSave = vi.fn()
  render({ previousCycle: { ...old, onSave: oldSave }, onSave: save, planStatus: state === 'ended' ? 'published' : state,
    student: state === 'ended' ? { id: 'student', bond_status: 'ended' } as import('../../api/types').CoachStudent : undefined })
  click(zone().querySelector('[data-block-week="5"][data-dow="0"]')!); await blockKey('Escape')
  const handle = zone().querySelector('.block-fill-handle')
  const target = host.querySelector('[data-current-cycle] [data-block-week="1"][data-dow="0"]')!
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => target })
  if (handle) {
    act(() => handle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })))
    act(() => window.dispatchEvent(new MouseEvent('mousemove', { buttons: 1 })))
    act(() => window.dispatchEvent(new MouseEvent('mouseup')))
  }
  expect(host.querySelector('.fill-preview')).toBeNull()
  expect(target.textContent).toContain('w1-0-0')
  expect(button('更新上一周期')).toBeUndefined()
  expect(save).not.toHaveBeenCalled(); expect(oldSave).not.toHaveBeenCalled()
  Reflect.deleteProperty(document, 'elementFromPoint')
})


it.each([true, false])('030-C copies an explicit=%s rest day without changing previous', async explicit => {
  const old = previous()
  old.weeks[3].days[0] = { ...old.weeks[3].days[0], dayType: explicit ? 'rest' : undefined, rest: true, rows: [] }
  const save = vi.fn(async (weeks: import('./types').Week[]) => ({ weeks, changedDays: 1, degradedRows: 0, skippedRows: 0 }))
  const oldSave = vi.fn(async (weeks: import('./types').Week[]) => ({ weeks, changedDays: 1, degradedRows: 0, skippedRows: 0 }))
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  render({ previousCycle: { ...old, restDaysEnabled: true, onSave: oldSave }, restDaysEnabled: true, onSave: save })
  click(zone().querySelector('[data-block-week="4"][data-dow="0"]')!); await blockKey('Escape')
  let target: Element = host.querySelector('[data-current-cycle] [data-block-week="1"][data-dow="0"]')!
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => target })
  const start = () => act(() => zone().querySelector('.block-fill-handle')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })))
  const move = () => act(() => window.dispatchEvent(new MouseEvent('mousemove', { buttons: 1 })))
  start(); move()
  act(() => window.dispatchEvent(new MouseEvent('mouseup')))
  await blockKey('s', { metaKey: true })
  expect(save.mock.lastCall![0][0].days[0]).toMatchObject({ dayType: explicit ? 'rest' : undefined, rest: true, rows: [] })
  expect(button('更新上一周期')).toBeUndefined()
  if (!explicit) { Reflect.deleteProperty(document, 'elementFromPoint'); return }
  start(); move()
  target = zone().querySelector('[data-block-week="5"][data-dow="0"]')!
  move()
  expect(host.querySelector('[data-current-cycle] .fill-preview')).toBeNull()
  expect(zone().querySelector('.fill-preview')).not.toBeNull()
  act(() => window.dispatchEvent(new MouseEvent('mouseup')))
  await act(async () => { click(button('更新上一周期')); await Promise.resolve() })
  if (explicit) expect(oldSave.mock.lastCall![0][4].days[0]).toMatchObject({ dayType: 'rest', rest: true, rows: [] })
  Reflect.deleteProperty(document, 'elementFromPoint')
})
