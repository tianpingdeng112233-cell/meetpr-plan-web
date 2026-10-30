import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlanEditor } from './PlanEditor'
import { blockRow, blockWeeks, openBlockDay } from './blockGridTestUtils'
import { ExerciseIndex } from './exerciseIndex'
import { draftContentHash, loadDraftMirror } from './draftMirror'
import type { ExerciseResponse } from '../../api/types'
import type { ExerciseRow } from './types'

const catalog = new ExerciseIndex([
  { id: 'pullup', name: '引体向上', equipment: ['bodyweight'] },
  { id: 'raise', name: '侧平举', equipment: ['dumbbell'] },
].map(item => ({
  name_en: null, exercise_type: 'accessory', main_lift_family: null,
  is_competition_lift: false, muscle_groups: [], movement_pattern: [],
  competition_stance: null, created_by_coach_id: null, created_at: '', ...item,
} as ExerciseResponse)))

function change(element: HTMLInputElement | HTMLSelectElement, value: string) {
  const proto = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(element, value)
  element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
}

function emptyRow(id = 'raise', patch: Partial<ExerciseRow> = {}) {
  return blockRow(id, { name: id === 'pullup' ? '引体向上' : '侧平举', reps: '—', intensity: null,
    weightMode: 'uniform', boxes: Array.from({ length: 3 }, () => ({ val: '', empty: true })), ...patch })
}

