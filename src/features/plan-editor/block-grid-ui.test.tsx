import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PlanEditor } from './PlanEditor'
import { relabelWeeksForStartDate } from './mapping'
import { readFileSync } from 'node:fs'
import { setLocale } from '../../i18n/locale'
import type { StudentSetLog } from '../../api/types'
import type { ExerciseRow, Week } from './types'
import { installLocalStorageMock } from '../../test/localStorageMock'

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
function hotfixFixture(extraWeeks = [2, 3, 5, 8]): Week[] {
  const weeks = fixture(12)
  for (const week of weeks) {
    if ([6, 7].includes(week.num)) Object.assign(week.days[2], { rest: true, rows: [] })
    if (extraWeeks.includes(week.num)) Object.assign(week.days[3], { rest: false,
      rows: [{ ...week.days[0].rows[0], id: `w${week.num}-extra` }] })
  }
  Object.assign(weeks[0].days[0].rows[0], {
    name: '宽握距罗马尼亚硬拉', weightMode: 'per_set',
    boxes: ['92.5', '82.5', '82.5', '82.5'].map(val => ({ val, empty: false })),
  })
  Object.assign(weeks[0].days[0].rows[1], {
    name: '弹力带辅助引体向上', reps: '12', mode: 'kg',
    intensity: { mode: 'rpe', value: '6', high: '' }, intensityMode: 'per_set',
    intensityBoxes: ['6', '7', '8', '8'].map(val => ({ val, empty: false })),
    boxes: Array.from({ length: 4 }, () => ({ val: '', empty: true })),
  })
  return relabelWeeksForStartDate(weeks, '2026-01-12')
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


it.each([3, 10])('wraps all %i per-set RPE and weight boxes in an auto-height edit row', count => {
  const style = document.createElement('style')
  style.textContent = readFileSync('src/features/plan-editor/components/block-grid.css', 'utf8')
  document.head.append(style)
  try {
    const weeks = fixture()
    Object.assign(weeks[0].days[0].rows[0], {
      intensity: { mode: 'rpe', value: '8', high: '' }, intensityMode: 'per_set',
      intensityBoxes: Array.from({ length: count }, () => ({ val: '8', empty: false })),
      weightMode: 'per_set', boxes: Array.from({ length: count }, () => ({ val: '120', empty: false })),
    })
    act(() => root.render(<PlanEditor initialWeeks={weeks} weeksCount={4} studentName="Student" planName="Block" />))
    click(cell(1,0))
    const row = cell(1,0).querySelector('[data-rowid="w1-0-0"]')!
    for (const field of ['intensity', 'weight']) {
      const controls = row.querySelector<HTMLElement>(`.${field}-controls`)!
      const inputs = controls.querySelectorAll<HTMLInputElement>(`[data-guard-field="${field}"]`)
      expect(inputs).toHaveLength(count)
      for (const input of inputs) {
        expect(input.disabled).toBe(false)
        act(() => {
          input.focus()
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, field === 'intensity' ? '9' : '125')
          input.dispatchEvent(new Event('input', { bubbles: true }))
        })
        expect(document.activeElement).toBe(input)
        expect(input.value).toBe(field === 'intensity' ? '9' : '125')
      }
      expect(getComputedStyle(controls).flexWrap).toBe('wrap')
      expect(getComputedStyle(controls).overflowX).toBe('visible')
      expect(getComputedStyle(controls).overflowY).toBe('visible')
      expect(getComputedStyle(controls.parentElement!).height).toBe('auto')
    }
    expect(getComputedStyle(row.querySelector('.exercise-row-main')!).height).toBe('auto')
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
  expect([...host.querySelectorAll('.block-column button')].map(button => button.textContent)).toEqual(['周四', '周三', '周五', '周六'])
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

it('shows only weekdays in column headers and date-ordered Dx on every card and edit header', () => {
  const weeks = fixture()
  weeks[1].days[2].rows = []; weeks[1].days[2].rest = true
  act(() => root.render(<PlanEditor initialWeeks={weeks} weeksCount={4} studentName="学员" planName="计划" planStartDate="2026-10-19" />))
  expect([...host.querySelectorAll('.block-column button')].map(el => el.textContent)).toEqual(['周一', '周三', '周五', '周六'])
  expect(cell(2,2).querySelector('.block-date')?.textContent).toBe('D2 · 10/30')
  expect(cell(2,3).querySelector('.block-date')?.textContent).toBe('D3 · 10/31')
  click(cell(2,2))
  expect(cell(2,2).querySelector('.block-edit-head')?.textContent).toContain('W2 · D2 · 周五 10/30')
})

it.each([
  [[2, 3, 5, 8], '周四 · 只在 W2、W3、W5 等 4 周'],
  [[2, 3, 5], '周四 · 只在 W2、W3、W5'],
  [[2, 3, 5, 8, 10, 12], '周四'],
] as const)('labels only rare extra columns in a legacy 12-week plan (%s)', (extraWeeks, thursday) => {
  const weeks = hotfixFixture([...extraWeeks])
  act(() => root.render(<PlanEditor initialWeeks={weeks} weeksCount={12} studentName="学员" planName="01-12" planStartDate="2026-01-12" />))
  expect([...host.querySelectorAll('.block-column button')].map(el => el.textContent))
    .toEqual(['周一', '周三', thursday, '周五', '周六'])
})

it('clips legacy 12-week column headers to one line and exposes their full labels on hover', () => {
  const style = document.createElement('style')
  style.textContent = readFileSync('src/features/plan-editor/components/block-grid.css', 'utf8')
  document.head.append(style)
  try {
    act(() => root.render(<PlanEditor initialWeeks={hotfixFixture()} weeksCount={12} studentName="学员" planName="01-12" planStartDate="2026-01-12" />))
    for (const button of host.querySelectorAll<HTMLButtonElement>('.block-column button')) {
      expect.soft(button.title).toBe(button.textContent)
      expect.soft(getComputedStyle(button).minWidth).toBe('0')
      expect.soft(getComputedStyle(button).maxWidth).toBe('100%')
      const label = getComputedStyle(button.querySelector('span')!)
      expect.soft(label.whiteSpace).toBe('nowrap')
      expect.soft(label.overflow).toBe('hidden')
      expect.soft(label.textOverflow).toBe('ellipsis')
    }
  } finally { style.remove() }
})

it('keeps a data-inferred regular column plain even when fewer than half the weeks train there', () => {
  const weeks = hotfixFixture([])
  for (const week of weeks.slice(4)) Object.assign(week.days[5], { rest: true, rows: [] })
  act(() => root.render(<PlanEditor initialWeeks={weeks} weeksCount={12} studentName="学员" planName="01-12" planStartDate="2026-01-12" />))
  expect([...host.querySelectorAll('.block-column button')].map(el => el.textContent))
    .toEqual(['周一', '周三', '周五', '周六'])
})

it('caps the rare-week list in English and keeps the full displayed label on hover', () => {
  setLocale('en')
  act(() => root.render(<PlanEditor initialWeeks={hotfixFixture()} weeksCount={12} studentName="Student" planName="01-12" planStartDate="2026-01-12" />))
  const button = host.querySelectorAll<HTMLButtonElement>('.block-column button')[2]
  expect(button.textContent).toBe('Thu · Only in W2, W3, W5 (4 weeks total)')
  expect(button.title).toBe(button.textContent)
})

it('lets long per-set bricks wrap below a six-character name without losing hover text', () => {
  const style = document.createElement('style')
  style.textContent = readFileSync('src/features/plan-editor/components/block-grid.css', 'utf8')
  document.head.append(style)
  try {
    act(() => root.render(<PlanEditor initialWeeks={hotfixFixture()} weeksCount={12} studentName="学员" planName="01-12" planStartDate="2026-01-12" />))
    for (const [id, name, shorthand] of [
      ['w1-0-0', '宽握距罗马尼亚硬拉', '4×3 · 92.5/82.5/82.5/82.5'],
      ['w1-0-1', '弹力带辅助引体向上', '4×12 @6/7/8/8'],
      ['w1-0-2', '动作3', '1×3 · 120'],
    ]) {
      const brick = host.querySelector<HTMLElement>(`.block-brick[data-rowid="${id}"]`)!
      expect.soft(brick.title).toBe(`${name} ${shorthand}`)
      expect.soft(brick.querySelector('span')?.textContent).toBe(name)
      expect.soft(brick.querySelector('span')?.hasAttribute('title')).toBe(false)
      expect.soft(brick.querySelector('code')?.textContent).toBe(shorthand)
      const layout = getComputedStyle(brick)
      expect.soft(layout.flexWrap).toBe('wrap')
      expect.soft(layout.height).toBe('auto')
      expect.soft(layout.minHeight).toBe('24px')
      expect.soft(layout.rowGap).toBe('0')
      const nameStyle = getComputedStyle(brick.querySelector('span')!)
      expect.soft(nameStyle.minWidth).toBe('min(6em, 100%)')
      expect.soft(nameStyle.flexGrow).toBe('1')
      const shorthandStyle = getComputedStyle(brick.querySelector('code')!)
      expect.soft(shorthandStyle.flexShrink).toBe('1')
      expect.soft(shorthandStyle.marginLeft).toBe('auto')
      expect.soft(shorthandStyle.textAlign).toBe('right')
      for (const textStyle of [nameStyle, shorthandStyle]) {
        expect.soft(textStyle.maxWidth).toBe('100%')
        expect.soft(textStyle.whiteSpace).toBe('nowrap')
        expect.soft(textStyle.overflow).toBe('hidden')
        expect.soft(textStyle.textOverflow).toBe('ellipsis')
      }
    }
  } finally { style.remove() }
})

it('inserts Thursday from the W2 gap, opens its empty editor, and keeps other weeks blank and numbered', async () => {
  act(() => root.render(<PlanEditor initialWeeks={fixture()} weeksCount={4} studentName="学员" planName="计划" planStartDate="2026-10-19" />))
  const gap = host.querySelector('[data-insert-week="2"][data-insert-before="2"] button')!
  expect(gap).not.toBeNull()
  click(gap)
  const choices = [...host.querySelectorAll('[role="menuitem"][data-insert-date]')]
  expect(choices.map(el => el.getAttribute('data-insert-date'))).toEqual(['2026-10-29'])
  click(choices[0])
  expect(host.querySelectorAll('.block-column')[2].textContent).toBe('周四 · 只在 W2')
  expect(cell(2,2).classList.contains('is-editing')).toBe(true)
  expect(cell(2,2).querySelector('.block-edit-head')?.textContent).toContain('W2 · D3 · 周四 10/29')
  expect(cell(2,2).querySelectorAll('.exrow')).toHaveLength(0)
  await key('Escape')
  expect(cell(2,4).querySelector('.block-date')?.textContent).toBe('D5 · 10/31')
  for (const w of [1,3,4]) {
    expect(cell(w,2).textContent).toBe('')
    expect(cell(w,2).querySelector('.block-empty')).toBeNull()
    expect(cell(w,4).querySelector('.block-date')?.textContent).toMatch(/^D4 · /)
  }
  expect(host.querySelector('[data-insert-week="2"][data-insert-before="4"]')).toBeNull()
})

it('confirms whole-day deletion, renumbers, collapses the extra column, and restores it with undo', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  act(() => root.render(<PlanEditor initialWeeks={fixture()} weeksCount={4} studentName="学员" planName="计划" planStartDate="2026-10-19" />))
  click(host.querySelector('[data-insert-week="2"][data-insert-before="2"] button')!)
  click(host.querySelector('[data-insert-date="2026-10-29"]')!)
  await key('Escape'); click(cell(2,2)); await key('Delete')
  expect(confirm).toHaveBeenLastCalledWith('删除 W2 · D3（周四 10/29）及其中 0 个动作？')
  expect(host.querySelectorAll('.block-column')).toHaveLength(5)
  confirm.mockReturnValue(true)
  await key('Delete')
  expect(host.querySelectorAll('.block-column')).toHaveLength(4)
  expect(cell(2,2).querySelector('.block-date')?.textContent).toBe('D3 · 10/30')
  await key('z', true)
  expect(host.querySelectorAll('.block-column')).toHaveLength(5)
  expect(cell(2,2).querySelector('.block-date')?.textContent).toBe('D3 · 10/29')
})

it.each([false, true])('removes an inserted extra column on undo and restores it only on redo (saved=%s)', async savedFirst => {
  vi.useFakeTimers()
  try {
    const onSave = vi.fn(async (weeks: Week[]) => {
      const saved = structuredClone(weeks)
      saved[1].days[3].serverDayId = 'inserted-thursday'
      return { changedDays: 1, skippedRows: 0, degradedRows: 0, weeks: saved }
    })
    act(() => root.render(<PlanEditor initialWeeks={fixture()} weeksCount={4} studentName="学员" planName="计划" planStartDate="2026-10-19" onSave={onSave} />))
    click(host.querySelector('[data-insert-week="2"][data-insert-before="2"] button')!)
    click(host.querySelector('[data-insert-date="2026-10-29"]')!)
    expect(host.querySelectorAll('.block-column')).toHaveLength(5)
    if (savedFirst) await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
    expect(onSave).toHaveBeenCalledTimes(savedFirst ? 1 : 0)
    await key('Escape')
    await key('z', true)
    expect(host.querySelectorAll('.block-column')).toHaveLength(4)
    await key('y', true)
    expect(host.querySelectorAll('.block-column')).toHaveLength(5)
    expect(cell(2,2).querySelector('.block-date')?.textContent).toBe('D3 · 10/29')
  } finally { vi.useRealTimers() }
})

it('ignores stale extra weekdays after saving an insertion, undoing it, and remounting', async () => {
  const storage = installLocalStorageMock()
  vi.useFakeTimers()
  try {
    let saved = fixture()
    const onSave = vi.fn(async (weeks: Week[], _start?: string | null, _past?: boolean, _progress?: unknown, deleted?: readonly string[]) => {
      saved = structuredClone(weeks)
      if (!saved[1].days[3].rest) saved[1].days[3].serverDayId = 'inserted-thursday'
      // The save adapter retains a server empty day without explicit deletion.
      else if (!deleted?.includes('inserted-thursday')) Object.assign(saved[1].days[3], { rest: false, serverDayId: 'inserted-thursday' })
      return { changedDays: 1, skippedRows: 0, degradedRows: 0, weeks: saved }
    })
    const render = (key: string) => root.render(<PlanEditor key={key} currentPlanId="card-e-undo" initialWeeks={saved} weeksCount={4} studentName="学员" planName="计划" planStartDate="2026-10-19" onSave={onSave} />)
    act(() => render('original'))
    click(host.querySelector('[data-insert-week="2"][data-insert-before="2"] button')!)
    click(host.querySelector('[data-insert-date="2026-10-29"]')!)
    await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(saved[1].days[3].rest).toBe(false)
    await key('Escape'); await key('z', true)
    expect.soft(host.querySelectorAll('.block-column')).toHaveLength(4)
    await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
    expect(onSave).toHaveBeenCalledTimes(2)
    expect.soft(onSave.mock.calls[1][4]).toEqual(['inserted-thursday'])
    expect(saved[1].days[3].rest).toBe(true)
    act(() => render('reopened'))
    expect(host.querySelectorAll('.block-column')).toHaveLength(4)
  } finally {
    storage.clear()
    vi.useRealTimers()
  }
})

it('retains all pending insertion removals across consecutive undo and redo before saving', async () => {
  vi.useFakeTimers()
  try {
    let saved = fixture()
    const live = new Set<number>()
    const onSave = vi.fn(async (weeks: Week[], _start?: string | null, _past?: boolean, _progress?: unknown, deleted?: readonly string[]) => {
      saved = structuredClone(weeks)
      for (const dow of [1, 3]) {
        const day = saved[1].days[dow]
        if (!day.rest) live.add(dow)
        else if (deleted?.includes(`inserted-${dow}`)) live.delete(dow)
        if (live.has(dow)) Object.assign(day, { rest: false, serverDayId: `inserted-${dow}` })
      }
      return { changedDays: 1, skippedRows: 0, degradedRows: 0, weeks: saved }
    })
    const render = (key: string) => root.render(<PlanEditor key={key} initialWeeks={saved} weeksCount={4} studentName="学员" planName="计划" planStartDate="2026-10-19" onSave={onSave} />)
    act(() => render('original'))
    click(host.querySelector('[data-insert-week="2"][data-insert-before="2"] button')!)
    click(host.querySelector('[data-insert-date="2026-10-29"]')!)
    await key('Escape')
    click(host.querySelector('[data-insert-week="2"][data-insert-before="0"] button')!)
    click(host.querySelector('[data-insert-date="2026-10-27"]')!)
    await key('Escape')
    await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(host.querySelectorAll('.block-column')).toHaveLength(6)
    await key('z', true); await key('z', true)
    expect(host.querySelectorAll('.block-column')).toHaveLength(4)
    await key('y', true)
    expect(host.querySelectorAll('.block-column')).toHaveLength(5)
    await key('z', true)
    await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
    expect.soft([...onSave.mock.calls[1][4] ?? []].sort()).toEqual(['inserted-1', 'inserted-3'])
    expect.soft([...live]).toEqual([])
    act(() => render('reopened'))
    expect(host.querySelectorAll('.block-column')).toHaveLength(4)
  } finally { vi.useRealTimers() }
})

it('disables whole-day deletion with logs but keeps clear-day and brick deletion separate', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
  const weeks = fixture()
  weeks[0].days[0].rows[0].hasLogs = true
  act(() => root.render(<PlanEditor initialWeeks={weeks} weeksCount={4} studentName="学员" planName="计划" planStartDate="2026-10-19" />))
  act(() => cell(1,0).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true })))
  const remove = [...host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(b => b.textContent === '删除这天')!
  expect(remove).toBeDefined()
  expect(remove.disabled).toBe(true)
  expect(remove.title).toBe('已有打卡记录，不能删除')
  click(cell(1,0)); await key('Delete')
  expect(confirm).not.toHaveBeenCalled()
  expect(cell(1,0).querySelectorAll('.exrow')).toHaveLength(4)
  await key('Escape')
  click(cell(2,0).querySelector('[data-rowid="w2-0-1"]')!)
  click(cell(2,0).querySelector('[data-rowid="w2-0-2"]')!, { metaKey: true })
  await key('Delete')
  expect(cell(2,0).querySelectorAll('[data-rowid]')).toHaveLength(2)
  expect(cell(2,0).querySelector('.block-date')?.textContent).toBe('D1 · 10/26')
  act(() => cell(2,0).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true })))
  click([...host.querySelectorAll('[role="menuitem"]')].find(b => b.textContent === '清空本日')!)
  expect(cell(2,0).querySelectorAll('[data-rowid]')).toHaveLength(0)
  expect(cell(2,0).querySelector('.block-date')?.textContent).toBe('D1 · 10/26')
})

