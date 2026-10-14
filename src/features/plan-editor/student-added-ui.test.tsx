import { act, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DayColumn } from './components/DayColumn'
import { COL_DEFAULTS, type ExerciseRow } from './types'
import type { ActualSet } from './actuals'
import { setLocale } from '../../i18n/locale'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const prescription: ExerciseRow = {
  id: 'row-1', serverRowId: 'pe-1', serverSortOrder: 0, hasLogs: true, conflictMessage: null,
  exerciseId: 'squat', name: '深蹲', ku: true, custom: false, isMain: true, aux: false,
  reps: '3', mode: 'kg', weightMode: 'uniform', intensity: { mode: 'rpe', value: '8', high: '' },
  intensityMode: 'uniform', intensityBoxes: Array.from({ length: 4 }, () => ({ val: '8', empty: false })),
  boxes: Array.from({ length: 4 }, () => ({ val: '200', empty: false })), note: '',
  opaqueSets: Array.from({ length: 4 }, (_, i) => ({ set_number: i + 1, target_reps: 3, target_reps_max: null, set_type: 'working', rest_seconds: null, coach_note: null })),
}
const actual = (set_index: number, overrides: Partial<ActualSet> = {}): ActualSet => ({
  set_index, weight_kg: '200', reps: 3, rpe: '8', coach_rpe: null, completed: true, failed: false, ...overrides,
})
let host: HTMLDivElement
let root: Root
let props: ComponentProps<typeof DayColumn>
beforeEach(() => {
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  props = {
    day: { dow: 0, dowLabel: '周一', dateLabel: '8/10', rest: false, serverDayId: 'day-1', rows: [prescription] },
    colW: COL_DEFAULTS, selected: false,
    onSelect: vi.fn(), onSelectRow: vi.fn(), onSelectCell: vi.fn(), onResizeStart: vi.fn(),
    onNameFocus: vi.fn(), onNameChange: vi.fn(), onNameBlur: vi.fn(), onAddRow: vi.fn(), onEditRow: vi.fn(), onDeleteRow: vi.fn(),
  }
})
afterEach(() => { act(() => root.unmount()); host.remove(); setLocale('zh') })

it('keeps four prescribed chips unchanged and separates the fifth as neutral in both actual lines', () => {
  act(() => root.render(<DayColumn {...props} actualsForRow={() => [0, 1, 2, 3, 4].map((i) => actual(i, i === 4 ? { weight_kg: '180', rpe: '5' } : {}))} />))
  for (const kind of ['intensity', 'weight']) {
    const line = host.querySelector(`[data-actuals="${kind}"]`)!
    expect([...line.querySelectorAll('.actual-chip')].map((chip) => chip.className)).toEqual([
      'actual-chip tone-ok', 'actual-chip tone-ok', 'actual-chip tone-ok', 'actual-chip tone-ok', 'actual-chip tone-added',
    ])
    const group = line.querySelector('.actual-added-first')!
    expect(group.querySelector('.actual-tag')?.textContent).toBe('学员自加')
    expect(group.querySelector('.actual-chip')?.textContent).toBe(kind === 'weight' ? '180×3' : '@5')
    expect(group.querySelector('.actual-chip')?.className).toBe('actual-chip tone-added')
  }
})

it('preserves failure and missed styles for extra sets and uses server prescription despite a changed grid count', () => {
  const changedGrid = { ...prescription, boxes: [...prescription.boxes, { val: '200', empty: false }, { val: '200', empty: false }] }
  act(() => root.render(<DayColumn {...props} day={{ ...props.day, rows: [changedGrid] }} actualsForRow={() => [
    actual(3), actual(4, { failed: true }), actual(5, { completed: false }),
  ]} />))
  for (const line of host.querySelectorAll('[data-actuals]')) {
    expect([...line.querySelectorAll('.actual-chip')].map((chip) => chip.className)).toEqual([
      'actual-chip tone-ok', 'actual-chip tone-off', 'actual-chip tone-missed',
    ])
    const group = line.querySelector('.actual-added-first')!
    expect(group.querySelector('.actual-tag')?.textContent).toBe('学员自加')
    expect(group.querySelector('.actual-chip')?.className).toBe('actual-chip tone-off')
  }
})

