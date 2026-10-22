import { act, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PlanEditor } from './PlanEditor'
import { blockWeeks, blockCell, blockKey } from './blockGridTestUtils'
import { installLocalStorageMock } from '../../test/localStorageMock'
import { setLocale } from '../../i18n/locale'

vi.mock('../../api/coach', () => ({ getStudentSetLogs: vi.fn().mockResolvedValue([]), getExerciseStats: vi.fn().mockResolvedValue({ recent_sessions: [] }) }))
let host: HTMLDivElement, root: Root, storage: Storage
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 22, 12))
  storage = installLocalStorageMock()
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove(); delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView; vi.restoreAllMocks(); vi.useRealTimers(); setLocale(undefined) })
const click = (el: Element) => act(() => { el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); (el as HTMLElement).click() })
const toggle = (label = '按天排') => {
  const button = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  expect(button).not.toBeNull()
  click(button!)
}
const render = (props: Partial<ComponentProps<typeof PlanEditor>> = {}, key = 'one') => act(() => root.render(
  <PlanEditor key={key} initialWeeks={blockWeeks(Array.from({ length: 4 }, () => [0,2,4,5]))} weeksCount={4}
    studentName="学员" planName="Block" planStartDate="2026-10-19" {...props} />,
))

it('defaults to by-week and remembers by-day across refresh, plans and students without saving', async () => {
  const onSave = vi.fn()
  render({ onSave })
  expect(host.querySelector('.block-grid')?.getAttribute('data-layout')).toBe('by-week')
  toggle()
  expect(host.querySelector('.block-grid')?.getAttribute('data-layout')).toBe('by-day')
  expect(host.querySelector('[aria-label="按天排"]')?.getAttribute('aria-pressed')).toBe('true')
  expect(host.querySelector('[aria-label="按周排"]')?.getAttribute('title')).toBe('按周排')
  render({ onSave }, 'refresh')
  expect(host.querySelector('.block-grid')?.getAttribute('data-layout')).toBe('by-day')
  render({ onSave, currentPlanId: 'other-plan', studentId: 'other-student' }, 'other')
  expect(host.querySelector('.block-grid')?.getAttribute('data-layout')).toBe('by-day')
  toggle('按周排')
  expect(host.querySelector('.block-grid')?.getAttribute('data-layout')).toBe('by-week')
  expect(onSave).not.toHaveBeenCalled()
})

it.each([1,2,3,4])('places W%s editing to the right, keeps the previous week, and restores width on Escape', async week => {
  render()
  toggle()
  expect([...host.querySelectorAll('.block-column > button')].map(el => el.textContent)).toEqual(['周一','周三','周五','周六'])
  const headers = [...host.querySelectorAll<HTMLElement>('.block-week-label')]
  expect(headers.map(el => el.style.gridColumn)).toEqual(['2','3','4','5'])
  expect(headers[0].textContent).toContain('W1')
  expect(headers[0].textContent).toContain('10/19')
  expect(headers[0].querySelector('mark')?.textContent).toBe('本周')
  expect(headers[0].querySelector('.block-capacity')).not.toBeNull()
  const grid = host.querySelector<HTMLElement>('.block-grid')!
  const baseColumns = grid.style.getPropertyValue('--block-columns')
  const cell = blockCell(host, week, 0)
  expect(cell.style.gridColumn).toBe(String(week + 1))
  expect(cell.style.gridRow).toBe('2')
  const scroll = vi.fn()
  Object.defineProperty(cell, 'scrollIntoView', { configurable: true, value: scroll })
  click(cell)
  expect(cell.style.gridColumn).toBe(`${week + 1} / ${week + 4}`)
  expect(grid.style.getPropertyValue('--block-columns')).toBe(String(Math.max(4, week + 2)))
  if (week > 1) expect(blockCell(host, week - 1, 0).style.visibility).not.toBe('hidden')
  if (week < 4) expect(blockCell(host, week + 1, 0).style.visibility).toBe('hidden')
  expect(blockCell(host, week, 1).style.visibility).not.toBe('hidden')
  expect(scroll).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' })
  await blockKey('Escape')
  expect(grid.style.getPropertyValue('--block-columns')).toBe(baseColumns)
})