it('lists only available start/end dates, reuses a pattern column, and hides insertion in read-only mode', async () => {
  const weeks = fixture()
  weeks[1].days[0].rows = []; weeks[1].days[0].rest = true
  act(() => root.render(<PlanEditor initialWeeks={weeks} weeksCount={4} studentName="学员" planName="计划" planStartDate="2026-10-19" />))
  click(host.querySelector('[data-insert-week="2"][data-insert-before="start"] button')!)
  expect([...host.querySelectorAll('[data-insert-date]')].map(el => el.getAttribute('data-insert-date'))).toEqual(['2026-10-26','2026-10-27'])
  click(host.querySelector('[data-insert-date="2026-10-26"]')!)
  expect(host.querySelectorAll('.block-column')).toHaveLength(4)
  expect(cell(2,0).querySelector('.block-edit-head')?.textContent).toContain('W2 · D1 · 周一 10/26')
  await key('Escape')
  click(host.querySelector('[data-insert-week="2"][data-insert-before="5"] button')!)
  expect([...host.querySelectorAll('[data-insert-date]')].map(el => el.getAttribute('data-insert-date'))).toEqual(['2026-11-01'])
  click(host.querySelector('[data-insert-date="2026-11-01"]')!)
  expect(cell(2,4).querySelector('.block-edit-head')?.textContent).toContain('W2 · D5 · 周日 11/1')
  act(() => root.render(<PlanEditor key="readonly" initialWeeks={weeks} weeksCount={4} studentName="学员" planName="计划" planStartDate="2026-10-19" readOnly />))
  expect(host.querySelector('[data-insert-week]')).toBeNull()
})

