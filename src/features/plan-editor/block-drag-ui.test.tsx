import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PlanEditor } from './PlanEditor'
import { blockWeeks, blockRow, blockCell, blockKey, openBlockDay } from './blockGridTestUtils'
import type { Week } from './types'
import type { StudentSetLog } from '../../api/types'
import { getStudentSetLogs } from '../../api/coach'
import { setLocale } from '../../i18n/locale'

vi.mock('../../api/coach', () => ({
  getStudentSetLogs: vi.fn(async () => []),
  getExerciseStats: vi.fn(async () => ({ one_rm_reference: null, e1rm: null, rep_prs: [], by_set_count: {}, recent_sessions: [] })),
}))

let host: HTMLDivElement, root: Root
beforeEach(() => { host = document.createElement('div'); document.body.append(host); root = createRoot(host) })
afterEach(() => {
  act(() => root.unmount()); host.remove(); vi.restoreAllMocks()
  Reflect.deleteProperty(document, 'elementsFromPoint')
  setLocale('zh'); vi.useRealTimers()
})
const save = () => vi.fn(async (weeks: Week[]) => ({ weeks, changedDays: 1, degradedRows: 0, skippedRows: 0 }))
const source = () => {
  const weeks = blockWeeks([[0, 2]], 0)
  weeks[0].days[0].rows = [blockRow('squat'), blockRow('bench'), blockRow('curl', { isMain: false })]
  weeks[0].days[2].rows = [blockRow('other')]
  return weeks
}
const brick = (id: string) => host.querySelector<HTMLElement>(`.block-brick[data-rowid="${id}"]`)!
function pointAt(target: HTMLElement | null) {
  if (target) vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({ top: 0, height: 20, width: 180, left: 0 } as DOMRect)
  Object.defineProperty(document, 'elementsFromPoint', { configurable: true, value: () => target ? [target] : [] })
}
function drag(from: HTMLElement, target: HTMLElement | null, distance = 19) {
  pointAt(target)
  act(() => from.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientY: 0 })))
  act(() => window.dispatchEvent(new MouseEvent('mousemove', { buttons: 1, clientY: distance })))
  act(() => window.dispatchEvent(new MouseEvent('mouseup', { clientY: distance })))
}

it('saves the collapsed brick reorder through the draft save boundary', async () => {
  const onSave = save()
  act(() => root.render(<PlanEditor initialWeeks={source()} weeksCount={1} studentName="学员" planName="计划" onSave={onSave} />))
  drag(brick('squat'), brick('bench'))
  await blockKey('s', { ctrlKey: true })
  expect(onSave).toHaveBeenCalledOnce()
  expect(onSave.mock.calls[0][0][0].days[0].rows.map(row => row.id)).toEqual(['bench', 'squat', 'curl'])
  expect(host.querySelector('.is-editing')).toBeNull()
  expect([...host.querySelectorAll<HTMLElement>('.block-brick.row-sel')].map(el => el.dataset.rowid)).toEqual(['squat'])
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
  openBlockDay(host)
  expect([...blockCell(host, 1, 0).querySelectorAll<HTMLElement>('.exrow')].map(el => el.dataset.rowid)).toEqual(['bench', 'squat', 'curl'])
})

it('shows the drag guidance and cross-section warning while keeping the save order', async () => {
  const onSave = save()
  act(() => root.render(<PlanEditor initialWeeks={source()} weeksCount={1} studentName="学员" planName="计划" onSave={onSave} />))
  pointAt(brick('bench'))
  act(() => brick('squat').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })))
  act(() => window.dispatchEvent(new MouseEvent('mousemove', { buttons: 1, clientY: 19 })))
  expect(host.textContent).toContain('拖动调整顺序 · 只能在当天同一分区内移动')
  expect(brick('bench').classList.contains('brick-drop-after')).toBe(true)
  pointAt(brick('curl'))
  act(() => window.dispatchEvent(new MouseEvent('mousemove', { buttons: 1, clientY: 19 })))
  expect(host.textContent).toContain('主项和辅助项不能混排')
  expect(document.body.style.cursor).toBe('not-allowed')
  expect(host.querySelector('.brick-drop-before,.brick-drop-after')).toBeNull()
  act(() => window.dispatchEvent(new MouseEvent('mouseup', { clientY: 19 })))
  expect(host.textContent).not.toContain('主项和辅助项不能混排')
  await blockKey('s', { ctrlKey: true })
  expect(onSave.mock.calls[0][0][0].days[0].rows.map(row => row.id)).toEqual(['squat', 'bench', 'curl'])
})