describe('056 editor load types', () => {
  let host: HTMLDivElement
  let root: Root
  beforeEach(() => {
    vi.stubEnv('VITE_FREE_WEIGHT_ENABLED', '')
    const stored = new Map<string, string>()
    Object.defineProperty(window, 'localStorage', { configurable: true, value: {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
      removeItem: (key: string) => stored.delete(key), clear: () => stored.clear(),
      key: (index: number) => [...stored.keys()][index] ?? null, get length() { return stored.size },
    } })
    host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
    Object.defineProperty(Element.prototype, 'scrollIntoView', { value: vi.fn(), configurable: true })
  })
  afterEach(() => {
    act(() => root.unmount()); host.remove(); vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.useRealTimers()
  })
  function render(rows: ExerciseRow[]) {
    const weeks = blockWeeks([[0]]); weeks[0].days[0].rows = rows
    act(() => root.render(<PlanEditor initialWeeks={weeks} weeksCount={1} studentName="学员"
      planName="计划" currentPlanId="load-types" exerciseIndex={catalog} />))
  }
  function weight() { return host.querySelector<HTMLSelectElement>('[aria-label="重量模式"]')! }
  function reps() { return host.querySelector<HTMLInputElement>('[data-guard-field="reps"]')! }

  it.each(['', 'false'])('keeps free weight hidden and reps-only rows incomplete with gate %s', (gate) => {
    vi.stubEnv('VITE_FREE_WEIGHT_ENABLED', gate)
    render([emptyRow()]); openBlockDay(host)
    expect([...weight().options].map(option => option.textContent)).toEqual(['固定重量', '逐组标重', '重量区间', '自重'])
    act(() => change(reps(), '15'))
    expect(weight().value).toBe('fixed_weight')
    expect(host.textContent).toContain('1 处待核对')
  })

  it('offers the approved option and explanation, keeps intensity independent, and persists the draft', async () => {
    vi.stubEnv('VITE_FREE_WEIGHT_ENABLED', 'true'); vi.useFakeTimers()
    render([emptyRow('raise', { reps: '15', boxes: Array.from({ length: 3 }, () => ({ val: '10', empty: false })) })])
    openBlockDay(host)
    expect([...weight().options].map(option => option.textContent)).toEqual(['固定重量', '逐组标重', '重量区间', '自重', '自选重量'])
    act(() => change(weight(), 'free_weight'))
    act(() => change(host.querySelector<HTMLSelectElement>('[aria-label="强度类型"]')!, 'rpe'))
    act(() => change(host.querySelector<HTMLInputElement>('[aria-label="统一强度值"]')!, '8'))
    await act(async () => { await vi.advanceTimersByTimeAsync(800) })
    const saved = loadDraftMirror('load-types')?.content.weeks[0].days[0].rows[0]
    expect(saved?.weightMode).toBe('free_weight')
    expect(saved?.intensity).toEqual({ mode: 'rpe', value: '8', high: '' })
    expect(host.textContent).not.toContain('1 处待核对')
  })

  it.each([['pullup', 'bodyweight'], ['raise', 'free_weight']])('automatically classifies %s on completing reps and respects a manual fixed-weight choice', (id, expected) => {
    vi.stubEnv('VITE_FREE_WEIGHT_ENABLED', 'true')
    render([emptyRow(id)]); openBlockDay(host)
    act(() => change(reps(), '15'))
    expect(weight().value).toBe(expected)
    expect(host.textContent).not.toContain('1 处待核对')
    act(() => change(weight(), 'fixed_weight'))
    act(() => change(reps(), '12'))
    expect(weight().value).toBe('fixed_weight')
    expect(host.textContent).toContain('1 处待核对')
  })

  it('shows the free-weight explanation on the dropdown item and supports keyboard selection', () => {
    vi.stubEnv('VITE_FREE_WEIGHT_ENABLED', 'true')
    render([emptyRow('raise', { reps: '15' })]); openBlockDay(host)
    act(() => weight().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    const options = [...document.querySelectorAll<HTMLElement>('[role="option"]')]
    expect(options).toHaveLength(5)
    expect(options[4].querySelector('small')?.textContent).toBe('学员自己挑重量，记录时填')
    act(() => options[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })))
    expect(document.activeElement).toBe(options[4])
    act(() => options[4].click())
    expect(weight().value).toBe('free_weight')
    expect(document.querySelector('[role="listbox"]')).toBeNull()
  })

  it('preserves an existing range when reselecting the current weight mode', () => {
    render([emptyRow('raise', { reps: '15', intensity: { mode: 'weight_range', value: '10', high: '15' } })]); openBlockDay(host)
    act(() => weight().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    act(() => document.querySelector<HTMLElement>('[role="option"][aria-selected="true"]')!.click())
    expect(host.querySelector<HTMLInputElement>('[aria-label="重量区间下限"]')?.value).toBe('10')
    expect(host.querySelector<HTMLInputElement>('[aria-label="重量区间上限"]')?.value).toBe('15')
  })

  it('keeps failure reps independent of the load selector', () => {
    vi.stubEnv('VITE_FREE_WEIGHT_ENABLED', 'true')
    render([emptyRow('pullup')]); openBlockDay(host)
    const failure = [...host.querySelectorAll('button')].find(button => button.textContent === '力竭')
    expect(failure).toBeDefined()
    act(() => failure!.click())
    expect(reps().value).toBe('力竭')
    expect(weight().value).toBe('bodyweight')
    expect(host.textContent).not.toContain('1 处待核对')
    act(() => change(weight(), 'free_weight'))
    expect(reps().value).toBe('力竭')
  })

  it.each([['raise', '引体向上', 'bodyweight'], ['pullup', '侧平举', 'free_weight']])('reclassifies automatic %s after rebinding to %s', async (id, name, expected) => {
    vi.stubEnv('VITE_FREE_WEIGHT_ENABLED', 'true'); vi.useFakeTimers()
    render([emptyRow(id)]); openBlockDay(host)
    act(() => change(reps(), '15'))
    const input = host.querySelector<HTMLInputElement>('input[placeholder="输入动作…"]')!
    act(() => input.focus())
    act(() => change(input, name))
    const option = host.querySelector<HTMLElement>('[data-popover] [role="option"]')!
    expect(option.textContent).toContain(name)
    act(() => option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })))
    await act(async () => { await vi.advanceTimersByTimeAsync(800) })
    expect(loadDraftMirror('load-types')?.content.weeks[0].days[0].rows[0]).toMatchObject({ name, exerciseId: id === 'raise' ? 'pullup' : 'raise', autoLoadMode: true })
    expect(weight().value).toBe(expected)
    expect(host.textContent).not.toContain('1 处待核对')
  })

  it.each(['rpe_range', 'weight_range', 'fixed_weight', 'rpe', 'rir', 'pct'] as const)('ignores hidden legacy %s intensity when restoring bodyweight', (mode) => {
    render([emptyRow('pullup', { mode: 'bodyweight', reps: '15', intensity: { mode, value: '7', high: '8' } })])
    openBlockDay(host)
    expect(host.querySelector<HTMLSelectElement>('[aria-label="强度类型"]')?.value).toBe('')
    expect(host.textContent).not.toContain('1 处待核对')
  })

  it('distinguishes newly enabled bodyweight intensity from a legacy hidden target in recovery hashes', async () => {
    vi.useFakeTimers()
    render([emptyRow('pullup', { mode: 'bodyweight', reps: '15', intensity: { mode: 'rpe', value: '8', high: '' } })]); openBlockDay(host)
    act(() => change(host.querySelector<HTMLSelectElement>('[aria-label="强度类型"]')!, 'rpe'))
    act(() => change(host.querySelector<HTMLInputElement>('[aria-label="统一强度值"]')!, '8'))
    await act(async () => { await vi.advanceTimersByTimeAsync(800) })
    const saved = loadDraftMirror('load-types')!
    expect(saved.content.weeks[0].days[0].rows[0].bodyweightIntensity).toBe(true)
    const legacy = structuredClone(saved.content)
    delete legacy.weeks[0].days[0].rows[0].bodyweightIntensity
    expect(saved.contentHash).not.toBe(draftContentHash(legacy))
    const oldHash = draftContentHash(legacy)
    legacy.weeks[0].days[0].rows[0].bodyweightIntensity = false
    expect(draftContentHash(legacy)).toBe(oldHash)
  })

  it('shows approved collapsed shorthand for both load types and unchanged fixed weight', () => {
    render([
      emptyRow('pullup', { mode: 'bodyweight', reps: '力竭' }),
      emptyRow('raise', { reps: '15', weightMode: 'free_weight', intensity: { mode: 'rpe', value: '8', high: '' } }),
      blockRow('squat', { reps: '5', boxes: Array.from({ length: 4 }, () => ({ val: '142.5', empty: false })) }),
    ])
    expect(host.textContent).toContain('3×力竭 · 自重')
    expect(host.textContent).toContain('3×15 @8 · 自选')
    expect(host.textContent).toContain('4×5 · 142.5')
  })
})