it('shows gap and empty-cell plus signs without hover, but hides both in read-only plans', () => {
  const style = document.createElement('style')
  style.textContent = readFileSync('src/features/plan-editor/components/block-grid.css', 'utf8')
  document.head.append(style)
  try {
    const weeks = fixture()
    Object.assign(weeks[1].days[0], { rest: true, rows: [] })
    act(() => root.render(<PlanEditor initialWeeks={weeks} weeksCount={4} studentName="学员" planName="计划" planStartDate="2026-10-19" />))
    const gaps = host.querySelectorAll<HTMLElement>('.block-insert-gap > button')
    expect(gaps.length).toBeGreaterThan(0)
    const empty = cell(2,0).querySelector<HTMLElement>('.block-empty')!
    expect(empty).not.toBeNull()
    for (const plus of [...gaps, empty]) {
      const css = getComputedStyle(plus)
      expect.soft(css.opacity).toBe('1')
      expect.soft(css.display).not.toBe('none')
      expect.soft(css.visibility).not.toBe('hidden')
      expect.soft(css.color).toBe('rgb(156, 163, 175)')
    }
    for (const button of gaps) {
      const css = getComputedStyle(button)
      expect.soft(css.width).toBe('18px')
      expect.soft(css.height).toBe('18px')
      expect.soft(css.boxSizing).toBe('border-box')
      expect.soft(css.borderRadius).toBe('50%')
      expect.soft(css.borderColor).toBe('rgb(156, 163, 175)')
      // The button stays in the existing gutter; the card's 11px padding
      // keeps its small edge overlap clear of the content.
      const gutter = getComputedStyle(button.parentElement!)
      expect.soft(gutter.width).toBe('14px')
      expect.soft(gutter.marginLeft).toBe('-12px')
    }
    act(() => root.render(<PlanEditor key="readonly-plus" initialWeeks={weeks} weeksCount={4} studentName="学员" planName="计划" planStartDate="2026-10-19" readOnly />))
    expect(host.querySelector('.block-insert-gap,.block-empty')).toBeNull()
  } finally { style.remove() }
})

