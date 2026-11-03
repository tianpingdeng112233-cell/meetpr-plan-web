import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PlanEditor } from './PlanEditor'
import { blockWeeks, blockRow, blockCell, blockKey } from './blockGridTestUtils'
import type { Week } from './types'
import { ReconcileConflict } from './reconcile'
let host: HTMLDivElement, root: Root
beforeEach(() => { host = document.createElement('div'); document.body.append(host); root = createRoot(host) })
afterEach(() => { act(() => root.unmount()); host.remove(); vi.useRealTimers(); vi.restoreAllMocks() })
function select(week: number, dx: number, modifiers: MouseEventInit = {}) {
  act(() => blockCell(host, week, dx).dispatchEvent(new MouseEvent('click', { bubbles: true, ...modifiers })))
}
function selected() { return [...host.querySelectorAll<HTMLElement>('.block-cell.is-selected')].map(cell => `${cell.dataset.blockWeek}:${cell.dataset.dow}`) }

it('adds and removes whole days with Command-click and retains selections while scrolling', () => {
  act(() => root.render(<PlanEditor initialWeeks={blockWeeks([[0,2],[0,2]])} weeksCount={2} studentName="学员" planName="计划" />))
  select(1,0); select(2,1,{metaKey:true})
  expect(selected()).toEqual(['1:0','2:2'])
  act(() => host.querySelector('.scroller')!.dispatchEvent(new Event('scroll')))
  expect(selected()).toEqual(['1:0','2:2'])
  select(1,0,{metaKey:true})
  expect(selected()).toEqual(['2:2'])
})

it('copies multiple days with calendar offsets in one paste and one undo', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  act(() => root.render(<PlanEditor initialWeeks={blockWeeks([[0,2],[0,2]])} weeksCount={2} studentName="学员" planName="计划" />))
  select(1,0); select(1,1,{metaKey:true}); await blockKey('c',{metaKey:true})
  select(2,0); await blockKey('v',{metaKey:true})
  expect(blockCell(host,2,1).textContent).toContain('w1-2-0')
  expect(blockCell(host,2,0).querySelector<HTMLInputElement>('[data-c="name"] input')?.value).toBe('w1-0-0')
  await blockKey('z',{metaKey:true})
  expect(blockCell(host,2,1).textContent).toContain('w2-2-0')
})

it('auto-extends a draft with empty weeks and undoes the paste and extension together at onSave', async () => {
  vi.useFakeTimers()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  const onSave = vi.fn(async (weeks: Week[]) => ({ weeks: structuredClone(weeks), changedDays: 3, degradedRows: 0, skippedRows: 0,
    planWeeks: weeks.length, planStartDate: '2026-10-19', planEndDate: weeks.length === 5 ? '2026-11-22' : '2026-11-15' }))
  act(() => root.render(<PlanEditor initialWeeks={blockWeeks([[0],[0],[0],[0]])} weeksCount={4}
    planStartDate="2026-10-19" studentName="学员" planName="计划" onSave={onSave} />))
  await act(async () => vi.advanceTimersByTimeAsync(2000))
  expect(onSave).not.toHaveBeenCalled()
  select(1,0); select(2,0,{metaKey:true}); select(3,0,{metaKey:true}); await blockKey('c',{metaKey:true})
  select(3,0); await blockKey('v',{metaKey:true})
  expect(host.querySelectorAll('[data-week-slot]')).toHaveLength(5)
  expect(host.querySelector('[data-testid="plan-save-status"]')?.textContent).toContain('计划已延长到 5 周')
  await act(async () => vi.advanceTimersByTimeAsync(2000))
  expect(onSave).toHaveBeenCalledOnce()
  const saved = onSave.mock.calls[0][0]
  expect(saved).toHaveLength(5)
  expect(saved.slice(2).map(week => week.days[0].rows[0].name)).toEqual(['w1-0-0', 'w2-0-0', 'w3-0-0'])
  expect(saved[4].days.slice(1).every(day => day.rest && !day.rows.length)).toBe(true)
  expect(saved[4].days[0].dateLabel).toBe('11/16')
  await blockKey('z',{metaKey:true})
  expect(host.querySelectorAll('[data-week-slot]')).toHaveLength(4)
  await act(async () => vi.advanceTimersByTimeAsync(2000))
  expect(onSave).toHaveBeenCalledTimes(2)
  expect(onSave.mock.calls.at(-1)![0]).toHaveLength(4)
  expect(onSave.mock.calls.at(-1)![0][2].days[0].rows[0].name).toBe('w3-0-0')
  const persisted = (await onSave.mock.results.at(-1)!.value).weeks
  act(() => root.render(<PlanEditor key="refreshed" initialWeeks={persisted} weeksCount={4}
    planStartDate="2026-10-19" studentName="学员" planName="计划" onSave={onSave} />))
  expect(host.querySelectorAll('[data-week-slot]')).toHaveLength(4)
  expect(blockCell(host, 3, 0).textContent).toContain('w3-0-0')
  vi.useRealTimers()
})

