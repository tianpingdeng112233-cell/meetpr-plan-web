import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterAll, afterEach, beforeEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { AdminPlanWithChildren } from '../api/admin'
import type { ChatSetRefV1, StudentVideo } from '../api/types'
import { S } from './strings'
import { setLocale } from './locale'
import { LoginScreen } from '../features/auth/LoginScreen'
import { PlanEditor } from '../features/plan-editor/PlanEditor'
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

const CJK = new RegExp(`[${simplifiedOnly}]`)
import simplifiedOnly from './simplified-only.json'

async function settle() {
  for (let index = 0; index < 10; index++) await Promise.resolve()
}

function clickButton(host: HTMLElement, label: string) {
  const button = [...host.querySelectorAll('button')].find((item) => item.textContent?.trim() === label)
  if (!button) throw new Error(`button not found: ${label}`)
  button.click()
}

describe('Traditional Chinese locale smoke', () => {
  beforeAll(async () => {
    const { setLocale } = await import('./locale')
    setLocale('zh-Hant')
  })

  afterAll(async () => {
    const { setLocale } = await import('./locale')
    setLocale('zh')
  })

  it('renders the login page and PlanEditor top bar without simplified-only copy', async () => {
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

  it('renders catalog-backed exercise names in Traditional Chinese in admin, videos, and set cards', async () => {
    // Remote DTOs have no ownership flag: backend 052 supplies localized system
    // display names and preserves custom names. Catalog conversion is tested separately.
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
          exercise_name: '競技深蹲', name_en: 'Competition Squat', is_main_lift: true,
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
      exercise_id: 'exercise-1', name: '競技深蹲', name_en: 'Competition Squat',
      exercise_type: 'main_lift', plan_count: 1, coach_count: 1,
    }] })

    const [{ AdminWorkspace }, { BlockHistory }, { SetRefCard }] = await Promise.all([
      import('../features/admin/AdminWorkspace'),
      import('../features/plan-editor/components/BlockHistory'),
      import('../features/chat/setRef'),
    ])
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => { root.render(<AdminWorkspace onLogout={() => undefined} />); await settle() })
    await act(async () => { clickButton(host, '動作庫'); await settle() })
    const library = host.querySelector<HTMLElement>('[data-testid="admin-exercises"]')!
    expect(library.textContent).toContain('競技深蹲')
    const search = library.querySelector('input')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(search, '競技')
      search.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(library.textContent).toContain('競技深蹲')
    expect(library.innerHTML).not.toMatch(CJK)

    await act(async () => { clickButton(host, '課表總覽'); await settle() })
    await act(async () => {
      const planButton = [...host.querySelectorAll('button')].find((item) => item.textContent?.includes('Strength block'))
      planButton?.click()
      await settle()
    })
    const detail = host.querySelector<HTMLElement>('[data-testid="admin-plan-detail"]')!
    expect(detail.textContent).toContain('競技深蹲')
    expect(detail.innerHTML).not.toMatch(CJK)

    const videos: StudentVideo[] = [{
      id: 'video-1', set_log_id: null, plan_exercise_id: 'exercise-1', content_type: 'video/mp4',
      size_bytes: 1024, filename: 'squat.mp4', created_at: '2026-08-18T12:00:00Z',
      logged_at: '2026-08-18T12:00:00Z', exercise_name: '競技深蹲', name_en: 'Competition Squat',
      set_index: 0, weight_kg: '140', reps: 1, rpe: '8.0', coach_rpe: null, viewed_at: null,
    }]
    await act(async () => {
      root.render(<BlockHistory studentId="athlete-1" studentName="Athlete" row={null} videos={videos} entries={videos.map(video => ({ video, inPlan: false }))} feedback={{ videoId: null, playerOpen: false, includeViewed: false }} onFeedbackChange={() => {}} />)
    })
    const videoList = host.querySelector<HTMLElement>('.feedback-queue')!
    expect(videoList.textContent).toContain('競技深蹲')
    expect(videoList.innerHTML).not.toMatch(CJK)

    const setRef: ChatSetRefV1 = {
      v: 1, source: 'logged', exercise_name: '競技深蹲', name_en: 'Competition Squat',
      set_number: 1, set_total: 1, weight_kg: '140', reps: 1, reps_max: null, rpe: '8',
      day_date: '2026-08-18', set_log_id: '00000000-0000-4000-8000-000000000001', plan_set_id: null,
    }
    await act(async () => {
      root.render(<SetRefCard parsed={{ setRef, note: null }} hasVideo={false} sentAt="09:30" />)
    })
    const card = host.querySelector<HTMLElement>('.set-ref-card')!
    expect(card.textContent).toContain('競技深蹲')
    expect(card.innerHTML).not.toMatch(CJK)

    act(() => root.unmount())
    host.remove()
  })

})

