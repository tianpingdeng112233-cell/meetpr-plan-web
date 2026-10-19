import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PlanEditor } from './PlanEditor'
import { relabelWeeksForStartDate } from './mapping'
import { readFileSync } from 'node:fs'
import { setLocale } from '../../i18n/locale'
import type { StudentSetLog } from '../../api/types'
import type { ExerciseRow, Week } from './types'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
function fixture(count = 4): Week[] {
  return relabelWeeksForStartDate(Array.from({ length: count }, (_, index) => ({
    num: index + 1, num2: String(index + 1).padStart(2, '0'), range: '', isCurrent: false, vol: '',
    days: Array.from({ length: 7 }, (_, dow) => ({ dow, dowLabel: '', dateLabel: '', rest: ![0,2,4,5].includes(dow),
      rows: [0,2,4,5].includes(dow) ? Array.from({ length: 4 }, (_, r): ExerciseRow => ({
        id: `w${index + 1}-${dow}-${r}`, serverRowId: null, serverSortOrder: null, hasLogs: false, conflictMessage: null,
        exerciseId: 'sq', name: `动作${r + 1}`, ku: true, custom: false, isMain: r < 2, aux: false,
        reps: '3', mode: 'kg', boxes: [{ val: '120', empty: false }], note: '',
      })) : [] })),
  })), '2026-10-19')
}
const api = vi.hoisted(() => ({ logs: vi.fn().mockResolvedValue([]) }))
vi.mock('../../api/coach', () => ({ getStudentSetLogs: api.logs, getExerciseStats: vi.fn().mockResolvedValue({ recent_sessions: [] }) }))
let host: HTMLDivElement, root: Root
beforeEach(() => { api.logs.mockResolvedValue([]); host = document.createElement('div'); document.body.append(host); root = createRoot(host) })
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); setLocale(undefined) })
const cell = (w: number, dx: number) => host.querySelector<HTMLElement>(`[data-block-week="${w}"][data-dx="${dx}"]`)!
const click = (el: Element, init = {}) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, ...init })) })
const key = async (key: string, metaKey = false) => act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key, metaKey, bubbles: true, cancelable: true })); await Promise.resolve() })

it('renders a 4×4 block and opens only W2D1, with notes on every row and lossless Escape', async () => {
  const onSave = vi.fn()
  act(() => root.render(<PlanEditor initialWeeks={fixture()} weeksCount={4} studentName="学员" planName="Block" planStartDate="2026-10-19" onSave={onSave} />))
  expect(host.querySelectorAll('[data-block-week]')).toHaveLength(16)
  expect(host.querySelectorAll('.block-column')).toHaveLength(4)
  expect(host.querySelector('.plan-toolbar,.week-tabs,.selected-context-bar,.formula-bar')).toBeNull()
  expect(host.querySelector('.daygrid')).toBeNull()
  click(cell(2, 0))
  expect(host.querySelectorAll('.daygrid')).toHaveLength(1)
  expect(cell(2, 0).querySelectorAll('input[placeholder="备注"]')).toHaveLength(4)
  const note = cell(2, 0).querySelector<HTMLInputElement>('input[placeholder="备注"]')!
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(note, '保留输入')
    note.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await key('Escape')
  expect(host.querySelector('.daygrid')).toBeNull()
  click(cell(2, 0))
  expect(cell(2, 0).querySelector<HTMLInputElement>('input[placeholder="备注"]')?.value).toBe('保留输入')
  expect(onSave).not.toHaveBeenCalled()
})


