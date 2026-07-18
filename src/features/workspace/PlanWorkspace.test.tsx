import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExerciseResponse, PlanWithChildren } from '../../api/types'
import type { Week } from '../plan-editor/types'

const api = vi.hoisted(() => ({
  getCoachStudents: vi.fn(),
  getStudentPlans: vi.fn(),
  getPlan: vi.fn(),
  getStudentOnboarding: vi.fn(),
  getBindRequests: vi.fn(),
  listExercises: vi.fn(),
}))

vi.mock('../../api/plans', () => ({
  getCoachStudents: api.getCoachStudents,
  getStudentPlans: api.getStudentPlans,
  getPlan: api.getPlan,
  getStudentOnboarding: api.getStudentOnboarding,
  publishPlan: vi.fn(),
  createPlan: vi.fn(),
  patchPlan: vi.fn(),
  markImportedHistory: vi.fn(),
  renameCoachStudent: vi.fn(),
  deletePlan: vi.fn(),
}))
vi.mock('../../api/exercises', () => ({
  listExercises: api.listExercises,
  createCustomExercise: vi.fn(),
}))
vi.mock('../../api/coach', () => ({
  getBindRequests: api.getBindRequests,
  refreshCoachStudents: vi.fn(),
}))
vi.mock('../plan-editor/PlanEditor', () => ({
  PlanEditor: ({ initialWeeks, onLeaveGuardChange }: {
    initialWeeks: Week[]
    onLeaveGuardChange?: (guard: (() => Promise<boolean>) | null) => void
  }) => {
    useEffect(() => {
      onLeaveGuardChange?.(async () => true)
      return () => onLeaveGuardChange?.(null)
    }, [onLeaveGuardChange])
    return <div data-testid="editor-note">{initialWeeks[0]?.days[0]?.rows[0]?.note}</div>
  },
}))
vi.mock('../catalog/CatalogPage', () => ({
  CatalogPage: ({ onUseExercise }: { onUseExercise: () => void }) => (
    <button type="button" onClick={onUseExercise}>使用动作并返回编辑器</button>
  ),
}))

import { PlanWorkspace } from './PlanWorkspace'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const exercise: ExerciseResponse = {
  id: 'exercise', name: '深蹲', name_en: null, exercise_type: 'main_lift', main_lift_family: 'squat',
  is_competition_lift: true, muscle_groups: [], equipment: [], movement_pattern: [],
  competition_stance: null, created_by_coach_id: null, created_at: '2026-01-01T00:00:00Z',
}

function plan(note: string): PlanWithChildren {
  return {
    id: 'plan', coach_id: 'coach', trainee_id: 'student', name: '计划',
    start_date: '2026-01-05', end_date: '2026-01-11', plan_weeks: 1,
    source: 'coach', source_template_id: null, status: 'draft', kind: 'regular',
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    days: [{
      id: 'day', plan_id: 'plan', day_of_week: 1, week_number: 1, sort_order: 0,
      exercises: [{
        id: 'plan-exercise', plan_day_id: 'day', exercise_id: 'exercise', is_main_lift: true,
        sort_order: 0, notes: note, sets: [{
          id: 'set', plan_exercise_id: 'plan-exercise', set_number: 1, target_reps: 5,
          target_reps_max: null, intensity_mode: 'weight', target_value: '100', set_type: 'working',
          rest_seconds: null, coach_note: null, created_at: '2026-01-01T00:00:00Z',
        }],
      }],
    }],
  }
}

function clickButton(host: HTMLElement, label: string): void {
  const button = [...host.querySelectorAll('button')].find((item) => item.textContent?.includes(label))
  if (!button) throw new Error(`button not found: ${label}`)
  button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

async function settle(): Promise<void> {
  for (let index = 0; index < 8; index++) await Promise.resolve()
}

describe('PlanWorkspace editor remount', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
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
    api.listExercises.mockResolvedValue([exercise])
    api.getCoachStudents.mockResolvedValue([{ id: 'student', display_name: '学员', status: 'active', evaluation: null }])
    api.getStudentPlans.mockResolvedValue([plan('加载时快照')])
    api.getStudentOnboarding.mockResolvedValue(null)
    api.getBindRequests.mockResolvedValue([])
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  it('re-fetches the current plan and mounts the editor from the latest server weeks', async () => {
    api.getPlan
      .mockResolvedValueOnce(plan('加载时快照'))
      .mockResolvedValueOnce(plan('服务端最新备注'))

    await act(async () => {
      root.render(<PlanWorkspace onLogout={vi.fn()} />)
      await settle()
    })
    expect(host.querySelector('[data-testid="editor-note"]')?.textContent).toBe('加载时快照')

    await act(async () => {
      clickButton(host, '动作库')
      await settle()
    })
    expect(host.querySelector('[data-testid="editor-note"]')).toBeNull()

    await act(async () => {
      clickButton(host, '计划编写')
      await settle()
    })

    expect(api.getPlan).toHaveBeenCalledTimes(2)
    expect(host.querySelector('[data-testid="editor-note"]')?.textContent).toBe('服务端最新备注')
  })
})
