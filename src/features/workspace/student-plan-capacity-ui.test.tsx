import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExerciseResponse, PlanSetResponse, PlanWithChildren } from '../../api/types'
import { ExerciseIndex } from '../plan-editor/exerciseIndex'
import type { Catalog } from '../plan-editor/mapping'

const api = vi.hoisted(() => ({
  getStudentPlans: vi.fn(),
  getPlan: vi.fn(),
  getStudentOnboarding: vi.fn(),
  getExerciseStatsOverview: vi.fn(),
  getExerciseStats: vi.fn(),
}))

vi.mock('../../api/plans', () => ({
  getStudentPlans: api.getStudentPlans,
  getPlan: api.getPlan,
  getStudentOnboarding: api.getStudentOnboarding,
}))
vi.mock('../../api/coach', () => ({
  getExerciseStatsOverview: api.getExerciseStatsOverview,
  getExerciseStats: api.getExerciseStats,
}))

import { StudentDetail } from './StatsViews'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const exercises: ExerciseResponse[] = [
  ['squat', '深蹲', 'squat'],
  ['bench', '卧推', 'bench'],
  ['deadlift', '硬拉', 'deadlift'],
].map(([id, name, family]) => ({
  id,
  name,
  name_en: null,
  exercise_type: 'main_lift',
  main_lift_family: family as ExerciseResponse['main_lift_family'],
  is_competition_lift: true,
  muscle_groups: [],
  equipment: [],
  movement_pattern: [],
  competition_stance: null,
  created_by_coach_id: null,
  created_at: '2026-01-01T00:00:00Z',
}))
const catalog: Catalog = new Map(exercises.map((exercise) => [exercise.id, { name: exercise.name, custom: false }]))
const index = new ExerciseIndex(exercises)

function sets(exerciseId: string, count: number): PlanSetResponse[] {
  return Array.from({ length: count }, (_, offset) => ({
    id: `${exerciseId}-set-${offset + 1}`,
    plan_exercise_id: `${exerciseId}-row`,
    set_number: offset + 1,
    target_reps: 5,
    target_reps_max: null,
    intensity_mode: 'weight',
    target_value: '100',
    set_type: 'working',
    rest_seconds: null,
    coach_note: null,
    created_at: '2026-01-01T00:00:00Z',
  }))
}

function publishedPlan(): PlanWithChildren {
  return {
    id: 'plan-capacity',
    coach_id: 'coach',
    trainee_id: 'student',
    name: '力量周期',
    start_date: '2026-01-05',
    end_date: '2026-01-11',
    plan_weeks: 1,
    source: 'coach',
    source_template_id: null,
    status: 'published',
    kind: 'regular',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
    total_shift_days: 0,
    latest_shift_created_at: null,
    latest_shift: null,
    days: [{
      id: 'day',
      plan_id: 'plan-capacity',
      day_of_week: 1,
      week_number: 1,
      sort_order: 0,
      shifted_to_date: null,
      exercises: [
        { id: 'squat-row', plan_day_id: 'day', exercise_id: 'squat', is_main_lift: true, sort_order: 0, target: null, notes: null, sets: sets('squat', 2) },
        { id: 'bench-row', plan_day_id: 'day', exercise_id: 'bench', is_main_lift: true, sort_order: 1, target: null, notes: null, sets: sets('bench', 17) },
        { id: 'deadlift-row', plan_day_id: 'day', exercise_id: 'deadlift', is_main_lift: true, sort_order: 2, target: null, notes: null, sets: sets('deadlift', 4) },
      ],
    }],
  }
}

async function settle(): Promise<void> {
  for (let index = 0; index < 8; index++) await Promise.resolve()
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

function overview(squat: number) {
  return {
    exercises: [],
    one_rm: { squat, bench: null, deadlift: null },
    last_trained_at: null,
    recent_4w: { trained_days: 0, total_planned_days: 0, completion_rate: 0 },
  }
}

describe('StudentDetail plan capacity card', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-08T12:00:00Z'))
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    api.getStudentOnboarding.mockResolvedValue(null)
    api.getExerciseStatsOverview.mockResolvedValue({
      exercises: [],
      one_rm: { squat: null, bench: null, deadlift: null },
      last_trained_at: null,
      recent_4w: { trained_days: 0, total_planned_days: 0, completion_rate: 0 },
    })
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.useRealTimers()
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  async function renderDetail(): Promise<void> {
    await act(async () => {
      root.render(<StudentDetail
        students={[{ id: 'student', display_name: '学员', status: 'active', evaluation: null }]}
        studentId="student"
        onStudent={vi.fn()}
        onBack={vi.fn()}
        catalog={catalog}
        index={index}
      />)
      await settle()
    })
  }

  it('degrades inside the card when the student has no plan', async () => {
    api.getStudentPlans.mockResolvedValue([])
    await renderDetail()

    expect(host.querySelector('[data-testid="student-plan-capacity"]')?.textContent).toContain('暂无计划容量数据')
    expect(api.getPlan).not.toHaveBeenCalled()
  })

  it('renders plain S/B/D set tiles for the located current week', async () => {
    const plan = publishedPlan()
    api.getStudentPlans.mockResolvedValue([plan])
    api.getPlan.mockResolvedValue(plan)
    await renderDetail()

    const card = host.querySelector<HTMLElement>('[data-testid="student-plan-capacity"]')!
    expect(card.querySelector('h3')?.textContent).toBe('本周计划容量')
    expect(card.textContent).toContain('力量周期 · 第 1 周')
    expect(card.querySelectorAll('select')).toHaveLength(0)
    const squat = host.querySelector<HTMLElement>('[data-lift-family="squat"]')!
    const bench = host.querySelector<HTMLElement>('[data-lift-family="bench"]')!
    const deadlift = host.querySelector<HTMLElement>('[data-lift-family="deadlift"]')!
    expect(squat.textContent).toBe('S2组')
    expect(bench.textContent).toBe('B17组')
    expect(deadlift.textContent).toBe('D4组')
    expect(card.querySelectorAll('.student-capacity-lift')).toHaveLength(3)
  })

  it('discards a slow previous student response after switching students', async () => {
    const oldOverview = deferred<ReturnType<typeof overview>>()
    const newOverview = deferred<ReturnType<typeof overview>>()
    const oldProfile = deferred<null>()
    const newProfile = deferred<null>()
    api.getStudentPlans.mockResolvedValue([])
    api.getExerciseStatsOverview.mockImplementation((studentId: string) => (
      studentId === 'old-student' ? oldOverview.promise : newOverview.promise
    ))
    api.getStudentOnboarding.mockImplementation((studentId: string) => (
      studentId === 'old-student' ? oldProfile.promise : newProfile.promise
    ))
    const students = [
      { id: 'old-student', display_name: '旧学员', status: 'active' as const, evaluation: null },
      { id: 'new-student', display_name: '新学员', status: 'active' as const, evaluation: null },
    ]

    await act(async () => {
      root.render(<StudentDetail students={students} studentId="old-student" onStudent={vi.fn()} onBack={vi.fn()} catalog={catalog} index={index} />)
      await settle()
      root.render(<StudentDetail students={students} studentId="new-student" onStudent={vi.fn()} onBack={vi.fn()} catalog={catalog} index={index} />)
      newOverview.resolve(overview(222))
      newProfile.resolve(null)
      await settle()
    })
    expect(host.textContent).toContain('222深蹲')

    await act(async () => {
      oldOverview.resolve(overview(111))
      oldProfile.resolve(null)
      await settle()
    })
    expect(host.textContent).toContain('222深蹲')
    expect(host.textContent).not.toContain('111深蹲')
  })
})