it('inserts between vertical neighbours, adds a single-week row, and deletes it with undo', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
  render()
  toggle()
  const gap = host.querySelector<HTMLElement>('[data-insert-week="2"][data-insert-before="2"]')!
  expect(gap.style.gridColumn).toBe('3')
  expect(gap.style.gridRow).toBe('4')
  click(gap.querySelector('button')!)
  expect(host.querySelector('.block-insert-menu')?.textContent).toContain('只改这一周')
  click(host.querySelector('[data-insert-date="2026-10-29"]')!)
  expect([...host.querySelectorAll('.block-column > button')].map(el => el.textContent)).toEqual(['周一','周三','周四','周五','周六'])
  expect(blockCell(host, 2, 2).textContent).toContain('D3 · 10/29')
  expect(blockCell(host, 2, 2).classList.contains('is-selected')).toBe(true)
  expect(blockCell(host, 2, 2).classList.contains('is-editing')).toBe(false)
  for (const week of [1,3,4]) {
    expect(blockCell(host, week, 2).classList.contains('is-blank')).toBe(true)
    expect(blockCell(host, week, 2).querySelector('.block-empty')).toBeNull()
  }
  await blockKey('Delete')
  expect(confirm).toHaveBeenCalled()
  expect(host.querySelectorAll('.block-column')).toHaveLength(4)
  await blockKey('z', { metaKey: true })
  expect(blockCell(host, 2, 2).textContent).toContain('D3 · 10/29')
})

it('drags right to fill W2–W3 with preview, confirmation, locked rows and one-step undo', async () => {
  const weeks = blockWeeks(Array.from({ length: 4 }, () => [0,2,4,5]))
  weeks[2].days[0].rows[0].hasLogs = true
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
  render({ initialWeeks: weeks })
  toggle()
  click(blockCell(host, 1, 0))
  act(() => blockCell(host, 1, 0).querySelector('.block-fill-handle')!.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true, clientX: 200, clientY: 100 })))
  expect(host.querySelector('.block-cell.is-editing')).toBeNull()
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => blockCell(host, 3, 0) })
  act(() => window.dispatchEvent(new MouseEvent('mousemove', { clientX: 700, clientY: 100 })))
  expect(host.querySelectorAll('.fill-preview')).toHaveLength(2)
  expect(blockCell(host, 2, 0).querySelector('.block-fill-ghost')?.textContent).toContain('w1-0-0')
  act(() => window.dispatchEvent(new MouseEvent('mouseup', { clientX: 700, clientY: 100 })))
  expect(confirm).toHaveBeenCalledTimes(1)
  expect(blockCell(host, 2, 0).textContent).toContain('w1-0-0')
  expect(blockCell(host, 3, 0).textContent).toContain('w3-0-0')
  expect(blockCell(host, 3, 0).textContent).toContain('w1-0-0')
  expect(blockCell(host, 4, 0).textContent).toContain('w4-0-0')
  await blockKey('z', { metaKey: true })
  expect(blockCell(host, 2, 0).textContent).toContain('w2-0-0')
  expect(blockCell(host, 3, 0).textContent).not.toContain('w1-0-0')
})

it('preserves an in-progress sets input and published pending status when switching, without requests', async () => {
  const onSave = vi.fn()
  const fetch = vi.spyOn(window, 'fetch')
  render({ initialPublished: true, onSave })
  expect(host.textContent).not.toContain('有未推送修改')
  toggle()
  await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
  expect(onSave).not.toHaveBeenCalled()
  expect(host.textContent).not.toContain('有未推送修改')
  click(blockCell(host, 2, 0))
  const note = blockCell(host, 2, 0).querySelector<HTMLInputElement>('[data-c="note"] input')!
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(note, '保留输入')
    note.dispatchEvent(new Event('input', { bubbles: true }))
  })
  expect(host.textContent).toContain('有未推送修改')
  const sets = blockCell(host, 2, 0).querySelector<HTMLInputElement>('[data-c="sets"] input')!
  act(() => {
    sets.focus()
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(sets, '')
    sets.dispatchEvent(new Event('input', { bubbles: true }))
  })
  toggle('按周排')
  expect(blockCell(host, 2, 0).querySelector<HTMLInputElement>('[data-c="sets"] input')?.value).toBe('')
  expect(blockCell(host, 2, 0).querySelector<HTMLInputElement>('[data-c="note"] input')?.value).toBe('保留输入')
  expect(host.textContent).toContain('有未推送修改')
  toggle()
  await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
  expect(onSave).not.toHaveBeenCalled()
  expect(fetch).not.toHaveBeenCalled()
})

it.each(['getItem', 'setItem'] as const)('handles unavailable storage (%s) without breaking layout or the default', method => {
  vi.spyOn(storage, method).mockImplementation(() => { throw new Error('blocked storage') })
  render()
  expect(host.querySelector('.block-grid')?.getAttribute('data-layout')).toBe('by-week')
  toggle()
  expect(host.querySelector('.block-grid')?.getAttribute('data-layout')).toBe('by-day')
  render({}, 'refresh')
  expect(host.querySelector('.block-grid')?.getAttribute('data-layout')).toBe('by-week')
})

it('changes the weekday pattern from its row header while preserving logged days', () => {
  const weeks = blockWeeks(Array.from({ length: 4 }, () => [0,2,4,5]))
  weeks[0].days[2].rows[0].hasLogs = true
  render({ initialWeeks: weeks })
  toggle()
  click(host.querySelectorAll('.block-column button')[1])
  const select = host.querySelector<HTMLSelectElement>('[aria-label="修改 Dx 星期"]')!
  act(() => { select.value = '3'; select.dispatchEvent(new Event('change', { bubbles: true })) })
  expect(host.querySelectorAll('.block-column button')[1].textContent).toBe('周四')
  expect(blockCell(host, 1, 1).dataset.dow).toBe('2')
  expect(blockCell(host, 2, 1).dataset.dow).toBe('3')
  expect(blockCell(host, 4, 1).dataset.dow).toBe('3')
})