it('labels insertion, limited columns, delete confirmation and locked deletion in English', async () => {
  setLocale('en')
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
  act(() => root.render(<PlanEditor initialWeeks={fixture()} weeksCount={4} studentName="Student" planName="Block" planStartDate="2026-10-19" />))
  click(host.querySelector('[data-insert-week="2"][data-insert-before="2"] [aria-label="Insert training day"]')!)
  click(host.querySelector('[data-insert-date="2026-10-29"]')!)
  expect(host.querySelectorAll('.block-column')[2].textContent).toBe('Thu · Only in W2')
  await key('Escape')
  act(() => cell(2,2).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true })))
  click([...host.querySelectorAll('[role="menuitem"]')].find(el => el.textContent === 'Delete day')!)
  expect(confirm).toHaveBeenCalledWith('Delete W2 · D3 (Thu Oct 29) and its 0 exercises?')
  expect(host.querySelectorAll('.block-column')).toHaveLength(4)
})

it.each(['insert','delete'])('keeps published %s local until Update plan and reopens the saved structure', async action => {
  vi.useFakeTimers()
  try {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    let saved = fixture()
    const onSave = vi.fn(async (weeks: Week[]) => {
      saved = structuredClone(weeks)
      return { changedDays: 1, skippedRows: 0, degradedRows: 0, weeks: saved }
    })
    act(() => root.render(<PlanEditor initialWeeks={saved} weeksCount={4} studentName="学员" planName="计划" planStartDate="2026-10-19" initialPublished onSave={onSave} />))
    if (action !== 'delete') {
      click(cell(1,0).querySelector('[data-rowid]')!)
      await key('c', true)
      click(host.querySelector('[data-insert-week="2"][data-insert-before="2"] button')!)
      click(host.querySelector('[data-insert-date="2026-10-29"]')!)
      if (action === 'insert') await key('v', true)
    } else {
      click(cell(2,1)); await key('Delete')
    }
    await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
    expect(host.querySelector('.block-topbar')?.textContent).toContain('有未推送修改')
    expect(onSave).not.toHaveBeenCalled()
    await act(async () => { [...host.querySelectorAll('button')].find(button => button.textContent?.includes('更新计划'))!.click() })
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(saved[1].days[3].rows.length).toBe(action === 'insert' ? 1 : 0)
    expect(saved[1].days[2].rows.length).toBe(action !== 'delete' ? 4 : 0)
    act(() => root.render(<PlanEditor key="reopen" initialWeeks={saved} weeksCount={4} studentName="学员" planName="计划" planStartDate="2026-10-19" initialPublished onSave={onSave} />))
    const card = host.querySelector(`[data-block-week="2"][data-dow="${action !== 'delete' ? 3 : 4}"]`)!
    expect(card.querySelector('.block-date')?.textContent).toBe(action !== 'delete' ? 'D3 · 10/29' : 'D2 · 10/30')
    await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
    expect(onSave).toHaveBeenCalledTimes(1)
  } finally { vi.useRealTimers() }
})

