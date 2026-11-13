import { act, createRef, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PlanEditor } from './PlanEditor'
import { blockCell, blockWeeks } from './blockGridTestUtils'
import type { EditorFeedbackHandle } from './feedbackSession'
import type { StudentVideo } from '../../api/types'
import { installLocalStorageMock } from '../../test/localStorageMock'

let host: HTMLDivElement, root: Root
const feedbackRef = createRef<EditorFeedbackHandle>()
const weeks = blockWeeks([[0, 2, 4], [0, 2, 4]])
for (const week of weeks) for (const day of week.days) {
  if (day.rows.length) day.serverDayId = `day-${week.num}-${day.dow}`
  for (const row of day.rows) row.serverRowId = `pe-${row.id}`
}
const videos: StudentVideo[] = [0, 2, 4].map(dow => ({ id: `v-${dow}`, plan_exercise_id: `pe-w1-${dow}-0`, set_log_id: null,
  filename: 'squat.mp4', content_type: 'video/mp4', size_bytes: 100, created_at: '2026-10-19T12:00:00Z', logged_at: '2026-10-19T12:00:00Z',
  exercise_name: '深蹲', set_index: 0, weight_kg: '100', reps: 3 }))
beforeEach(() => {
  installLocalStorageMock()
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(url.includes('/uploads/') ? { url: '/video.mp4' } : { logs: [], items: [], markers: [], recent_sessions: [] }), { status: 200 })))
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
})
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers() })
const render = async (props: Partial<ComponentProps<typeof PlanEditor>> = {}) => act(async () => root.render(<PlanEditor
  initialWeeks={weeks} weeksCount={2} studentId="student" studentName="学员" planName="计划" planStartDate="2026-10-19"
  videos={videos} feedbackRef={feedbackRef} {...props} />))
const open = async (id: string) => act(async () => feedbackRef.current!.openFeedbackVideo(id))
const click = async (el: Element) => act(async () => (el as HTMLElement).click())

it('marks the playing day without selecting or opening it for editing, then clears on close', async () => {
  const onSave = vi.fn()
  await render({ onSave })
  await click(host.querySelector('[data-video-marker]')!)
  expect(blockCell(host, 1, 0).classList.contains('video-day-selected')).toBe(true)
  expect(host.querySelector('.block-cell.is-editing')).toBeNull()
  expect(host.querySelector('.block-cell.is-selected')).toBeNull()
  expect(blockCell(host, 1, 0).querySelector('.video-highlight')).not.toBeNull()
  await open('v-4')
  expect(blockCell(host, 1, 0).classList.contains('video-day-selected')).toBe(false)
  expect(blockCell(host, 1, 2).classList.contains('video-day-selected')).toBe(true)
  await click(host.querySelector('.history-player header button')!)
  expect(host.querySelector('.video-day-selected')).toBeNull()
  expect(onSave).not.toHaveBeenCalled()
})

it('aligns the first and last day to the player, preserves manual browsing across hover and rerender, and realigns on reopen', async () => {
  vi.useFakeTimers()
  const rect = (left: number, top: number, width: number, height: number) => ({ left, top, right: left + width, bottom: top + height, width, height, x: left, y: top, toJSON: () => ({}) })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.matches('.scroller')) return rect(200, 100, 1068, 700)
    if (this.matches('.history-player')) return rect(900, 110, 360, 650)
    if (this.matches('.block-cell')) {
      const scroller = this.closest<HTMLElement>('.scroller')!
      const grid = this.closest<HTMLElement>('.block-grid')!
      const leading = parseFloat(grid.style.getPropertyValue('--video-plan-leading')) || 0
      return rect(274 + leading + Number(this.dataset.dx) * 328.6667 - scroller.scrollLeft, 160, 318.6667, 180)
    }
    return rect(0, 0, 0, 0)
  })
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) { return this.matches('.scroller') ? 1068 : 0 })
  await render()
  await open('v-0')
  await act(async () => { vi.advanceTimersByTime(50) })
  expect(blockCell(host, 1, 0).getBoundingClientRect().right).toBeCloseTo(888)
  await open('v-4')
  await act(async () => { vi.advanceTimersByTime(50) })
  expect(blockCell(host, 1, 2).getBoundingClientRect().right).toBeCloseTo(888)
  const scroller = host.querySelector<HTMLElement>('.scroller')!
  act(() => { scroller.dispatchEvent(new WheelEvent('wheel', { deltaX: -200, bubbles: true })); scroller.scrollLeft = 210 })
  await render({ videos: videos.map(v => ({ ...v, viewed_at: '2026-10-20' })) })
  await act(async () => { host.querySelector('[data-feedback-video="v-0"]')?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); vi.advanceTimersByTime(50) })
  expect(scroller.scrollLeft).toBe(210)
  await click(host.querySelector('.feedback-head input[type="checkbox"]')!)
  await act(async () => { vi.advanceTimersByTime(50) })
  expect(scroller.scrollLeft).toBe(210)
  await open('v-4')
  await act(async () => { vi.advanceTimersByTime(50) })
  expect(blockCell(host, 1, 2).getBoundingClientRect().right).toBeCloseTo(888)
  await click(host.querySelector('.history-player header button')!)
  expect(host.querySelector('.block-grid')?.hasAttribute('data-video-plan-scroll')).toBe(false)
  vi.useRealTimers()
})

