import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlanEditor } from './PlanEditor'
import { loadDraftMirror } from './draftMirror'
import type { DayCol, ExerciseRow, Week } from './types'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function row(id: string, pctAnchor?: ExerciseRow['pctAnchor']): ExerciseRow {
  return {
    id, serverRowId: null, serverSortOrder: null, hasLogs: false, conflictMessage: null,
    exerciseId: id, name: id, ku: true, custom: false, isMain: true,
    aux: false, reps: '5', mode: 'kg',
    intensity: { mode: 'pct', value: '75', high: '' },
    ...(pctAnchor ? { pctAnchor } : {}),
    intensityMode: 'uniform',
    intensityBoxes: [{ val: '75', empty: false }],
    weightMode: 'uniform', boxes: [{ val: '', empty: true }], note: '',
  }
}

function week(rows: ExerciseRow[]): Week {
  const days: DayCol[] = Array.from({ length: 7 }, (_, dow) => ({
    dow, dowLabel: `周${dow + 1}`, dateLabel: '', rest: dow !== 0, rows: dow === 0 ? rows : [],
  }))
  return { num: 1, num2: '01', range: '', isCurrent: true, vol: '', days }
}

function changeSelect(select: HTMLSelectElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(select, value)
  select.dispatchEvent(new Event('change', { bubbles: true }))
}

describe('pct anchor secondary selector', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    const stored = new Map<string, string>()
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => stored.get(key) ?? null,
        setItem: (key: string, value: string) => { stored.set(key, value) },
        removeItem: (key: string) => { stored.delete(key) },
        clear: () => stored.clear(),
        key: (index: number) => [...stored.keys()][index] ?? null,
        get length() { return stored.size },
      } satisfies Storage,
    })
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    Object.defineProperty(Element.prototype, 'scrollIntoView', { value: vi.fn(), configurable: true })
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.restoreAllMocks()
    localStorage.clear()
    vi.useRealTimers()
  })

  it('keeps the five intensity choices and resets the pct anchor after a type switch', () => {
    act(() => root.render(
      <PlanEditor initialWeeks={[week([row('深蹲', 'e1rm')])]} weeksCount={1} studentName="学员" planName="计划" />,
    ))

    const intensityType = host.querySelector<HTMLSelectElement>('[aria-label="强度类型"]')!
    expect([...intensityType.options].map((option) => option.textContent)).toEqual([
      '不设强度', '%', 'RPE', 'RIR', 'RPE 区间',
    ])
    expect(host.querySelector<HTMLSelectElement>('[aria-label="百分比锚点"]')?.value).toBe('e1rm')

    act(() => changeSelect(intensityType, 'rpe'))
    expect(host.querySelector('[aria-label="百分比锚点"]')).toBeNull()

    act(() => changeSelect(host.querySelector<HTMLSelectElement>('[aria-label="强度类型"]')!, 'pct'))
    expect(host.querySelector<HTMLSelectElement>('[aria-label="百分比锚点"]')?.value).toBe('one_rm')
  })

  it('shows only explicit lightweight annotations in read-only scan mode', () => {
    act(() => root.render(
      <PlanEditor
        initialWeeks={[week([row('默认'), row('估算', 'e1rm'), row('顶组', 'top_set')])]}
        weeksCount={1}
        studentName="学员"
        planName="历史计划"
        readOnly
      />,
    ))

    expect(host.querySelector('[aria-label="百分比锚点"]')).toBeNull()
    expect([...host.querySelectorAll<HTMLElement>('.pct-anchor-label')].map((item) => item.textContent))
      .toEqual(['×e1RM', '×顶组'])
    expect(host.querySelector('[data-rowid="默认"] .pct-anchor-label')).toBeNull()
  })

  it('shows a locked anchor as an annotation without rendering a selector', () => {
    const locked = { ...row('锁定', 'e1rm'), hasLogs: true }
    act(() => root.render(
      <PlanEditor initialWeeks={[week([locked])]} weeksCount={1} studentName="学员" planName="计划" />,
    ))

    expect(host.querySelector('[data-rowid="锁定"] [aria-label="百分比锚点"]')).toBeNull()
    expect(host.querySelector('[data-rowid="锁定"] .pct-anchor-label')?.textContent).toBe('×e1RM')
  })

  it.each(['weight_range', 'bodyweight'] as const)(
    'clears the anchor when switching pct to %s and restores the default when switching back',
    async (weightMode) => {
    vi.useFakeTimers()
    act(() => root.render(
      <PlanEditor initialWeeks={[week([row('深蹲', 'top_set')])]} weeksCount={1}
        studentName="学员" planName="计划" currentPlanId={`plan-${weightMode}`} />,
    ))

    act(() => changeSelect(host.querySelector<HTMLSelectElement>('[aria-label="重量模式"]')!, weightMode))
    await act(async () => { await vi.advanceTimersByTimeAsync(800) })

    const switched = loadDraftMirror(`plan-${weightMode}`)?.content.weeks[0].days[0].rows[0]
    expect(switched && Object.hasOwn(switched, 'pctAnchor')).toBe(false)

    if (weightMode === 'bodyweight') {
      act(() => changeSelect(host.querySelector<HTMLSelectElement>('[aria-label="重量模式"]')!, 'fixed_weight'))
    }
    act(() => changeSelect(host.querySelector<HTMLSelectElement>('[aria-label="强度类型"]')!, 'pct'))
    expect(host.querySelector<HTMLSelectElement>('[aria-label="百分比锚点"]')?.value).toBe('one_rm')
    },
  )
})