it('batch-clears selected days in one undo record and preserves all logged rows', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  const weeks = blockWeeks([[0,2]])
  weeks[0].days[0].rows.push(blockRow('locked', { hasLogs: true }))
  act(() => root.render(<PlanEditor initialWeeks={weeks} weeksCount={1} studentName="学员" planName="计划" />))
  select(1,0); select(1,1,{metaKey:true}); await blockKey('Delete')
  expect([...host.querySelectorAll<HTMLElement>('[data-rowid]')].map(row => row.dataset.rowid)).toEqual(['locked'])
  await blockKey('z',{metaKey:true})
  expect(host.querySelectorAll('[data-rowid]')).toHaveLength(3)
})

it('shows extension on a published plan with history, preserving locked days and writing only on Update plan', async () => {
  vi.useFakeTimers()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  const weeks = blockWeeks([[0],[0],[0],[0]])
  weeks[0].days[0].rows[0].hasLogs = true
  weeks[0].days[0].serverDayId = 'logged-day'
  weeks[0].days[0].shiftedToDate = '2026-10-20'
  const onSave = vi.fn(async (saved: Week[]) => ({ weeks: structuredClone(saved), changedDays: 3, degradedRows: 0, skippedRows: 0,
    planWeeks: 5, planStartDate: '2026-10-19', planEndDate: '2026-11-22' }))
  act(() => root.render(<PlanEditor initialWeeks={weeks} weeksCount={4} initialPublished planStatus="published"
    planStartDate="2026-10-19" studentName="学员" planName="计划" onSave={onSave} />))
  await act(async () => vi.advanceTimersByTimeAsync(2000))
  expect(onSave).not.toHaveBeenCalled()
  select(1,0); select(2,0,{metaKey:true}); select(3,0,{metaKey:true}); await blockKey('c',{metaKey:true})
  select(3,0); await blockKey('v',{metaKey:true})
  expect(host.querySelector('[data-testid="plan-save-status"]')?.textContent).toContain('计划已延长到 5 周')
  await act(async () => vi.advanceTimersByTimeAsync(2000))
  expect(onSave).not.toHaveBeenCalled()
  await blockKey('z',{metaKey:true})
  expect(host.querySelectorAll('[data-week-slot]')).toHaveLength(4)
  expect(onSave).not.toHaveBeenCalled()
  await blockKey('z',{metaKey:true, shiftKey:true})
  expect(host.querySelectorAll('[data-week-slot]')).toHaveLength(5)
  const update = [...host.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.includes('更新计划'))!
  await act(async () => update.click())
  expect(onSave).toHaveBeenCalledOnce()
  expect(onSave.mock.calls[0][0]).toHaveLength(5)
  expect(onSave.mock.calls[0][0][0]).toEqual(weeks[0])
  expect(host.querySelector('[data-testid="plan-save-status"]')?.textContent).not.toContain('未推送修改')
  await blockKey('z',{metaKey:true})
  expect(host.querySelectorAll('[data-week-slot]')).toHaveLength(5)
  expect(host.querySelector('[data-week-slot][data-wnum="5"]')?.textContent).not.toContain('w3-0-0')
  await act(async () => vi.advanceTimersByTimeAsync(2000))
  expect(onSave).toHaveBeenCalledOnce()
  await act(async () => update.click())
  expect(onSave).toHaveBeenCalledTimes(2)
  const undone = onSave.mock.calls[1][0]
  expect(undone).toHaveLength(5)
  expect(undone.slice(0, 4).map(week => week.days[0].rows[0].name)).toEqual(['w1-0-0', 'w2-0-0', 'w3-0-0', 'w4-0-0'])
  expect(undone[4].days.every(day => day.rest && !day.rows.length)).toBe(true)
  expect(host.querySelector('[data-testid="plan-save-status"]')?.textContent).not.toContain('未推送修改')
  const persisted = (await onSave.mock.results[1].value).weeks
  act(() => root.render(<PlanEditor key="refreshed" initialWeeks={persisted} weeksCount={5} initialPublished planStatus="published"
    planStartDate="2026-10-19" studentName="学员" planName="计划" onSave={onSave} />))
  expect(host.querySelectorAll('[data-week-slot]')).toHaveLength(5)
  expect(host.querySelector('[data-week-slot][data-wnum="5"]')?.textContent).not.toContain('w3-0-0')
  expect(blockCell(host, 3, 0).textContent).toContain('w3-0-0')
})

