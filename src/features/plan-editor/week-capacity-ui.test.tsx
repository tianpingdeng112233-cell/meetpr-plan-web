import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlanEditor } from './PlanEditor'
import { WeekCapacitySummary } from './components/WeekCapacitySummary'
import type { DayCol, ExerciseRow, Week } from './types'

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
  })

  afterEach(() => {
    if (root) act(() => root?.unmount())
    host.remove()
    root = null
    vi.restoreAllMocks()
  })

  it('renders the plain summary beside the week title and keeps detail trends in the tooltip', () => {
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
    expect(summaries[0].querySelector('.week-capacity-plain')?.textContent).toBe('主项 2 组 · 辅项 0 组 · 总重 1,000 kg')
    expect(summaries[1].querySelector('.week-capacity-plain')?.textContent).toBe('主项 3 组 · 辅项 0 组 · 总重 1,500 kg')
    expect(summaries[1].querySelector('.week-capacity-plain')?.textContent).not.toContain('↑')
    expect(summaries[1].querySelector('[role="tooltip"]')?.textContent).toContain('总组数：3组 （较上周 ↑50.0%）')
    expect(summaries[1].querySelector('[role="tooltip"]')?.textContent).toContain('吨位：1,500 kg （较上周 ↑50.0%）')
    expect(summaries[1].querySelector('[role="tooltip"]')?.textContent).toContain('吨位仅计入「kg 模式 + 重量可解析 + reps 可解析」的组')
    const weekHeader = summaries[0].parentElement!
    expect([...weekHeader.children].indexOf(summaries[0])).toBe(3)
    expect(host.textContent).not.toContain('LEGACY-WEEK-VOL')
    expect(host.textContent).not.toContain('OTHER-FAKE-VOL')
    expect(host.querySelectorAll('select')).toHaveLength(0)
  })

  it('renders the simplified weekly form while preserving the full lift-family breakdown', () => {
    act(() => root?.render(
      <WeekCapacitySummary
        weekNumber={1}
        summary={{
          squatSets: 4, benchSets: 21, deadliftSets: 10, otherMainSets: 0,
          auxiliarySets: 0, totalSets: 35, tonnage: 0,
        }}
        totalSetsTrend={null}
        tonnageTrend={null}
      />,
    ))

    expect(host.querySelector('.week-capacity-plain')?.textContent).toBe('主项 35 组 · 辅项 0 组 · 总重 0 kg')
    expect(host.querySelector('[role="tooltip"]')?.textContent).toContain('深蹲族 4组 · 卧推族 21组 · 硬拉族 10组 · 其他主项 0组')
  })
})
