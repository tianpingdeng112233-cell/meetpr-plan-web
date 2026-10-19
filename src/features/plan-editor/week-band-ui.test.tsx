import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PlanEditor } from './PlanEditor'
import { blockWeeks, openBlockDay, blockCell, blockKey } from './blockGridTestUtils'
import { readFileSync } from 'node:fs'

let host: HTMLDivElement, root: Root
beforeEach(() => { host = document.createElement('div'); document.body.append(host); root = createRoot(host) })
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks() })

it('keeps edit-row drag handles hidden without hover and transparent even when selected', () => {
  act(() => root.render(<PlanEditor initialWeeks={blockWeeks([[0]], 2)} weeksCount={1} studentName="学员" planName="计划" />))
  const style = document.createElement('style')
  style.textContent = readFileSync('src/index.css', 'utf8') + readFileSync('src/features/plan-editor/components/block-grid.css', 'utf8')
  host.append(style)
  openBlockDay(host)
  const handle = host.querySelector<HTMLElement>('.rowdrag')!
  expect(getComputedStyle(handle).visibility).toBe('hidden')
  act(() => handle.click())
  expect(handle.closest('.exrow')?.classList.contains('row-sel')).toBe(true)
  expect(getComputedStyle(handle).visibility).toBe('hidden')
  expect(getComputedStyle(handle).backgroundColor).toBe('rgba(0, 0, 0, 0)')
  expect(getComputedStyle(handle).color).toBe('rgb(156, 163, 175)')
})

it('renders every imported week vertically with no pagination, virtualization, formula bar or cycle toolbar', () => {
  act(() => root.render(<PlanEditor initialWeeks={blockWeeks(Array.from({ length: 12 }, () => [0, 2, 4, 5]))} weeksCount={12} studentName="学员" planName="导入" />))
  expect(host.querySelectorAll('[data-week-slot]')).toHaveLength(12)
  expect(host.querySelectorAll('[data-block-week]')).toHaveLength(48)
  expect(host.querySelector('.weekband-spacer,.week-tabs,.plan-toolbar,.plan-formula-bar,.selected-context-bar')).toBeNull()
  expect(host.querySelectorAll('input[data-plan-cell]')).toHaveLength(0)
})

it('shows only date-ordered training days and retains stored rest-marked rows', () => {
  const weeks = blockWeeks([[1, 4], [0]])
  weeks[0].days[1].rest = true
  act(() => root.render(<PlanEditor initialWeeks={weeks} weeksCount={2} studentName="学员" planName="计划" planStartDate="2026-10-19" />))
  expect(blockCell(host, 1, 0).dataset.dow).toBe('1')
  expect(blockCell(host, 1, 1).dataset.dow).toBe('4')
  expect(blockCell(host, 1, 0).textContent).toContain('w1-1-0')
  expect(blockCell(host, 2, 1).querySelectorAll('[data-rowid]')).toHaveLength(0)
  expect(host.querySelectorAll('.block-column')).toHaveLength(2)
})

it('keeps eight actions and every note in one expanding edit card, with only title and collapse in its header', async () => {
  act(() => root.render(<PlanEditor initialWeeks={blockWeeks([[0,2,4,5],[0,2,4,5],[0,2,4,5],[0,2,4,5]], 8)} weeksCount={4} studentName="学员" planName="计划" />))
  openBlockDay(host, 2, 4)
  const edit = host.querySelector('.is-editing')!
  expect(edit.querySelectorAll('.exrow')).toHaveLength(8)
  expect(edit.querySelectorAll('input[placeholder="备注"]')).toHaveLength(8)
  expect(edit.querySelectorAll('.block-edit-head > button')).toHaveLength(1)
  expect(edit.querySelector('.block-edit-footer')?.textContent).toContain('⌘C')
  expect(blockCell(host, 1, 2).querySelector('.daygrid')).toBeNull()
  expect(blockCell(host, 3, 2).querySelector('.daygrid')).toBeNull()
  await blockKey('Escape')
  expect(host.querySelector('.daygrid')).toBeNull()
})

it('retains section additions and reorders only the edited day', async () => {
  const source = blockWeeks([[0],[0]], 3)
  const onSave = vi.fn(async (weeks) => ({ weeks, changedDays: 1, degradedRows: 0, skippedRows: 0 }))
  act(() => root.render(<PlanEditor initialWeeks={source} weeksCount={2} studentName="学员" planName="计划" onSave={onSave} />))
  openBlockDay(host, 2)
  expect(host.querySelectorAll('[data-add-tier]')).toHaveLength(2)
  const target = host.querySelector<HTMLElement>('[data-rowid="w2-0-2"]')!
  Object.defineProperty(document, 'elementsFromPoint', { configurable: true, value: () => [target] })
  act(() => {
    host.querySelector('.rowdrag')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))
    window.dispatchEvent(new MouseEvent('mousemove', { clientY: 10 }))
    window.dispatchEvent(new MouseEvent('mouseup', { clientY: 10 }))
  })
  expect([...blockCell(host, 2, 0).querySelectorAll<HTMLElement>('[data-rowid]')].map(el => el.dataset.rowid)).toEqual(['w2-0-1','w2-0-2','w2-0-0'])
  expect([...blockCell(host, 1, 0).querySelectorAll<HTMLElement>('[data-rowid]')].map(el => el.dataset.rowid)).toEqual(['w1-0-0','w1-0-1','w1-0-2'])
  Reflect.deleteProperty(document, 'elementsFromPoint')
})