it.each([false, true])('reorders in by-day layout, saving only on update for published=%s', async (published) => {
  const onSave = save()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  act(() => root.render(<PlanEditor initialWeeks={source()} weeksCount={1} studentName="学员" planName="计划"
    initialPublished={published} onSave={onSave} />))
  act(() => host.querySelector<HTMLButtonElement>('[aria-label="按天排"]')!.click())
  drag(brick('squat'), brick('bench'))
  expect(onSave).not.toHaveBeenCalled()
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
  await act(async () => {
    if (published) [...host.querySelectorAll('button')].find(button => button.textContent === '更新计划')!.click()
    else await blockKey('s', { ctrlKey: true })
  })
  expect(onSave).toHaveBeenCalledOnce()
  expect(onSave.mock.calls[0][0][0].days[0].rows.map(row => row.id)).toEqual(['bench', 'squat', 'curl'])
})

it.each(['other-day', 'outside', 'locked', 'read-only', 'under-threshold'] as const)('keeps order for %s', async (kind) => {
  const weeks = source(), onSave = save()
  if (kind === 'locked') weeks[0].days[0].rows[1].hasLogs = true
  act(() => root.render(<PlanEditor initialWeeks={weeks} weeksCount={1} studentName="学员" planName="计划"
    readOnly={kind === 'read-only'} onSave={onSave} />))
  drag(brick('squat'), kind === 'outside' ? null : brick(kind === 'other-day' ? 'other' : 'bench'), kind === 'under-threshold' ? 4 : 19)
  if (kind === 'under-threshold') {
    act(() => brick('squat').click())
    expect(brick('squat').classList.contains('row-sel')).toBe(true)
    expect(host.querySelector('.is-editing')).toBeNull()
  }
  if (kind === 'locked') {
    expect(brick('squat').title).toBe('该日含学员已打卡动作，整天不可拖排')
    expect(brick('squat').dataset.hint).toBe(brick('squat').title)
    expect(brick('squat').dataset.dragDisabled).toBe('true')
  }
  await blockKey('s', { ctrlKey: true })
  if (kind === 'read-only') expect(onSave).not.toHaveBeenCalled()
  else expect(onSave.mock.calls[0][0][0].days[0].rows.map(row => row.id)).toEqual(['squat', 'bench', 'curl'])
  expect([...blockCell(host, 1, 0).querySelectorAll<HTMLElement>('[data-rowid]')].map(el => el.dataset.rowid)).toEqual(['squat', 'bench', 'curl'])
})

it('starts marquee selection from a brick on a locked day', () => {
  const weeks = source()
  weeks[0].days[0].rows[1].hasLogs = true
  act(() => root.render(<PlanEditor initialWeeks={weeks} weeksCount={1} studentName="学员" planName="计划" />))
  const bounds = { left: 0, top: 0, right: 180, bottom: 20, width: 180, height: 20 } as DOMRect
  vi.spyOn(blockCell(host, 1, 0), 'getBoundingClientRect').mockReturnValue(bounds)
  vi.spyOn(brick('squat'), 'getBoundingClientRect').mockReturnValue(bounds)
  act(() => brick('squat').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 1, clientY: 1 })))
  act(() => window.dispatchEvent(new MouseEvent('mousemove', { buttons: 1, clientX: 100, clientY: 19 })))
  expect(host.querySelector('.block-marquee')).not.toBeNull()
  expect(brick('squat').classList.contains('row-sel')).toBe(true)
  expect(document.querySelector('.brick-drag-ghost')).toBeNull()
  act(() => window.dispatchEvent(new MouseEvent('mouseup')))
  expect(host.querySelector('.block-marquee')).toBeNull()
})

it('collapses multi-selection to the held brick and supports undo and redo without click-through', async () => {
  const onSave = save()
  act(() => root.render(<PlanEditor initialWeeks={source()} weeksCount={1} studentName="学员" planName="计划" onSave={onSave} />))
  act(() => { brick('squat').click(); brick('bench').dispatchEvent(new MouseEvent('click', { bubbles: true, metaKey: true })) })
  expect(host.querySelectorAll('.block-brick.row-sel')).toHaveLength(2)
  drag(brick('squat'), brick('bench'))
  act(() => brick('bench').click()) // browser's click immediately following mouseup must be suppressed
  expect([...host.querySelectorAll<HTMLElement>('.block-brick.row-sel')].map(el => el.dataset.rowid)).toEqual(['squat'])
  await blockKey('z', { metaKey: true })
  await blockKey('s', { ctrlKey: true })
  expect(onSave.mock.calls.at(-1)![0][0].days[0].rows.map(row => row.id)).toEqual(['squat', 'bench', 'curl'])
  await blockKey('z', { metaKey: true, shiftKey: true })
  await blockKey('s', { ctrlKey: true })
  expect(onSave.mock.calls.at(-1)![0][0].days[0].rows.map(row => row.id)).toEqual(['bench', 'squat', 'curl'])
})