it('appends a read-only student-added exercise after plan rows without changing prescription totals or selection', () => {
  const view = { badgeFor: () => null, trainingDayOrdinal: 1, weekdayLabel: '周一' }
  act(() => root.render(<DayColumn {...props} weekBand={view} />))
  const totals = host.querySelector('.dayhead-meta')?.textContent
  const sections = [...host.querySelectorAll('.tierhead-summary')].map((el) => el.textContent)
  const added = [{ exerciseId: 'curl', sets: [actual(0, { weight_kg: '12.5', reps: 12, rpe: null }), actual(1, { weight_kg: '12.5', reps: 12, rpe: null })] }]
  act(() => root.render(<DayColumn {...props} weekBand={view} studentAdded={added} exerciseName={() => '哑铃弯举'} />))
  const addedRow = host.querySelector('[data-student-added="curl"]')!
  expect(addedRow).not.toBeNull()
  expect(addedRow.querySelector('[data-c="name"]')?.textContent).toBe('哑铃弯举学员自加')
  expect(addedRow.querySelector('[data-c="sets"]')?.textContent).toBe('–')
  expect(addedRow.querySelector('[data-c="reps"]')?.textContent).toBe('–')
  expect([...addedRow.querySelectorAll('[data-actuals="weight"] .actual-chip')].map((el) => el.textContent)).toEqual(['12.5×12', '12.5×12'])
  expect([...addedRow.querySelectorAll('[data-actuals="intensity"] .actual-chip')].map((el) => el.textContent)).toEqual(['–', '–'])
  expect(addedRow.querySelectorAll('.tone-added')).toHaveLength(4)
  expect(addedRow.querySelector('input, button, [tabindex], [draggable], [data-plan-cell], [data-rowid]')).toBeNull()
  expect(host.querySelector('[data-rowid]')!.compareDocumentPosition(addedRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  act(() => { addedRow.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); addedRow.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
  expect(props.onSelect).not.toHaveBeenCalled()
  expect(props.onSelectRow).not.toHaveBeenCalled()
  expect(props.onSelectCell).not.toHaveBeenCalled()
  expect(props.onEditRow).not.toHaveBeenCalled()
  expect(host.querySelector('.dayhead-meta')?.textContent).toBe(totals)
  expect([...host.querySelectorAll('.tierhead-summary')].map((el) => el.textContent)).toEqual(sections)
  act(() => root.render(<DayColumn {...props} weekBand={view} studentAdded={added} readOnly />))
  expect(host.querySelector('[data-student-added="curl"] [data-c="name"]')?.textContent).toBe('curl学员自加')
})


it('renders no new elements for absent or empty student-added data', () => {
  act(() => root.render(<DayColumn {...props} actualsForRow={() => [actual(0)]} />))
  const original = host.innerHTML
  act(() => root.render(<DayColumn {...props} actualsForRow={() => [actual(0)]} studentAdded={[]} />))
  expect(host.innerHTML).toBe(original)
  expect(host.querySelector('[data-student-added]')).toBeNull()
  expect(host.textContent).not.toContain('学员自加')
})

it('renders Added by athlete in both extra-set lines and the read-only exercise name in English', () => {
  setLocale('en')
  act(() => root.render(<DayColumn {...props} readOnly actualsForRow={() => [actual(4)]}
    studentAdded={[{ exerciseId: 'curl', sets: [actual(0)] }]} exerciseName={() => 'Dumbbell curl'} />))
  expect([...host.querySelectorAll('.actual-tag')].filter((el) => el.textContent === 'Added by athlete')).toHaveLength(3)
  expect(host.querySelector('[data-student-added] [data-c="name"]')?.textContent).toBe('Dumbbell curlAdded by athlete')
})


it('keeps the added label and first extra chip in one non-wrapping container in both actual lines', () => {
  act(() => root.render(<DayColumn {...props} actualsForRow={() => [actual(0), actual(4), actual(5)]} />))
  for (const line of host.querySelectorAll('[data-actuals]')) {
    const group = line.querySelector<HTMLElement>('.actual-added-first')!
    expect(group).not.toBeNull()
    expect(group.children).toHaveLength(2)
    expect(group.querySelector('.actual-tag')?.textContent).toBe('学员自加')
    expect(group.querySelector('.actual-chip')?.textContent).toBe(line.getAttribute('data-actuals') === 'weight' ? '200×3' : '@8')
    expect(group.querySelector('.actual-chip')?.className).toBe('actual-chip tone-added')
    const style = getComputedStyle(group)
    expect(style.display).toBe('inline-flex')
    expect(style.flexWrap).toBe('nowrap')
    expect(style.whiteSpace).toBe('nowrap')
    expect(style.flexShrink).toBe('0')
    expect(group.nextElementSibling?.className).toBe('actual-chip tone-added')
  }
})