it('autosaves a draft empty-day insertion and deletion through the existing save callback', async () => {
  vi.useFakeTimers()
  try {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const onSave = vi.fn(async (weeks: Week[]) => ({ changedDays: 1, skippedRows: 0, degradedRows: 0, weeks: structuredClone(weeks) }))
    act(() => root.render(<PlanEditor initialWeeks={fixture()} weeksCount={4} studentName="学员" planName="计划" planStartDate="2026-10-19" onSave={onSave} />))
    click(host.querySelector('[data-insert-week="2"][data-insert-before="2"] button')!)
    click(host.querySelector('[data-insert-date="2026-10-29"]')!)
    await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0][0][1].days[3]).toMatchObject({ rest: false, rows: [] })
    await key('Delete')
    await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
    expect(onSave).toHaveBeenCalledTimes(2)
    expect(onSave.mock.calls[1][0][1].days[3]).toMatchObject({ rest: true, rows: [] })
    expect(host.querySelectorAll('.block-column')).toHaveLength(4)
  } finally { vi.useRealTimers() }
})


it.each([[false, 'zh'], [true, 'zh'], [false, 'en'], [true, 'en']] as const)('blocks empty training days before publishing or updating (published=%s, locale=%s), and cycles the review chip', async (published, locale) => {
  vi.useFakeTimers()
  try {
    setLocale(locale)
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {})
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const onSave = vi.fn(async (weeks: Week[]) => ({ changedDays: 1, skippedRows: 0, degradedRows: 0, weeks: structuredClone(weeks) }))
    const onPublish = vi.fn().mockResolvedValue(undefined)
    act(() => root.render(<PlanEditor initialWeeks={fixture()} weeksCount={4} studentName="学员" planName="计划" planStartDate="2026-10-19" initialPublished={published} onSave={onSave} onPublish={onPublish} />))
    for (const week of [2,3]) {
      click(host.querySelector(`[data-insert-week="${week}"][data-insert-before="2"] button`)!)
      click(host.querySelector(`[data-insert-date="2026-${week === 2 ? '10-29' : '11-05'}"]`)!)
    }
    click(host.querySelector('.block-primary')!)
    expect(alert).toHaveBeenCalledWith(locale === 'zh' ? 'W2 · D3（周四 10/29）还没有动作：先填动作或删除这天，再更新' : 'W2 · D3 (Thu Oct 29) has no exercises: add exercises or delete this day before updating')
    expect(onSave).not.toHaveBeenCalled()
    expect(onPublish).not.toHaveBeenCalled()
    const chip = [...host.querySelectorAll('button')].find(button => button.textContent === (locale === 'zh' ? '! 2 处待核对' : '! 2 to review'))!
    expect(chip).toBeTruthy()
    click(chip)
    expect(host.querySelector('.daygrid')?.closest('[data-block-week]')?.getAttribute('data-block-week')).toBe('2')
    click(chip)
    expect(host.querySelector('.daygrid')?.closest('[data-block-week]')?.getAttribute('data-block-week')).toBe('3')
    if (!published) {
      await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
      expect(onSave).toHaveBeenCalledTimes(1)
      expect(onSave.mock.calls[0][0][1].days[3]).toMatchObject({ rest: false, rows: [] })
    }
  } finally { vi.useRealTimers() }
})