it('reveals a playing day covered by an expanded editor without losing the edited prescription', async () => {
  await render()
  await click(blockCell(host, 1, 0))
  expect(blockCell(host, 1, 1).style.visibility).toBe('hidden')
  const input = blockCell(host, 1, 0).querySelector<HTMLInputElement>('input[data-guard-field="reps"]')!
  expect(input).not.toBeNull()
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '6')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
    input.blur()
  })
  await open('v-2')
  expect(blockCell(host, 1, 1).style.visibility).not.toBe('hidden')
  expect(blockCell(host, 1, 1).classList.contains('video-day-selected')).toBe(true)
  await click(blockCell(host, 1, 0))
  expect(blockCell(host, 1, 0).querySelector<HTMLInputElement>('input[data-guard-field="reps"]')!.value).toBe('6')
})

it('pans from a collapsed day while video is open without editing, changing video, or selecting rows', async () => {
  await render()
  await open('v-0')
  const scroller = host.querySelector<HTMLElement>('.scroller')!
  scroller.scrollLeft = 300
  const cell = blockCell(host, 1, 1)
  act(() => {
    cell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 500, clientY: 300 }))
    window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 350, clientY: 305 }))
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 350, clientY: 305 }))
    cell.click()
  })
  expect(scroller.scrollLeft).toBe(450)
  expect(host.querySelector('.block-cell.is-editing')).toBeNull()
  expect(host.querySelector('.block-cell.is-selected')).toBeNull()
  expect(blockCell(host, 1, 0).classList.contains('video-day-selected')).toBe(true)
})

it('uses the matched row when a day has no persisted id and never highlights unrelated days', async () => {
  const withoutDayIds = weeks.map(week => ({ ...week, days: week.days.map(day => ({ ...day, serverDayId: undefined })) }))
  await render({ initialWeeks: withoutDayIds })
  await open('v-0')
  expect(host.querySelectorAll('.video-day-selected')).toHaveLength(1)
  expect(blockCell(host, 1, 0).classList.contains('video-day-selected')).toBe(true)
})

it('retains manual by-day browsing when a resize changes the column width', async () => {
  vi.useFakeTimers()
  let viewportWidth = 1400
  const observers = new Set<() => void>()
  vi.stubGlobal('ResizeObserver', class {
    constructor(private callback: () => void) { observers.add(callback) }
    observe() {} disconnect() { observers.delete(this.callback) }
  })
  const rect = (left: number, width: number) => ({ left, right: left + width, top: 160, bottom: 340, width, height: 180, x: left, y: 160, toJSON: () => ({}) })
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) { return this.matches('.scroller') ? viewportWidth : 0 })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.matches('.scroller')) return { ...rect(200, viewportWidth), top: 100, bottom: 800 }
    if (this.matches('.history-player')) return rect(900, 360)
    if (this.matches('.block-cell')) {
      const grid = this.closest<HTMLElement>('.block-grid')!, sc = this.closest<HTMLElement>('.scroller')!
      const width = parseFloat(grid.style.getPropertyValue('--block-column-width')) || 300
      const leading = parseFloat(grid.style.getPropertyValue('--video-plan-leading')) || 0
      return rect(278 + leading + (Number(this.dataset.blockWeek) - 1) * (width + 10) - sc.scrollLeft, width)
    }
    return rect(0, 0)
  })
  await render()
  await click(host.querySelector('[aria-label="按天排"]')!)
  await open('v-0')
  await act(async () => { vi.advanceTimersByTime(50) })
  const scroller = host.querySelector<HTMLElement>('.scroller')!
  act(() => { scroller.dispatchEvent(new WheelEvent('wheel', { deltaX: 400, bubbles: true })); scroller.scrollLeft = 400 })
  viewportWidth = 1300
  await act(async () => { for (const callback of observers) callback(); vi.advanceTimersByTime(50) })
  await act(async () => { vi.advanceTimersByTime(50) })
  expect(scroller.scrollLeft).toBeGreaterThan(300)
})
