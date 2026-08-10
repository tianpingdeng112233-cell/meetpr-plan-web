import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StudentOnboardingProfile } from '../../api/types'
import { PlanEditor } from './PlanEditor'
import { RAIL_MODE_KEY } from './components/ContextRail'
import type { DayCol, ExerciseRow, Week } from './types'

const api = vi.hoisted(() => ({ getExerciseStats: vi.fn() }))

vi.mock('../../api/coach', () => ({ getExerciseStats: api.getExerciseStats }))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function row(id = 'squat', name = '竞技深蹲', isMain = true): ExerciseRow {
  return {
    id, serverRowId: null, serverSortOrder: null, hasLogs: false, conflictMessage: null,
    exerciseId: id, name, ku: true, custom: false, isMain, target: null, aux: false,
    reps: '—', mode: 'kg', boxes: [], note: '',
  }
}

function week(): Week {
  const days: DayCol[] = [{
    dow: 0, dowLabel: '周一', dateLabel: '7/27', rest: false, rows: [row(), row('bench', '竞技卧推', false)],
  }]
  return { num: 1, num2: '01', range: '7/27–8/2', isCurrent: false, vol: '', days }
}

const profile = {
  gender: 'male', training_years: 7, training_days: [1, 2, 3],
  squat_1rm_kg: '240', bench_1rm_kg: '100', deadlift_1rm_kg: '270',
  squat_stance: 'high_bar', deadlift_style: 'sumo', bench_grip: 'standard',
  injury_areas: [], injury_notes: '', is_competing: false,
  competition_date: null, target_weight_class: null, note_to_coach: '',
} as unknown as StudentOnboardingProfile

function setInput(input: HTMLInputElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('plan editor context rail', () => {
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
    api.getExerciseStats.mockReturnValue(new Promise(() => {}))
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    Object.defineProperty(Element.prototype, 'scrollIntoView', { value: vi.fn(), configurable: true })
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    window.localStorage.clear()
    vi.restoreAllMocks()
  })

  function renderEditor() {
    act(() => root.render(
      <PlanEditor initialWeeks={[week()]} weeksCount={1} studentId="student-1" studentName="吕子豪"
        planName="Monster" onboardingProfile={profile} />,
    ))
  }

  function selectDay() {
    const day = host.querySelector<HTMLElement>('.day[data-dow]')!
    act(() => day.dispatchEvent(new MouseEvent('click', { bubbles: true })))
  }

  function rail(): HTMLElement | null {
    return host.querySelector<HTMLElement>('[data-context-rail]')
  }

  it('shows the selected student profile and onboarding maxes without inline tokens', () => {
    renderEditor()
    expect(rail()).toBeNull()

    selectDay()

    expect(rail()?.textContent).toContain('吕子豪')
    expect(rail()?.textContent).toContain('学员画像')
    expect(rail()?.textContent).toContain('240')
    expect(rail()?.textContent).toContain('100')
    expect(rail()?.textContent).toContain('270')
    expect(host.querySelector('[data-exercise-info-tokens]')).toBeNull()
  })

  it('auto-collapses a complete row and returns when strength is cleared', () => {
    renderEditor()
    selectDay()

    const exerciseRow = host.querySelector<HTMLElement>('[data-rowid="squat"]')!
    act(() => exerciseRow.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })))

    const sets = exerciseRow.querySelector<HTMLInputElement>('[data-c="sets"] input')!
    act(() => setInput(sets, '1'))
    const reps = exerciseRow.querySelector<HTMLInputElement>('[data-guard-field="reps"]')!
    act(() => setInput(reps, '5'))
    const strength = exerciseRow.querySelector<HTMLInputElement>('[data-guard-field="weight"]')!
    act(() => setInput(strength, '100'))

    expect(rail()).toBeNull()

    // Recall re-opens the row the coach came back for, not the day-level profile.
    const recall = host.querySelector<HTMLButtonElement>('.day.sel .context-recall')!
    act(() => recall.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(rail()?.dataset.contextState).toBe('4')
    expect(rail()?.textContent).toContain('竞技深蹲')
    expect(host.querySelector('.exrow.row-sel')).not.toBeNull()

    act(() => setInput(strength, ''))
    expect(rail()).not.toBeNull()
  })

  it('recalls a manually closed rail from the selected day head', () => {
    renderEditor()
    selectDay()

    const close = rail()?.querySelector<HTMLButtonElement>('[aria-label="关闭上下文栏"]')
    act(() => close?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(rail()).toBeNull()

    const recall = host.querySelector<HTMLButtonElement>('.day.sel .context-recall')
    expect(recall).not.toBeNull()
    act(() => recall?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(rail()).not.toBeNull()
  })

  it('follows the selection instead of the day when a rail was dismissed', () => {
    renderEditor()
    selectDay()

    const squat = host.querySelector<HTMLElement>('[data-rowid="squat"]')!
    act(() => squat.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })))
    act(() => squat.querySelector<HTMLInputElement>('[data-plan-cell="name"] input')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true })))
    const close = rail()!.querySelector<HTMLButtonElement>('[aria-label="关闭上下文栏"]')!
    act(() => close.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(rail()).toBeNull()

    // Keyboard navigation goes through moveCellSelection, which touches neither
    // selection handler — the rail must still follow it to the next row.
    expect(host.querySelector('.plan-cell-selected')).not.toBeNull()
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })) })
    expect(host.querySelector('[data-rowid="bench"].row-sel')).not.toBeNull()
    expect(rail()?.textContent).toContain('竞技卧推')
  })

  it('drops the recall override once the recalled row is edited again', () => {
    renderEditor()
    selectDay()

    const exerciseRow = host.querySelector<HTMLElement>('[data-rowid="squat"]')!
    act(() => exerciseRow.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })))
    const sets = exerciseRow.querySelector<HTMLInputElement>('[data-c="sets"] input')!
    act(() => setInput(sets, '1'))
    const reps = exerciseRow.querySelector<HTMLInputElement>('[data-guard-field="reps"]')!
    act(() => setInput(reps, '5'))
    const strength = exerciseRow.querySelector<HTMLInputElement>('[data-guard-field="weight"]')!
    act(() => setInput(strength, '100'))
    expect(rail()).toBeNull()

    const recall = host.querySelector<HTMLButtonElement>('.day.sel .context-recall')!
    act(() => recall.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(rail()).not.toBeNull()

    // Editing the recalled row hands control back to the auto-collapse rule.
    act(() => setInput(strength, '105'))
    expect(rail()).toBeNull()
  })

  it('toggles between follow and right-edge modes and persists the preference', () => {
    renderEditor()
    selectDay()

    expect(rail()?.classList.contains('floating')).toBe(true)
    const dock = rail()?.querySelector<HTMLButtonElement>('[aria-label="改为固定在右缘"]')
    expect(dock?.textContent).toBe('⇥')
    act(() => dock?.dispatchEvent(new MouseEvent('click', { bubbles: true })))

    expect(rail()?.classList.contains('floating')).toBe(false)
    expect(host.querySelector('.plan-with-rail.rail-open')).not.toBeNull()
    expect(window.localStorage.getItem(RAIL_MODE_KEY)).toBe('dock')

    const follow = rail()?.querySelector<HTMLButtonElement>('[aria-label="改为跟着选中日"]')
    act(() => follow?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(rail()?.classList.contains('floating')).toBe(true)
    expect(window.localStorage.getItem(RAIL_MODE_KEY)).toBe('follow')
  })
})