it('fully undoes a published extension when the update was rejected before persistence', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  vi.spyOn(window, 'alert').mockImplementation(() => {})
  const onSave = vi.fn(async (saved: Week[]) => { throw new ReconcileConflict('PLAN_HISTORY_IMMUTABLE', structuredClone(saved)) })
  act(() => root.render(<PlanEditor initialWeeks={blockWeeks([[0],[0]])} weeksCount={2} initialPublished planStatus="published"
    planStartDate="2026-10-19" studentName="学员" planName="计划" onSave={onSave} />))
  select(1,0); select(2,0,{metaKey:true}); await blockKey('c',{metaKey:true})
  select(2,0); await blockKey('v',{metaKey:true})
  const update = [...host.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.includes('更新计划'))!
  await act(async () => update.click())
  expect(onSave).toHaveBeenCalledOnce()
  await blockKey('z',{metaKey:true})
  expect(host.querySelectorAll('[data-week-slot]')).toHaveLength(2)
})

it('shows extension and clipping together at 52 weeks on published plans, including subsequent pastes at the cap', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  act(() => root.render(<PlanEditor initialWeeks={blockWeeks(Array.from({ length: 51 }, () => [0]))}
    weeksCount={51} initialPublished planStartDate="2026-10-19" studentName="学员" planName="计划" />))
  select(1,0); select(2,0,{metaKey:true}); select(3,0,{metaKey:true}); await blockKey('c',{metaKey:true})
  select(51,0); await blockKey('v',{metaKey:true})
  expect(host.querySelectorAll('[data-week-slot]')).toHaveLength(52)
  expect(host.querySelector('[data-testid="plan-save-status"]')?.textContent)
    .toContain('计划已延长到 52 周，1 天超出上限已跳过')
  select(52,0); await blockKey('v',{metaKey:true})
  expect(host.querySelectorAll('[data-week-slot]')).toHaveLength(52)
  expect(host.querySelector('[data-testid="plan-save-status"]')?.textContent).toContain('2 天超出计划范围已跳过')
})

it('does not add weeks when overwrite is cancelled', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(false)
  act(() => root.render(<PlanEditor initialWeeks={blockWeeks([[0],[0]])} weeksCount={2} studentName="学员" planName="计划" />))
  select(1,0); select(2,0,{metaKey:true}); await blockKey('c',{metaKey:true})
  select(2,0); await blockKey('v',{metaKey:true})
  expect(host.querySelectorAll('[data-week-slot]')).toHaveLength(2)
  expect(blockCell(host,2,0).querySelector<HTMLInputElement>('[data-c="name"] input')?.value).toBe('w2-0-0')
})

it.each(['completed', 'paused', 'unbound'] as const)('does not extend a read-only %s target', async (target) => {
  const weeks = blockWeeks([[0],[0]])
  act(() => root.render(<PlanEditor key="source" initialWeeks={weeks} weeksCount={2} studentName="学员" planName="计划" />))
  select(1,0); select(2,0,{metaKey:true}); await blockKey('c',{metaKey:true})
  const onSave = vi.fn()
  act(() => root.render(<PlanEditor key="target" initialWeeks={weeks} weeksCount={2} studentName="学员" planName="计划"
    onSave={onSave} readOnly={target === 'unbound' ? true : undefined} planStatus={target === 'unbound' ? 'published' : target} />))
  select(2,0); await blockKey('v',{metaKey:true}); await blockKey('s',{metaKey:true})
  expect(host.querySelectorAll('[data-week-slot]')).toHaveLength(2)
  expect(onSave).not.toHaveBeenCalled()
})
