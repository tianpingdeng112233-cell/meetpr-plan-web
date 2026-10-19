import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PlanEditor } from './PlanEditor'
import { blockWeeks, blockCell, openBlockDay, blockKey } from './blockGridTestUtils'
let host: HTMLDivElement, root: Root
beforeEach(() => { host = document.createElement('div'); document.body.append(host); root = createRoot(host) })
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks() })

it('changes one cell date only and supports undo', async () => {
  act(() => root.render(<PlanEditor initialWeeks={blockWeeks([[0,2],[0,2]])} weeksCount={2} studentName="学员" planName="计划" planStartDate="2026-10-19" />))
  openBlockDay(host, 1, 2)
  act(() => host.querySelector<HTMLButtonElement>('[aria-label="修改本日日期"]')!.click())
  const date = host.querySelector<HTMLInputElement>('input[type="date"]')!
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(date, '2026-10-22')
    date.dispatchEvent(new Event('change', { bubbles: true }))
    date.dispatchEvent(new Event('input', { bubbles: true }))
  })
  expect(blockCell(host, 1, 1).dataset.dow).toBe('3')
  expect(blockCell(host, 2, 1).dataset.dow).toBe('2')
  await blockKey('z', { metaKey: true })
  expect(blockCell(host, 1, 1).dataset.dow).toBe('2')
})

it('changes a Dx weekday on unlogged days and retains logged dates', () => {
  const weeks = blockWeeks([[0,2],[0,2],[0,2]])
  weeks[1].days[2].rows[0].hasLogs = true
  act(() => root.render(<PlanEditor initialWeeks={weeks} weeksCount={3} studentName="学员" planName="计划" planStartDate="2026-10-19" />))
  act(() => host.querySelectorAll<HTMLButtonElement>('.block-column button')[1].click())
  const select = host.querySelector<HTMLSelectElement>('[aria-label="修改 Dx 星期"]')!
  act(() => { select.value = '3'; select.dispatchEvent(new Event('change', { bubbles: true })) })
  expect([1,2,3].map(w => blockCell(host, w, 1).dataset.dow)).toEqual(['3','2','3'])
  openBlockDay(host, 2, 2)
  expect(host.querySelector<HTMLInputElement>('[aria-label="修改本日日期"]')?.disabled).toBe(true)
})

it('preserves shifted dates and their explanation on scan and edit views', () => {
  const weeks = blockWeeks([[0]])
  weeks[0].days[0] = { ...weeks[0].days[0], dateLabel: '10/22', dowLabel: '周四', shiftedToDate: '2026-10-22', shiftBadge: { originalDate: '2026-10-19', days: 3 } }
  act(() => root.render(<PlanEditor initialWeeks={weeks} weeksCount={1} studentName="学员" planName="计划" planStartDate="2026-10-19" />))
  expect(blockCell(host, 1, 0).textContent).toContain('10/22已后移')
  openBlockDay(host)
  expect(host.querySelector('[data-shift-badge]')?.getAttribute('title')).toBe('原定 10/19 · 已后移 3 天')
})