it.each(['Delete', 'menu'])('passes only explicitly deleted server IDs to saving, with undo/redo (%s)', async gesture => {
  vi.useFakeTimers()
  try {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const weeks = fixture()
    weeks[1].days[3] = { ...weeks[1].days[3], rest: false, serverDayId: 'empty-server' }
    const onSave = vi.fn(async (weeks: Week[], _start?: string | null, _past?: boolean, _progress?: unknown, _deleted?: readonly string[]) => ({ changedDays: 1, skippedRows: 0, degradedRows: 0, weeks: structuredClone(weeks) }))
    act(() => root.render(<PlanEditor initialWeeks={weeks} weeksCount={4} studentName="学员" planName="计划" planStartDate="2026-10-19" onSave={onSave} />))
    const empty = host.querySelector('[data-block-week="2"][data-dow="3"]')!
    if (gesture === 'Delete') { click(empty); await key('Delete') }
    else {
      act(() => empty.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true })))
      click([...host.querySelectorAll('[role="menuitem"]')].find(button => button.textContent === '删除这天')!)
    }
    await key('z', true)
    await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
    expect(onSave.mock.calls[0][4]).toEqual([])
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, shiftKey: true, bubbles: true })) })
    await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
    expect(onSave.mock.calls[1][4]).toEqual(['empty-server'])
  } finally { vi.useRealTimers() }
})