it.each(['12-week import', 'published with logs', 'student-added', 'shifted', 'uneven weeks', 'irregular weekdays'])(
  'opens legacy %s without changing any prescription or date and without saving', async kind => {
    vi.useFakeTimers()
    const weeks = fixture(kind === '12-week import' ? 12 : 4)
    if (kind === 'uneven weeks') weeks[1].days[4].rows = []
    if (kind === 'irregular weekdays') {
      weeks[1].days[1].rows = weeks[1].days[0].rows
      weeks[1].days[0].rows = []
    }
    const first = weeks[0].days[0]
    if (kind === 'shifted') Object.assign(first, { shiftedToDate: '2026-10-21', shiftBadge: { originalDate: '2026-10-19', days: 2 }, dateLabel: '10/21', dowLabel: '周三' })
    const log: StudentSetLog = {
      id: 'log', student_id: 'student', plan_exercise_id: 'server-row', exercise_id: 'sq', set_index: 0,
      weight_kg: '122.50', reps: 3, rpe: '8', coach_rpe: null, completed: true, failed: false,
      assumed: false, adhoc: false, logged_date: '2026-10-19', logged_at: '2026-10-19T12:00:00Z',
    } as StudentSetLog
    if (kind === 'published with logs') { first.rows[0].hasLogs = true; first.rows[0].serverRowId = 'server-row'; api.logs.mockResolvedValue([log]) }
    if (kind === 'student-added') { first.serverDayId = 'server-day'; api.logs.mockResolvedValue([{ ...log, adhoc: true, plan_exercise_id: null, plan_day_id: 'server-day', exercise_id: 'curl' }]) }
    vi.setSystemTime(new Date(2026, 9, 20, 12))
    const before = JSON.stringify(weeks)
    const onSave = vi.fn()
    await act(async () => root.render(<PlanEditor initialWeeks={weeks} weeksCount={weeks.length} studentId="student" studentName="学员" planName="存量" planStartDate="2026-10-19" onSave={onSave} initialPublished={kind === 'published with logs'} />))
    expect(host.querySelectorAll('[data-rowid]')).toHaveLength(weeks.reduce((sum,w) => sum + w.days.reduce((n,d) => n+d.rows.length,0),0))
    for (const week of weeks) for (const day of week.days.filter(day => day.rows.length)) {
      const target = host.querySelector<HTMLElement>(`[data-block-week="${week.num}"][data-dow="${day.dow}"]`)!
      click(target)
      expect(target.querySelector('[data-day-calendar-label]')?.textContent).toContain(day.dateLabel)
      for (const row of day.rows) {
        const el = target.querySelector(`[data-rowid="${row.id}"]`)!
        expect(el.querySelector<HTMLInputElement>('[data-c="name"] input')?.value).toBe(row.name)
        expect(el.querySelector<HTMLInputElement>('[data-c="sets"] input')?.value).toBe(String(row.boxes.length))
        expect(el.querySelector<HTMLInputElement>('[data-c="reps"] input')?.value).toBe(row.reps)
        expect(el.querySelector<HTMLInputElement>('[data-guard-field="weight"]')?.value).toBe(row.boxes[0].val)
        expect(el.querySelector<HTMLInputElement>('[data-c="note"] input')?.value).toBe(row.note)
      }
      if (day === first && kind === 'published with logs') expect(target.querySelector('[data-actuals="weight"]')?.textContent).toContain('122.5×3')
      if (day === first && kind === 'student-added') expect(target.querySelector('[data-student-added="curl"]')?.textContent).toContain('122.5×3')
    }
    await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
    expect(onSave).not.toHaveBeenCalled()
    expect(JSON.stringify(weeks)).toBe(before)
    vi.useRealTimers()
  },
)

it('fills W1D1 through W4 with confirmation and one-step undo', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
  act(() => root.render(<PlanEditor initialWeeks={fixture()} weeksCount={4} studentName="学员" planName="计划" />))
  click(cell(1,0))
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => cell(4,0) })
  act(() => {
    cell(1,0).querySelector('.block-fill-handle')!.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }))
    window.dispatchEvent(new MouseEvent('mousemove', { clientY: 600 }))
  })
  expect(host.querySelectorAll('.fill-preview')).toHaveLength(3)
  act(() => window.dispatchEvent(new MouseEvent('mouseup', { clientY: 600 })))
  expect(confirm).toHaveBeenCalledTimes(1)
  expect([...cell(4,0).querySelectorAll<HTMLElement>('[data-rowid]')].every(row => !row.dataset.rowid!.startsWith('w4'))).toBe(true)
  await key('z',true)
  expect(cell(4,0).querySelector('[data-rowid="w4-0-0"]')).not.toBeNull()
  Reflect.deleteProperty(document, 'elementFromPoint')
})

