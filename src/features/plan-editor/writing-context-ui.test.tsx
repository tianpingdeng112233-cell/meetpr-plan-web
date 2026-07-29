import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlanEditor } from './PlanEditor'
import type { DayCol, ExerciseRow, Week } from './types'
import type { StudentOnboardingProfile } from '../../api/types'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** Unbound row on purpose: level 1 needs no /exercise-stats round trip. */
function row(id: string): ExerciseRow {
  return {
    id, serverRowId: null, serverSortOrder: null, hasLogs: false, conflictMessage: null,
    exerciseId: null, name: id, ku: false, custom: false, isMain: true, aux: false,
    reps: '5', mode: 'kg', boxes: [{ val: '100', empty: false }], note: '',
  }
}

function week(): Week {
  const days: DayCol[] = [{ dow: 0, dowLabel: '周一', dateLabel: '7/1', rest: false, rows: [row('低杠位深蹲')] }]
  return { num: 1, num2: '01', range: '', isCurrent: false, vol: '', days }
}

const profile = {
  gender: 'male', training_years: 7, training_days: [1, 2, 3],
} as unknown as StudentOnboardingProfile

function panel(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.writing-panel')
}

/**
 * Regression guard for the card-3 restyle, which dropped the <WritingContextPanel>
 * mount while leaving the module in the tree. Everything still compiled, the unit
 * tests over its pure helpers still passed, and Rollup quietly shook the whole
 * panel out of the bundle — so the coach lost it in production with nothing red.
 */
describe('writing context panel', () => {
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

  function renderEditor() {
    act(() => root?.render(
      <PlanEditor initialWeeks={[week()]} weeksCount={1} studentId="student-1" studentName="吕子豪"
        planName="Monster" onboardingProfile={profile} />,
    ))
  }

  function selectDay() {
    const day = host.querySelector<HTMLElement>('.day[data-dow]')
    act(() => { day?.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
  }

  it('mounts the panel for the selected day and shows the onboarding profile', () => {
    renderEditor()
    expect(panel()).toBeNull()

    selectDay()
    expect(panel()).not.toBeNull()
    expect(panel()?.textContent).toContain('学员画像')
    expect(panel()?.textContent).toContain('吕子豪')
  })

  it('closes on ✕ and comes back through the day-head recall button', () => {
    renderEditor()
    selectDay()

    const close = panel()?.querySelector<HTMLButtonElement>('header button')
    act(() => close?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(panel()).toBeNull()

    const recall = host.querySelector<HTMLButtonElement>('.day.sel .context-recall')
    expect(recall).not.toBeNull()
    act(() => recall?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(panel()).not.toBeNull()
  })

  it('stays hidden without a student id, the way the sample preview runs', () => {
    act(() => root?.render(
      <PlanEditor initialWeeks={[week()]} weeksCount={1} studentName="示例学员" planName="示例计划" />,
    ))
    selectDay()
    expect(panel()).toBeNull()
  })
})