it('keeps explicit deletion intent through save, undo/save with a new server ID, and redo/save', async () => {
  vi.useFakeTimers()
  try {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const weeks = fixture()
    weeks[1].days[3] = { ...weeks[1].days[3], rest: false, serverDayId: 'empty-server' }
    const onSave = vi.fn(async (weeks: Week[], _start?: string | null, _past?: boolean, _progress?: unknown, _deleted?: readonly string[]) => {
      const saved = structuredClone(weeks)
      saved[1].days[3].serverDayId = saved[1].days[3].rest ? null : `restored-empty-${onSave.mock.calls.length}`
      return { changedDays: 1, skippedRows: 0, degradedRows: 0, weeks: saved }
    })
    act(() => root.render(<PlanEditor initialWeeks={weeks} weeksCount={4} studentName="学员" planName="计划" planStartDate="2026-10-19" onSave={onSave} />))
    click(host.querySelector('[data-block-week="2"][data-dow="3"]')!)
    await key('Delete')
    await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
    expect(onSave.mock.calls[0][4]).toEqual(['empty-server'])
    for (let cycle = 0; cycle < 2; cycle++) {
      await key('z', true)
      await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
      expect(onSave.mock.calls[cycle * 2 + 1][4]).toEqual([])
      await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, shiftKey: true, bubbles: true })) })
      await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
      expect(onSave.mock.calls[cycle * 2 + 2][4]).toEqual([`restored-empty-${cycle * 2 + 2}`])
    }
  } finally { vi.useRealTimers() }
})

