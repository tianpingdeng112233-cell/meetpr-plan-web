import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlanEditor } from './PlanEditor'
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
  })
})
