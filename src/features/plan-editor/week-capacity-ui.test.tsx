import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlanEditor } from './PlanEditor'
import { WeekCapacitySummary } from './components/WeekCapacitySummary'
import type { DayCol, ExerciseRow, Week } from './types'
import { jtsPhaseStorageKey } from './jtsVolumeBands'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function row(id: string, count: number, weight: string): ExerciseRow {
  return {
    id,
    serverRowId: null,
    serverSortOrder: null,
    hasLogs: false,
    conflictMessage: null,
    exerciseId: null,
    name: id,
    ku: false,
    custom: false,
    isMain: true,
    aux: false,
    reps: '5',
    mode: 'kg',
    boxes: Array.from({ length: count }, () => ({ val: weight, empty: weight === '' })),
    note: '',
  }
}

function week(num: number, rows: ExerciseRow[], vol: string): Week {
  const days: DayCol[] = [{ dow: 0, dowLabel: '周一', dateLabel: '7/1', rest: false, rows }]
  return { num, num2: String(num).padStart(2, '0'), range: '', isCurrent: false, vol, days }
}

describe('week-band capacity UI', () => {
  let host: HTMLDivElement
  let root: Root | null

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    Object.defineProperty(Element.prototype, 'scrollIntoView', { value: vi.fn(), configurable: true })
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
  })

  afterEach(() => {
    if (root) act(() => root?.unmount())
    host.remove()
    root = null
    vi.restoreAllMocks()
  })

  it('renders derived values, definitions and second-week trends instead of legacy vol', () => {
    act(() => root?.render(
      <PlanEditor
        initialWeeks={[
          week(1, [row('main-1', 2, '100')], 'LEGACY-WEEK-VOL'),
          week(2, [row('main-2', 3, '100')], 'OTHER-FAKE-VOL'),
        ]}
        weeksCount={2}
        studentName="学员"
        planName="计划"
      />,
    ))

    const summaries = host.querySelectorAll<HTMLElement>('[data-week-summary]')
    expect(summaries).toHaveLength(2)
    expect(summaries[0].textContent).toContain('其2')
    expect(summaries[0].textContent).toContain('吨位 1t')
    expect(summaries[1].textContent).toContain('总 3组↑50.0%')
    expect(summaries[1].textContent).toContain('吨位 1.5t↑50.0%')
    expect(summaries[1].querySelector('[role="tooltip"]')?.textContent).toContain('吨位仅计入「kg 模式 + 重量可解析 + reps 可解析」的组')
    expect(host.textContent).not.toContain('LEGACY-WEEK-VOL')
    expect(host.textContent).not.toContain('OTHER-FAKE-VOL')
    expect(host.querySelector<HTMLSelectElement>('[aria-label="JTS 容量提示相位"]')?.value).toBe('off')
    expect([...host.querySelectorAll('[data-lift-family]')].every((item) => (
      !item.hasAttribute('data-jts-classification')
      && item.className === 'week-capacity-lift'
    ))).toBe(true)
  })

  it('persists the selected phase by plan and restores its soft-hint tooltip', () => {
    window.localStorage.setItem(jtsPhaseStorageKey('plan-jts'), 'strength')
    act(() => root?.render(
      <PlanEditor
        initialWeeks={[week(1, [row('main', 3, '100')], '')]}
        weeksCount={1}
        studentName="学员"
        planName="计划"
        currentPlanId="plan-jts"
      />,
    ))

    const select = host.querySelector<HTMLSelectElement>('[aria-label="JTS 容量提示相位"]')!
    expect(select.value).toBe('strength')
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(select, 'hypertrophy')
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })

    expect(select.value).toBe('hypertrophy')
    expect(window.localStorage.getItem(jtsPhaseStorageKey('plan-jts'))).toBe('hypertrophy')
    expect(host.querySelector('[role="tooltip"]')?.textContent).toContain('JTS 增肌期每周 working sets 参考')
    expect(host.querySelector('[role="tooltip"]')?.textContent).toContain('参考区间来自 JTS 手册,MRV 是中循环概念——蓄积末周有意超出属正常安排,仅供参考,不校验不拦截')
    expect(host.querySelector('[role="tooltip"]')?.textContent).toContain('硬拉容量个体差异大,约半数人最佳频率为每周 1 次,起点常为深蹲的 1/2-2/3')
  })

  it('colors only the S/B/D numbers that have a non-zero phase classification', () => {
    act(() => root?.render(
      <WeekCapacitySummary
        weekNumber={1}
        summary={{
          squatSets: 4, benchSets: 21, deadliftSets: 10, otherMainSets: 0,
          auxiliarySets: 0, totalSets: 35, tonnage: 0,
        }}
        totalSetsTrend={null}
        tonnageTrend={null}
        phase="hypertrophy"
      />,
    ))

    const squat = host.querySelector<HTMLElement>('[data-lift-family="squat"]')!
    const bench = host.querySelector<HTMLElement>('[data-lift-family="bench"]')!
    const deadlift = host.querySelector<HTMLElement>('[data-lift-family="deadlift"]')!
    expect(squat.dataset.jtsClassification).toBe('below_mev')
    expect(squat.classList.contains('week-capacity-lift-below')).toBe(true)
    expect(bench.dataset.jtsClassification).toBe('above_mrv')
    expect(bench.classList.contains('week-capacity-lift-above')).toBe(true)
    expect(deadlift.dataset.jtsClassification).toBe('mrv_band')
    expect(deadlift.classList.contains('week-capacity-lift-normal')).toBe(true)
  })
})
