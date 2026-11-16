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
  expect(zone().textContent).toContain('只读 · 可以查看和复制')
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
  old.weeks[4].days[0].rows = [blockRow('unbound-previous', { exerciseId: null, ku: false })]
  const onSave = vi.fn()
  render({ previousCycle: old, onSave })
  expect(host.querySelector('[data-plan-context-bar]')?.textContent).not.toContain('待核对')
  click(host.querySelector('[data-current-cycle] [data-rowid]')!)
  await blockKey('c', { metaKey: true })
  click(zone().querySelector('[data-rowid="unbound-previous"]')!)
  for (const key of ['v', 'x', 'z', 'd', 's']) await blockKey(key, { metaKey: true })
  await blockKey('Delete')
  act(() => zone().querySelector('[data-block-week="5"][data-dow="0"]')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })))
  expect(zone().querySelector('input, select, .block-fill-handle, .block-insert-gap')).toBeNull()
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
  old.plan.plan_weeks = 1; old.weeks = old.weeks.slice(0, 1)
  render({ previousCycle: old })
  expect(numbers()).toEqual(['1'])
  expect(zone().textContent).toContain(prev)
  expect(host.querySelector('[data-current-cycle] .cycle-label')?.textContent).toBe(current)
  expect(host.querySelector('[data-plan-menu-trigger] small')?.textContent).toBe(label)
  expect(zone().textContent).toContain(readOnly)
  expect(zone().querySelectorAll('.cycle-actions button')).toHaveLength(1)
})