it('box-selects two bricks then appends them to another day with one undo', async () => {
  act(() => root.render(<PlanEditor initialWeeks={fixture()} weeksCount={4} studentName="学员" planName="计划" />))
  const source = cell(1,2)
  source.getBoundingClientRect = () => ({ left: 0, top: 0, right: 200, bottom: 150, width: 200, height: 150 } as DOMRect)
  source.querySelectorAll('[data-rowid]').forEach((row,index) => {
    row.getBoundingClientRect = () => ({ left: 10, right: 190, top: 20+index*30, bottom: 44+index*30, width: 180, height:24 } as DOMRect)
  })
  act(() => {
    source.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: 2, clientY: 15, bubbles: true }))
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 195, clientY: 76 }))
  })
  expect(source.querySelectorAll('.row-sel')).toHaveLength(2)
  await act(async () => { window.dispatchEvent(new MouseEvent('mouseup')); await new Promise(resolve => setTimeout(resolve,1)) })
  await key('c',true)
  click(cell(2,2)); await key('v',true)
  expect(cell(2,2).querySelectorAll('.exrow')).toHaveLength(6)
  expect([...cell(2,2).querySelectorAll<HTMLInputElement>('[data-c="name"] input')].map(input=>input.value)).toEqual(['动作1','动作2','动作1','动作2','动作3','动作4'])
  await key('z',true)
  expect(cell(2,2).querySelectorAll('.exrow')).toHaveLength(4)
})

it('retains every Dx slot after clearing a draft and allows rebuilding its final day', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  act(() => root.render(<PlanEditor initialWeeks={fixture()} weeksCount={4} studentName="学员" planName="计划" planStartDate="2026-10-19" />))
  click(cell(1,0)); click(cell(4,3), { shiftKey: true }); await key('Delete')
  expect(host.querySelectorAll('.block-column')).toHaveLength(4)
  click(cell(4,3))
  click(cell(4,3).querySelector('[data-add-tier="main"]')!)
  // Dx is the date-ordered training ordinal; the new Saturday is now this week's D1.
  expect(host.querySelector('[data-block-week="4"][data-dow="5"] .exrow')).not.toBeNull()
})

it('keeps an explicitly changed column weekday even when most weeks are logged', () => {
  const weeks = fixture()
  for (const w of weeks.slice(0,3)) w.days[2].rows.forEach(row => { row.hasLogs = true })
  act(() => root.render(<PlanEditor initialWeeks={weeks} weeksCount={4} studentName="学员" planName="计划" planStartDate="2026-10-19" />))
  click(host.querySelectorAll('.block-column button')[1])
  const select = host.querySelector<HTMLSelectElement>('[aria-label="修改 Dx 星期"]')!
  act(() => { select.value = '3'; select.dispatchEvent(new Event('change',{bubbles:true})) })
  expect(host.querySelectorAll('.block-column button')[1].textContent).toContain('周四')
  expect(cell(1,1).dataset.dow).toBe('2')
  expect(cell(4,1).dataset.dow).toBe('3')
})

it('box-selects edit-card bricks across covered columns without selecting hidden days', () => {
  act(() => root.render(<PlanEditor initialWeeks={fixture()} weeksCount={4} studentName="学员" planName="计划" />))
  click(cell(2,0))
  const edit = cell(2,0)
  const rect = { left: 0, top: 0, right: 800, bottom: 300, width: 800, height:300 } as DOMRect
  edit.getBoundingClientRect = () => rect
  for (const dx of [1,2,3]) cell(2,dx).getBoundingClientRect = () => ({ ...rect, left: dx*200 })
  edit.querySelectorAll('[data-rowid]').forEach((row,index) => {
    row.getBoundingClientRect = () => ({ left: 10, right: 790, top: 40+index*40, bottom: 78+index*40, width:780,height:38 } as DOMRect)
  })
  act(() => {
    edit.dispatchEvent(new MouseEvent('mousedown', { button:0, clientX:2, clientY:35, bubbles:true }))
    window.dispatchEvent(new MouseEvent('mousemove',{clientX:795,clientY:119}))
  })
  expect(host.querySelectorAll('.is-editing')).toHaveLength(1)
  expect(edit.querySelectorAll('.exrow.row-sel')).toHaveLength(2)
  act(() => window.dispatchEvent(new MouseEvent('mouseup')))
})

it('expands an empty Dx over the adjacent cells and adds its first row', () => {
  const weeks = fixture()
  weeks[1].days[4].rows = []
  weeks[1].days[5].rows = []
  act(() => root.render(<PlanEditor initialWeeks={weeks} weeksCount={4} studentName="学员" planName="计划" planStartDate="2026-10-19" />))
  click(cell(2,2))
  expect(cell(2,2).classList.contains('is-editing')).toBe(true)
  expect(cell(2,1).style.visibility).toBe('hidden')
  expect(cell(2,3).style.visibility).toBe('hidden')
  click(cell(2,2).querySelector('[data-add-tier="main"]')!)
  expect(cell(2,2).querySelectorAll('.exrow')).toHaveLength(1)
})