it.each(['Delete', 'undo'])('binds a new server ID to an explicit %s made while the empty-day autosave is in flight', async gesture => {
  vi.useFakeTimers()
  try {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    let finish!: (value: { changedDays: number; skippedRows: number; degradedRows: number; weeks: Week[] }) => void
    const onSave = vi.fn(async (weeks: Week[], _start?: string | null, _past?: boolean, _progress?: unknown, _deleted?: readonly string[]) => {
      if (onSave.mock.calls.length === 1) return new Promise<{ changedDays: number; skippedRows: number; degradedRows: number; weeks: Week[] }>(resolve => { finish = resolve })
      return { changedDays: 1, skippedRows: 0, degradedRows: 0, weeks: structuredClone(weeks) }
    })
    act(() => root.render(<PlanEditor initialWeeks={fixture()} weeksCount={4} studentName="学员" planName="计划" planStartDate="2026-10-19" onSave={onSave} />))
    click(host.querySelector('[data-insert-week="2"][data-insert-before="2"] button')!)
    click(host.querySelector('[data-insert-date="2026-10-29"]')!)
    await act(async () => { await vi.advanceTimersByTimeAsync(1600) })
    expect(onSave).toHaveBeenCalledTimes(1)
    if (gesture === 'Delete') await key('Delete')
    else { await key('Escape'); await key('z', true) }
    const saved = structuredClone(onSave.mock.calls[0][0])
    saved[1].days[3].serverDayId = 'new-empty-id'
    await act(async () => { finish({ changedDays: 1, skippedRows: 0, degradedRows: 0, weeks: saved }); await vi.advanceTimersByTimeAsync(4000) })
    expect(onSave.mock.calls[1][4]).toEqual(['new-empty-id'])
    expect(host.querySelector('[data-block-week="2"][data-dow="3"]')).toBeNull()
  } finally { vi.useRealTimers() }
})

it.each(['replacement-empty', 'old-empty'])('does not transfer an old Delete action to a newly inserted empty day at the same date (%s)', async savedId => {
  vi.useFakeTimers()
  try {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const weeks = fixture()
    weeks[1].days[3] = { ...weeks[1].days[3], rest: false, serverDayId: 'old-empty' }
    const onSave = vi.fn(async (weeks: Week[], _start?: string | null, _past?: boolean, _progress?: unknown, _deleted?: readonly string[]) => {
      const saved = structuredClone(weeks)
      if (!saved[1].days[3].rest) saved[1].days[3].serverDayId = savedId
      return { changedDays: 1, skippedRows: 0, degradedRows: 0, weeks: saved }
    })
    act(() => root.render(<PlanEditor initialWeeks={weeks} weeksCount={4} studentName="学员" planName="计划" planStartDate="2026-10-19" onSave={onSave} />))
    click(host.querySelector('[data-block-week="2"][data-dow="3"]')!)
    await key('Delete')
    click(host.querySelector('[data-insert-week="2"][data-insert-before="2"] button')!)
    click(host.querySelector('[data-insert-date="2026-10-29"]')!)
    await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
    click(host.querySelector('[data-block-week="2"][data-dow="3"] [data-day-calendar-label]')!)
    const date = host.querySelector<HTMLInputElement>('.is-editing input[type="date"]')!
    act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(date, '2026-10-27'); date.dispatchEvent(new Event('input', { bubbles: true })) })
    await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
    expect(onSave.mock.calls[1][4]).not.toContain(savedId)
  } finally { vi.useRealTimers() }
})
