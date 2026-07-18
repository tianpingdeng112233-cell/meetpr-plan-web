import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExerciseResponse, PlanSetResponse, PlanWithChildren } from '../../api/types'
import { ExerciseIndex } from '../plan-editor/exerciseIndex'
import type { Catalog } from '../plan-editor/mapping'
import { jtsPhaseStorageKey } from '../plan-editor/jtsVolumeBands'

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
    id: 'plan-jts',
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
    days: [{
      id: 'day',
      plan_id: 'plan-jts',
      day_of_week: 1,
      week_number: 1,
      sort_order: 0,
      exercises: [
        { id: 'squat-row', plan_day_id: 'day', exercise_id: 'squat', is_main_lift: true, sort_order: 0, notes: null, sets: sets('squat', 2) },
        { id: 'bench-row', plan_day_id: 'day', exercise_id: 'bench', is_main_lift: true, sort_order: 1, notes: null, sets: sets('bench', 17) },
        { id: 'deadlift-row', plan_day_id: 'day', exercise_id: 'deadlift', is_main_lift: true, sort_order: 2, notes: null, sets: sets('deadlift', 4) },
      ],
    }],
  }
}

async function settle(): Promise<void> {
  for (let index = 0; index < 8; index++) await Promise.resolve()
}

describe('StudentDetail JTS plan capacity card', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-08T12:00:00Z'))
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
        key: (position: number) => [...stored.keys()][position] ?? null,
        get length() { return stored.size },
      } satisfies Storage,
    })
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

  it('restores the shared phase and renders below/normal/above classifications', async () => {
    const plan = publishedPlan()
    api.getStudentPlans.mockResolvedValue([plan])
    api.getPlan.mockResolvedValue(plan)
    window.localStorage.setItem(jtsPhaseStorageKey(plan.id), 'strength')
    await renderDetail()

    expect(host.querySelector<HTMLSelectElement>('[aria-label="JTS 容量提示相位"]')?.value).toBe('strength')
    const squat = host.querySelector<HTMLElement>('[data-lift-family="squat"]')!
    const bench = host.querySelector<HTMLElement>('[data-lift-family="bench"]')!
    const deadlift = host.querySelector<HTMLElement>('[data-lift-family="deadlift"]')!
    expect(squat.dataset.jtsClassification).toBe('below_mev')
    expect(squat.querySelector('.student-capacity-chip')?.classList.contains('week-capacity-lift-below')).toBe(true)
    expect(bench.dataset.jtsClassification).toBe('above_mrv')
    expect(bench.querySelector('.student-capacity-chip')?.classList.contains('week-capacity-lift-above')).toBe(true)
    expect(deadlift.dataset.jtsClassification).toBe('mrv_band')
    expect(deadlift.querySelector('.student-capacity-chip')?.classList.contains('week-capacity-lift-normal')).toBe(true)
    expect(squat.textContent).toContain('低于 MEV 参考带')
    expect(squat.textContent).toContain('MEV 3-8 / MRV 6-12')
    expect(bench.textContent).toContain('高于 MRV 参考带上限')
    expect(host.textContent).toContain('参考区间来自 JTS 手册,MRV 是中循环概念——蓄积末周有意超出属正常安排,仅供参考,不校验不拦截')
    expect(deadlift.textContent).toContain('硬拉容量个体差异大,约半数人最佳频率为每周 1 次,起点常为深蹲的 1/2-2/3')

    const select = host.querySelector<HTMLSelectElement>('[aria-label="JTS 容量提示相位"]')!
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(select, 'peaking')
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(window.localStorage.getItem(jtsPhaseStorageKey(plan.id))).toBe('peaking')
  })
})