it.each(['start', '5'])('offers the vertical %s gap only for available dates in that week', boundary => {
  render({ initialWeeks: blockWeeks(Array.from({ length: 4 }, () => [2,4,5])) })
  toggle()
  const gap = host.querySelector<HTMLElement>(`[data-insert-week="2"][data-insert-before="${boundary}"]`)!
  expect(gap.style.gridColumn).toBe('3')
  expect(gap.style.gridRow).toBe(boundary === 'start' ? '2' : '4')
  click(gap.querySelector('button')!)
  const dates = [...host.querySelectorAll<HTMLElement>('[data-insert-date]')].map(el => el.dataset.insertDate)
  expect(dates).toEqual(boundary === 'start' ? ['2026-10-26', '2026-10-27'] : ['2026-11-01'])
  click(host.querySelector('[data-insert-date]')!)
  expect(host.querySelectorAll('.block-cell.is-editing')).toHaveLength(0)
  expect(host.querySelectorAll('.block-cell.is-selected')).toHaveLength(1)
})

it('uses English labels and keeps six weeks horizontally accessible', () => {
  setLocale('en')
  render({ initialWeeks: blockWeeks(Array.from({ length: 6 }, () => [0,2,4,5])), weeksCount: 6 })
  toggle('By day')
  expect(host.querySelector('[aria-label="By week"]')?.getAttribute('title')).toBe('By week')
  expect(host.querySelector<HTMLElement>('.block-grid')?.style.getPropertyValue('--block-columns')).toBe('6')
  expect(blockCell(host, 6, 0).style.gridColumn).toBe('7')
  click(blockCell(host, 1, 0))
  expect(host.querySelector('.block-fill-handle')?.getAttribute('title')).toBe('Drag to copy to later weeks')
})

it('shows the week date range with its capacity summary only in by-day headers', () => {
  render()
  expect(host.querySelector('.block-capacity-range')).toBeNull()
  toggle()
  expect(host.querySelector('.block-capacity-range')?.textContent).toBe('10/19–10/25 · ')
  expect(host.querySelector('.block-capacity')?.textContent).toContain('主项 4 组')
})

it('scrolls to a rendered week header when navigating a six-week by-day plan', async () => {
  render({ initialWeeks: blockWeeks(Array.from({ length: 6 }, () => [0,2,4,5])), weeksCount: 6 })
  toggle()
  const scroll = vi.fn()
  const header = host.querySelector<HTMLElement>('[data-wnum="2"] .block-week-label')!
  Object.defineProperty(header, 'scrollIntoView', { configurable: true, value: scroll })
  await blockKey('ArrowRight', { altKey: true })
  await act(async () => { await vi.advanceTimersByTimeAsync(100) })
  expect(scroll).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
})

it('reveals the previous week when moving left to an editor already inside the horizontal viewport', () => {
  render({ initialWeeks: blockWeeks(Array.from({ length: 6 }, () => [0,2,4,5])), weeksCount: 6 })
  const scroller = host.querySelector<HTMLElement>('.scroller')!
  Object.defineProperty(scroller, 'clientWidth', { configurable: true, value: 1140 })
  scroller.getBoundingClientRect = () => ({ left: 0, right: 1140, width: 1140 } as DOMRect)
  toggle()
  click(blockCell(host, 4, 0))
  scroller.scrollLeft = 512
  blockCell(host, 2, 0).getBoundingClientRect = () => ({ left: -170, right: 84, width: 254 } as DOMRect)
  click(blockCell(host, 3, 0))
  expect(scroller.scrollLeft).toBe(264)
})

it.each(['row', 'empty day'])('keeps horizontal alignment when jumping to an issue (%s)', async kind => {
  const weeks = blockWeeks(Array.from({ length: 6 }, () => [0,2,4,5]))
  if (kind === 'row') { weeks[2].days[0].rows[0].exerciseId = null; weeks[2].days[0].rows[0].ku = false }
  else weeks[2].days[0].rows = []
  render({ initialWeeks: weeks, weeksCount: 6 })
  toggle()
  const scroll = vi.fn()
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scroll })
  const chip = [...host.querySelectorAll('button')].find(el => el.textContent?.includes('处待核对'))!
  click(chip)
  await act(async () => { await vi.advanceTimersByTimeAsync(100) })
  expect(scroll).toHaveBeenCalledWith({ block: 'center', inline: 'nearest' })
  expect(scroll).not.toHaveBeenCalledWith({ block: 'center', inline: 'center' })
  delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView
})