it.each(['blur', 'released-outside'] as const)('cancels a pending reorder on %s and restores mouse state', async (kind) => {
  const onSave = save()
  act(() => root.render(<PlanEditor initialWeeks={source()} weeksCount={1} studentName="学员" planName="计划" onSave={onSave} />))
  const cursor = document.body.style.cursor, select = document.body.style.userSelect
  pointAt(brick('bench'))
  act(() => brick('squat').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })))
  act(() => window.dispatchEvent(new MouseEvent('mousemove', { buttons: 1, clientY: 19 })))
  act(() => window.dispatchEvent(kind === 'blur' ? new Event('blur') : new MouseEvent('mousemove', { buttons: 0, clientY: 19 })))
  act(() => window.dispatchEvent(new MouseEvent('mouseup', { clientY: 19 })))
  expect(document.querySelector('.brick-drag-ghost')).toBeNull()
  expect(document.body.style.cursor).toBe(cursor)
  expect(document.body.style.userSelect).toBe(select)
  expect(host.querySelector('.row-drag-status')).toBeNull()
  await blockKey('s', { ctrlKey: true })
  expect(onSave.mock.calls[0][0][0].days[0].rows.map(row => row.id)).toEqual(['squat', 'bench', 'curl'])
})


it('keeps student-added bricks out of drag sources and drop targets', async () => {
  const weeks = source(), onSave = save()
  weeks[0].days[0].serverDayId = 'day-1'
  vi.mocked(getStudentSetLogs).mockResolvedValueOnce([{
    id: 'log-1', student_id: 'student-1', plan_exercise_id: null, plan_day_id: 'day-1',
    exercise_id: 'added', set_index: 0, weight_kg: '10', reps: 5, rpe: null, coach_rpe: null,
    completed: true, failed: false, assumed: false, adhoc: true,
    logged_date: '2020-10-19', logged_at: '2020-10-19T10:00:00Z',
  } as StudentSetLog])
  await act(async () => root.render(<PlanEditor initialWeeks={weeks} weeksCount={1} studentName="学员" planName="计划"
    planStartDate="2020-10-19" studentId="student-1" onSave={onSave} />))
  act(() => host.querySelector<HTMLButtonElement>('.show-actuals')!.click())
  const added = host.querySelector<HTMLElement>('.block-brick[data-student-added="added"]')!
  expect(added).not.toBeNull()
  drag(added, brick('bench'))
  expect(document.querySelector('.brick-drag-ghost')).toBeNull()
  drag(brick('squat'), added)
  await blockKey('s', { ctrlKey: true })
  expect(onSave.mock.calls[0][0][0].days[0].rows.map(row => row.id)).toEqual(['squat', 'bench', 'curl'])
})

it.each(['en', 'zh-Hant'] as const)('renders drag guidance in %s', (locale) => {
  setLocale(locale)
  act(() => root.render(<PlanEditor initialWeeks={source()} weeksCount={1} studentName="学员" planName="计划" />))
  pointAt(brick('bench'))
  act(() => brick('squat').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })))
  act(() => window.dispatchEvent(new MouseEvent('mousemove', { buttons: 1, clientY: 19 })))
  expect(host.querySelector('.row-drag-status')?.textContent).toBe(locale === 'en'
    ? 'Drag to reorder · Stay within the same day and section' : '拖曳調整順序 · 只能在當天同一分區內移動')
  pointAt(brick('curl'))
  act(() => window.dispatchEvent(new MouseEvent('mousemove', { buttons: 1, clientY: 19 })))
  expect(host.querySelector('.row-drag-status')?.textContent).toBe(locale === 'en'
    ? 'Main and accessory exercises cannot be mixed' : '主項和輔助項不能混排')
})

it('leaves initial order untouched until a draft drag autosaves it', async () => {
  vi.useFakeTimers()
  const weeks = source(), onSave = save()
  act(() => root.render(<PlanEditor initialWeeks={weeks} weeksCount={1} studentName="学员" planName="计划" onSave={onSave} />))
  await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
  expect(onSave).not.toHaveBeenCalled()
  drag(brick('squat'), brick('bench'))
  await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
  expect(onSave).toHaveBeenCalledOnce()
  expect(onSave.mock.calls[0][0][0].days[0].rows.map(row => row.id)).toEqual(['bench', 'squat', 'curl'])
  expect(weeks[0].days[0].rows.map(row => row.id)).toEqual(['squat', 'bench', 'curl'])
  const saved = onSave.mock.calls[0][0]
  act(() => { root.unmount(); root = createRoot(host) })
  act(() => root.render(<PlanEditor initialWeeks={saved} weeksCount={1} studentName="学员" planName="计划" onSave={onSave} />))
  expect([...blockCell(host, 1, 0).querySelectorAll<HTMLElement>('[data-rowid]')].map(el => el.dataset.rowid)).toEqual(['bench', 'squat', 'curl'])
  await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
  expect(onSave).toHaveBeenCalledOnce()
})