beforeEach(() => setLocale('zh-Hant'))
afterEach(() => setLocale('zh'))
it('renders Taiwan login and editor copy while preserving user content', async () => {
  setLocale('zh-Hant')
  const host = document.createElement('div')
  const root = createRoot(host)
  try {
    await act(async () => root.render(<LoginScreen onLogin={() => {}} onSampleMode={() => {}} />))
    expect(host.textContent).toContain('登入')
    expect(host.innerHTML).not.toMatch(/[录练计账设视网储简]/)
    expect(S.auth.accountLabel).toBe('電子郵件')
    await act(async () => root.render(<PlanEditor initialWeeks={[]} weeksCount={1} studentName="张同学" planName="用户的计划" />))
    expect(host.textContent).toContain('用户的计划')
    expect(S.common.weekdaysMondayFirst).toEqual(['週一', '週二', '週三', '週四', '週五', '週六', '週日'])
    expect(S.common.save).toBe('儲存')
  } finally { act(() => root.unmount()) }
})

it('renders application, password recovery and setup pages in Traditional Chinese', async () => {
  setLocale('zh-Hant')
  const { CoachApplicationPage } = await import('../features/onboarding/OnboardingPages')
  const { SetCoachPasswordPage } = await import('../features/onboarding/SetCoachPasswordPage')
  const { invitationMessage } = await import('../features/onboarding/CoachWelcomePage')
  const host = document.createElement('div'), root = createRoot(host)
  try {
    await act(async () => root.render(<CoachApplicationPage />))
    expect(host.textContent).toContain('電子郵件')
    expect(host.innerHTML).not.toMatch(CJK)
    await act(async () => root.render(<SetCoachPasswordPage />))
    expect(host.innerHTML).not.toMatch(CJK)
    await act(async () => root.render(<LoginScreen onLogin={() => {}} onSampleMode={() => {}} />))
    await act(async () => clickButton(host, S.auth.forgotLink))
    expect(host.textContent).toContain('找回密碼')
    expect(host.innerHTML).not.toMatch(CJK)
    const invitation = invitationMessage('https://meetpr.cn/张教练', 'ABCD1234', '张教练')
    expect(invitation).toContain('課表')
    expect(invitation).toContain('https://meetpr.cn/张教练')
    expect(invitation).toContain('—— 张教练')
  } finally { act(() => root.unmount()) }
})

it('localizes the coach onboarding login entry', async () => {
  const host = document.createElement('div'), root = createRoot(host)
  try {
    await act(async () => root.render(<LoginScreen coachOnboarding onLogin={() => {}} onSampleMode={() => {}} />))
    expect(host.textContent).toContain('請使用申請測試版時的信箱')
    expect(host.innerHTML).not.toMatch(CJK)
  } finally { act(() => root.unmount()) }
})
it('does not infer system ownership from a custom exercise name in a set card', async () => {
  const { SetRefCard } = await import('../features/chat/setRef')
  const host = document.createElement('div'), root = createRoot(host)
  try {
    const setRef: ChatSetRefV1 = {
      v: 1, source: 'logged', exercise_name: '卧推', set_number: 1, set_total: 1,
      weight_kg: '100', reps: 5, reps_max: null, rpe: '8', day_date: '2026-10-22',
      set_log_id: '00000000-0000-4000-8000-000000000001', plan_set_id: null,
    }
    await act(async () => root.render(<SetRefCard parsed={{ setRef, note: '用户的备注' }} hasVideo={false} sentAt="09:30" />))
    expect(host.querySelector('b')?.textContent).toBe('卧推')
    expect(host.textContent).toContain('用户的备注')
  } finally { act(() => root.unmount()) }
})
