import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PlanEditor } from './PlanEditor'
import { blockWeeks, blockRow, blockCell, blockKey } from './blockGridTestUtils'
let host: HTMLDivElement, root: Root
beforeEach(() => { host = document.createElement('div'); document.body.append(host); root = createRoot(host) })
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks() })
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

it('reports clipping at the end of the block and never adds extra weeks', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  act(() => root.render(<PlanEditor initialWeeks={blockWeeks([[0],[0]])} weeksCount={2} studentName="学员" planName="计划" />))
  select(1,0); select(2,0,{metaKey:true}); await blockKey('c',{metaKey:true})
  select(2,0); await blockKey('v',{metaKey:true})
  expect(host.querySelectorAll('[data-week-slot]')).toHaveLength(2)
  expect(host.querySelector('[data-testid="plan-save-status"]')?.textContent).toContain('跳过')
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