it('renders the new block and editing controls in English', () => {
  setLocale('en')
  const weeks = fixture()
  for (const week of weeks) for (const day of week.days) for (const row of day.rows) {
    row.name = 'Squat'; row.nameEn = 'Squat'
  }
  act(() => root.render(<PlanEditor initialWeeks={weeks} weeksCount={4} studentName="Student" planName="Block" planStartDate="2026-10-19" />))
  expect(host.querySelector('.block-column button')?.textContent).toContain('Mon')
  click(cell(1,0))
  expect(cell(1,0).querySelectorAll('input[placeholder="Notes"]')).toHaveLength(4)
  expect(cell(1,0).textContent).toContain('Esc Collapse')
  expect(cell(1,0).textContent).toContain('Drag to select rows')
  expect(host.querySelector('.block-grid')?.textContent).not.toMatch(/[\u3400-\u9fff]/)
})


it('keeps the edit header compact and opens the date picker only on demand', async () => {
  await act(async () => root.render(<PlanEditor initialWeeks={fixture()} weeksCount={4} studentId="student" studentName="Student" planName="Block" planStartDate="2026-10-19" />))
  click(cell(2,2))
  expect(cell(2,2).querySelector('.block-existing-context,.dayhead-context')).toBeNull()
  expect(cell(2,2).querySelector('input[type="date"]')).toBeNull()
  click(cell(2,2).querySelector('[aria-label="修改本日日期"]')!)
  const date = cell(2,2).querySelector<HTMLInputElement>('input[type="date"]')!
  expect(date.value).toBe('2026-10-30')
  act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(date, '2026-10-29'); date.dispatchEvent(new Event('change', { bubbles:true })); date.dispatchEvent(new Event('input', { bubbles:true })) })
  expect(host.querySelector('.is-editing [data-day-calendar-label]')?.textContent).toContain('10/29')
  expect(host.querySelector('.is-editing input[type="date"]')).toBeNull()
})


it('lays out intensity and weight controls as one horizontal prescription line', () => {
  const style = document.createElement('style')
  style.textContent = readFileSync('src/features/plan-editor/components/block-grid.css', 'utf8')
  document.head.append(style)
  try {
    act(() => root.render(<PlanEditor initialWeeks={fixture()} weeksCount={4} studentName="Student" planName="Block" />))
    click(cell(1,0))
    for (const selector of ['.intensity-controls', '.weight-controls']) {
      const controls = cell(1,0).querySelector<HTMLElement>(selector)!
      expect(getComputedStyle(controls).display).toBe('flex')
      expect(getComputedStyle(controls).flexWrap).toBe('nowrap')
      expect(getComputedStyle(controls).flexDirection).toBe('row')
    }
    const weights = cell(1,0).querySelector('.weight-controls')!
    expect(weights.querySelector('select')).not.toBeNull()
    expect(weights.querySelector('[data-guard-field="weight"]')).not.toBeNull()
  } finally { style.remove() }
})


it.each(['date', 'weekday'])('keeps Dx identities after changing a column, then changing its %s again', action => {
  act(() => root.render(<PlanEditor initialWeeks={fixture(1)} weeksCount={1} studentName="Student" planName="Block" planStartDate="2026-10-19" />))
  const changeWeekday = (value: string) => {
    click(host.querySelectorAll('.block-column button')[0])
    const select = host.querySelector<HTMLSelectElement>('[aria-label="修改 Dx 星期"]')!
    act(() => { select.value = value; select.dispatchEvent(new Event('change', { bubbles:true })) })
  }
  changeWeekday('3')
  expect([...host.querySelectorAll('.block-column button')].map(button => button.textContent)).toEqual(['D1周四', 'D2周三', 'D3周五', 'D4周六'])
  if (action === 'weekday') changeWeekday('1')
  else {
    click(cell(1,0))
    click(cell(1,0).querySelector('[aria-label="修改本日日期"]')!)
    const date = cell(1,0).querySelector<HTMLInputElement>('input[type="date"]')!
    act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(date, '2026-10-20'); date.dispatchEvent(new Event('input', { bubbles:true })) })
  }
  expect(cell(1,0).dataset.dow).toBe('1')
  expect(cell(1,0).querySelector('[data-rowid="w1-0-0"]')).not.toBeNull()
  expect(cell(1,1).dataset.dow).toBe('2')
  expect(cell(1,1).querySelector('[data-rowid="w1-2-0"]')).not.toBeNull()
})
