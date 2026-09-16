import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { AdminPlanWithChildren } from '../api/admin'
import type { ChatSetRefV1, StudentVideo } from '../api/types'
import type { Week } from '../features/plan-editor/types'

const adminApi = vi.hoisted(() => ({
  overview: vi.fn(), users: vi.fn(), user: vi.fn(), bindings: vi.fn(),
  plans: vi.fn(), plan: vi.fn(), exerciseUsage: vi.fn(),
}))

vi.mock('../api/admin', () => ({
  getAdminOverview: adminApi.overview,
  getAdminUsers: adminApi.users,
  getAdminUser: adminApi.user,
  getAdminBindings: adminApi.bindings,
  getAdminPlans: adminApi.plans,
  getAdminPlan: adminApi.plan,
  getAdminExerciseUsage: adminApi.exerciseUsage,
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const CJK = /[一-鿿]/

async function settle() {
  for (let index = 0; index < 10; index++) await Promise.resolve()
}

function clickButton(host: HTMLElement, label: string) {
  const button = [...host.querySelectorAll('button')].find((item) => item.textContent?.trim() === label)
  if (!button) throw new Error(`button not found: ${label}`)
  button.click()
}

describe('English locale smoke', () => {
  beforeAll(async () => {
    const { setLocale } = await import('./locale')
    setLocale('en')
  })

  afterAll(async () => {
    const { setLocale } = await import('./locale')
    setLocale('zh')
  })

  it('renders the login page and PlanEditor top bar without CJK copy', async () => {
    const [{ LoginScreen }, { PlanEditor }] = await Promise.all([
      import('../features/auth/LoginScreen'),
      import('../features/plan-editor/PlanEditor'),
    ])
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => { root.render(<LoginScreen onLogin={() => undefined} onSampleMode={() => undefined} />) })
    expect(host.innerHTML).not.toMatch(CJK)

    const week: Week = {
      num: 1,
      num2: '01',
      range: 'Aug 18 – Aug 24',
      isCurrent: true,
      vol: '',
      days: Array.from({ length: 7 }, (_, dow) => ({
        dow,
        dowLabel: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][dow],
        dateLabel: `Aug ${18 + dow}`,
        rest: true,
        rows: [],
      })),
    }
    await act(async () => {
      root.render(<PlanEditor initialWeeks={[week]} weeksCount={1} studentName="Alex" planName="Strength plan" />)
    })
    const topBar = host.querySelector<HTMLElement>('[data-plan-context-bar]')
    expect(topBar).not.toBeNull()
    expect(topBar!.innerHTML).not.toMatch(CJK)

    act(() => root.unmount())
    host.remove()
  })

  it('renders catalog-backed exercise names in English in admin, videos, and set cards', async () => {
    const fullPlan: AdminPlanWithChildren = {
      id: 'plan-1', coach_id: 'coach-1', trainee_id: 'athlete-1', name: 'Strength block',
      start_date: '2026-08-18', end_date: '2026-08-24', plan_weeks: 1, source: 'coach',
      source_template_id: null, status: 'published', kind: 'regular',
      created_at: '2026-08-17T12:00:00Z', updated_at: '2026-08-18T12:00:00Z',
      total_shift_days: 0, latest_shift_created_at: null, latest_shift: null,
      days: [{
        id: 'day-1', plan_id: 'plan-1', day_of_week: 1, week_number: 1, sort_order: 0,
        shifted_to_date: null,
        exercises: [{
          id: 'plan-exercise-1', plan_day_id: 'day-1', exercise_id: 'exercise-1',
          exercise_name: '竞技深蹲', name_en: 'Competition Squat', is_main_lift: true,
          sort_order: 0, target: null, notes: null,
          sets: [{
            id: 'set-1', plan_exercise_id: 'plan-exercise-1', set_number: 1,
            target_reps: 1, target_reps_max: null, intensity_mode: 'weight', target_value: '140.00',
            set_type: 'working', rest_seconds: null, coach_note: null,
            created_at: '2026-08-18T12:00:00Z',
          }],
        }],
      }],
    }
    adminApi.overview.mockResolvedValue({
      stats: { coaches: 0, coachedStudents: 0, selfTrainStudents: 0, activeBonds: 0, publishedPlans: 1 },
      recentUsers: [], recentPlans: [],
    })
    adminApi.users.mockResolvedValue({ users: [] })
    adminApi.bindings.mockResolvedValue({ bindings: [] })
    adminApi.plans.mockResolvedValue({ plans: [{
      id: 'plan-1', name: 'Strength block', coachId: 'coach-1', coachName: 'Coach Taylor',
      traineeId: 'athlete-1', studentName: 'Alex', status: 'published', weeks: 1,
      startDate: '2026-08-18', endDate: '2026-08-24', createdAt: '2026-08-17T12:00:00Z',
    }] })
    adminApi.plan.mockResolvedValue(fullPlan)
    adminApi.exerciseUsage.mockResolvedValue({ exercises: [{
      exercise_id: 'exercise-1', name: '竞技深蹲', name_en: 'Competition Squat',
      exercise_type: 'main_lift', plan_count: 1, coach_count: 1,
    }] })

    const [{ AdminWorkspace }, { VideosPage }, { SetRefCard }] = await Promise.all([
      import('../features/admin/AdminWorkspace'),
      import('../features/workspace/VideosPage'),
      import('../features/chat/setRef'),
    ])
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => { root.render(<AdminWorkspace onLogout={() => undefined} />); await settle() })
    await act(async () => { clickButton(host, 'Exercise library'); await settle() })
    const library = host.querySelector<HTMLElement>('[data-testid="admin-exercises"]')!
    expect(library.textContent).toContain('Competition Squat')
    expect(library.innerHTML).not.toMatch(CJK)

    await act(async () => { clickButton(host, 'Plan overview'); await settle() })
    await act(async () => {
      const planButton = [...host.querySelectorAll('button')].find((item) => item.textContent?.includes('Strength block'))
      planButton?.click()
      await settle()
    })
    const detail = host.querySelector<HTMLElement>('[data-testid="admin-plan-detail"]')!
    expect(detail.textContent).toContain('Competition Squat')
    expect(detail.innerHTML).not.toMatch(CJK)

    const videos: StudentVideo[] = [{
      id: 'video-1', set_log_id: null, plan_exercise_id: 'exercise-1', content_type: 'video/mp4',
      size_bytes: 1024, filename: 'squat.mp4', created_at: '2026-08-18T12:00:00Z',
      logged_at: '2026-08-18T12:00:00Z', exercise_name: '竞技深蹲', name_en: 'Competition Squat',
      set_index: 0, weight_kg: '140', reps: 1, rpe: '8.0', coach_rpe: null, viewed_at: null,
    }]
    await act(async () => {
      root.render(<VideosPage studentId="athlete-1" videos={videos} onRefreshVideos={async () => undefined} />)
    })
    const videoList = host.querySelector<HTMLElement>('.videos-master')!
    expect(videoList.textContent).toContain('Competition Squat')
    expect(videoList.innerHTML).not.toMatch(CJK)

    const setRef: ChatSetRefV1 = {
      v: 1, source: 'logged', exercise_name: '竞技深蹲', name_en: 'Competition Squat',
      set_number: 1, set_total: 1, weight_kg: '140', reps: 1, reps_max: null, rpe: '8',
      day_date: '2026-08-18', set_log_id: '00000000-0000-4000-8000-000000000001', plan_set_id: null,
    }
    await act(async () => {
      root.render(<SetRefCard parsed={{ setRef, note: null }} hasVideo={false} sentAt="09:30" />)
    })
    const card = host.querySelector<HTMLElement>('.set-ref-card')!
    expect(card.textContent).toContain('Competition Squat')
    expect(card.innerHTML).not.toMatch(CJK)

    act(() => root.unmount())
    host.remove()
  })

  it('uses singular and plural English count forms', async () => {
    const { S } = await import('./strings')
    expect([S.common.countWeeks(1), S.common.countWeeks(2)]).toEqual(['1 week', '2 weeks'])
    expect([S.common.countSets(1), S.common.countSets(2)]).toEqual(['1 set', '2 sets'])
    expect([S.video.repCount(1), S.video.repCount(2)]).toEqual(['1 rep', '2 reps'])
    expect([S.video.summary(1, 1), S.video.summary(2, 2)]).toEqual([
      '1 video · Last 1 training day',
      '2 videos · Last 2 training days',
    ])
    expect([S.stats.board.sessions(1), S.stats.board.sessions(2)]).toEqual(['1 session', '2 sessions'])
  })
})
