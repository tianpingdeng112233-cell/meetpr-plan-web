import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthUser, ChatConversation, ChatMessage, CoachBindRequest, ExerciseResponse, PlanResponse, PlanWithChildren, StudentVideo } from '../../api/types'
import type { Week } from '../plan-editor/types'

const api = vi.hoisted(() => ({
  getCoachStudents: vi.fn(),
  getStudentPlans: vi.fn(),
  getPlan: vi.fn(),
  publishPlan: vi.fn(),
  getStudentOnboarding: vi.fn(),
  getBindRequests: vi.fn(),
  getStudentVideos: vi.fn(),
  getExerciseStatsOverview: vi.fn(),
  getExerciseStats: vi.fn(),
  refreshCoachStudents: vi.fn(),
  acceptBindRequest: vi.fn(),
  getInviteCodes: vi.fn(),
  listExercises: vi.fn(),
  getExerciseUsageStats: vi.fn(),
  listConversations: vi.fn(),
  getMessages: vi.fn(),
  markConversationRead: vi.fn(),
  sendTextMessage: vi.fn(),
  openConversation: vi.fn(),
  captureEditorProps: vi.fn(),
  getUploadUrl: vi.fn(),
  postCoachFeedback: vi.fn(),
  getVideoMarkers: vi.fn(),
  createVideoMarker: vi.fn(),
  deleteVideoMarker: vi.fn(),
}))

vi.mock('../../api/plans', () => ({
  getCoachStudents: api.getCoachStudents,
  getStudentPlans: api.getStudentPlans,
  getPlan: api.getPlan,
  getStudentOnboarding: api.getStudentOnboarding,
  publishPlan: api.publishPlan,
  createPlan: vi.fn(),
  patchPlan: vi.fn(),
  markImportedHistory: vi.fn(),
  renameCoachStudent: vi.fn(),
  deletePlan: vi.fn(),
}))
vi.mock('../../api/exercises', () => ({
  listExercises: api.listExercises,
  getExerciseUsageStats: api.getExerciseUsageStats,
  createCustomExercise: vi.fn(),
}))
vi.mock('../../api/coach', () => ({
  getBindRequests: api.getBindRequests,
  getStudentVideos: api.getStudentVideos,
  getExerciseStatsOverview: api.getExerciseStatsOverview,
  getExerciseStats: api.getExerciseStats,
  refreshCoachStudents: api.refreshCoachStudents,
  acceptBindRequest: api.acceptBindRequest,
  getInviteCodes: api.getInviteCodes,
  getUploadUrl: api.getUploadUrl,
  postCoachFeedback: api.postCoachFeedback,
  rejectBindRequest: vi.fn(),
}))
vi.mock('../../api/markers', () => ({
  getVideoMarkers: api.getVideoMarkers,
  createVideoMarker: api.createVideoMarker,
  deleteVideoMarker: api.deleteVideoMarker,
}))
vi.mock('../../api/chat', () => ({
  listConversations: api.listConversations,
  getMessages: api.getMessages,
  markConversationRead: api.markConversationRead,
  sendTextMessage: api.sendTextMessage,
  openConversation: api.openConversation,
}))
vi.mock('../plan-editor/PlanEditor', () => ({
  PlanEditor: (props: {
    initialWeeks: Week[]
    readOnly?: boolean
    onSave?: unknown
    onRename?: unknown
    onLeaveGuardChange?: (guard: (() => Promise<boolean>) | null) => void
    students?: { id: string; label: string }[]
    currentStudentId?: string
    onSwitchStudent?: (id: string) => void
    plans?: { id: string; label: string }[]
    onPublish?: () => Promise<void>
  }) => {
    const { initialWeeks, onLeaveGuardChange, students, currentStudentId, plans, onPublish } = props
    api.captureEditorProps(props)
    useEffect(() => {
      onLeaveGuardChange?.(async () => true)
      return () => onLeaveGuardChange?.(null)
    }, [onLeaveGuardChange])
    return (
      <div>
        <div data-testid="editor-note">{initialWeeks[0]?.days[0]?.rows[0]?.note}</div>
        <div data-testid="current-student">{currentStudentId}</div>
        <div data-testid="plan-options">{plans?.map((item) => item.label).join('|')}</div>
        {onPublish && <button data-testid="publish-plan" onClick={() => { void onPublish() }}>发布计划</button>}
        {students?.map((student) => (
          <button key={student.id} data-testid={`switch-${student.id}`} onClick={() => props.onSwitchStudent?.(student.id)}>
            {student.label}
          </button>
        ))}
      </div>
    )
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
const me: AuthUser = { id: 'coach', phone: '+8613900000001', role: 'coach', createdAt: '2026-01-01T00:00:00Z' }
const chatConversation = (unreadCount: number): ChatConversation => ({
  id: 'conversation', other_party: { id: 'student', display_name: '学员' },
  last_message: { id: 'chat-message', seq: 1, kind: 'text', preview: '新消息', created_at: '2026-07-22T10:00:00Z', sender_id: 'student' },
  last_message_at: '2026-07-22T10:00:00Z', unread_count: unreadCount,
  my_last_read: null, other_last_read: null,
})
const chatMessage: ChatMessage = {
  id: 'chat-message', conversation_id: 'conversation', seq: 1, sender_id: 'student', kind: 'text', body: '新消息',
  attachment_id: null, image_url: null, image_expires_in: null,
  set_ref: null, video_url: null, video_expires_in: null,
  client_id: 'student-client', created_at: '2026-07-22T10:00:00Z',
}
const bindRequest: CoachBindRequest = {
  id: 'request',
  student_id: 'student-2',
  display_name: '新学员',
  submitted_at: '2026-07-27T10:00:00Z',
  expired_at: '2026-08-03T10:00:00Z',
  masked_phone: '139****0000',
  invite_code: 'INVITE',
  onboarding: {
    completed: true,
    upload_count: 0,
    deadlift_style: null,
  },
}

function plan(note: string, status: PlanWithChildren['status'] = 'draft'): PlanWithChildren {
  return {
    id: 'plan', coach_id: 'coach', trainee_id: 'student', name: '计划',
    start_date: '2026-01-05', end_date: '2026-01-11', plan_weeks: 1,
    source: 'coach', source_template_id: null, status, kind: 'regular',
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    total_shift_days: 0, latest_shift_created_at: null,
    days: [{
      id: 'day', plan_id: 'plan', day_of_week: 1, week_number: 1, sort_order: 0,
      shifted_to_date: null,
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

function studentPlan({
  id,
  studentId,
  name,
  status = 'draft',
  startDate = '2026-01-05',
  endDate = '2026-01-11',
}: {
  id: string
  studentId: string
  name: string
  status?: PlanResponse['status']
  startDate?: string
  endDate?: string
}): PlanWithChildren {
  return {
    ...plan(name),
    id,
    trainee_id: studentId,
    name,
    status,
    start_date: startDate,
    end_date: endDate,
    days: [],
  }
}

function video(id: string, exerciseName: string, viewedAt: string | null = null): StudentVideo {
  return {
    id,
    set_log_id: 'set-log',
    plan_exercise_id: 'plan-exercise',
    content_type: 'video/mp4',
    size_bytes: 1024,
    filename: `${id}.mp4`,
    created_at: '2026-07-27T08:00:00Z',
    logged_at: '2026-07-27T08:00:00Z',
    exercise_name: exerciseName,
    set_index: 1,
    weight_kg: '100',
    reps: 5,
    viewed_at: viewedAt,
  }
}

function clickButton(host: HTMLElement, label: string): void {
  const button = [...host.querySelectorAll('button')].find((item) => item.textContent?.includes(label))
  if (!button) throw new Error(`button not found: ${label}`)
  button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

async function settle(): Promise<void> {
  // Workspace boot now includes roster-wide plan/video badge derivation in
  // addition to the selected plan, so give the nested Promise.all chain enough
  // microtask turns to settle even under the full suite's parallel load.
  for (let index = 0; index < 24; index++) await Promise.resolve()
}

describe('PlanWorkspace editor remount', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
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
    api.getExerciseUsageStats.mockResolvedValue([])
    api.getCoachStudents.mockResolvedValue([{ id: 'student', display_name: '学员', status: 'active', evaluation: null }])
    api.getStudentPlans.mockResolvedValue([plan('加载时快照')])
    api.getStudentOnboarding.mockResolvedValue(null)
    api.publishPlan.mockResolvedValue(plan('发布完成'))
    api.getBindRequests.mockResolvedValue([])
    api.getStudentVideos.mockResolvedValue([])
    api.getExerciseStatsOverview.mockResolvedValue({
      exercises: [],
      one_rm: { squat: null, bench: null, deadlift: null },
      last_trained_at: null,
      recent_4w: { trained_days: 0, total_planned_days: 0, completion_rate: 0 },
    })
    api.acceptBindRequest.mockResolvedValue({})
    api.getInviteCodes.mockResolvedValue([])
    api.getExerciseStats.mockResolvedValue({
      rep_prs: [],
      recent_sessions: [],
      by_set_count: {},
      e1rm: null,
      one_rm_reference: null,
    })
    api.listConversations.mockResolvedValue([])
    api.getMessages.mockResolvedValue({ messages: [chatMessage], meta: { other_last_read: null, has_more: false } })
    api.markConversationRead.mockResolvedValue({ my_last_read: { message_id: 'chat-message', seq: 1 }, unread_count: 0 })
    api.getUploadUrl.mockResolvedValue({ url: 'https://example.test/video', expires_in: 60 })
    api.postCoachFeedback.mockResolvedValue({})
    api.getVideoMarkers.mockResolvedValue([])
    api.createVideoMarker.mockResolvedValue({})
    api.deleteVideoMarker.mockResolvedValue(undefined)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.useRealTimers()
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  it('re-fetches the current plan and mounts the editor from the latest server weeks', async () => {
    api.getPlan
      .mockResolvedValueOnce(plan('加载时快照'))
      .mockResolvedValueOnce(plan('服务端最新备注'))

    await act(async () => {
      root.render(<PlanWorkspace onLogout={vi.fn()} me={me} />)
      await settle()
    })
    expect(host.querySelector('[data-testid="editor-note"]')?.textContent).toBe('加载时快照')

    await act(async () => {
      clickButton(host, '动作库')
      await settle()
    })
    expect(host.querySelector('[data-testid="editor-note"]')).toBeNull()

    await act(async () => {
      clickButton(host, '计划编排')
      await settle()
    })

    expect(api.getPlan).toHaveBeenCalledTimes(2)
    expect(host.querySelector('[data-testid="editor-note"]')?.textContent).toBe('服务端最新备注')
  }, 15_000)

  it('silently boots with catalog ordering when usage stats are unavailable', async () => {
    api.getExerciseUsageStats.mockRejectedValue(new Error('404'))
    api.getPlan.mockResolvedValue(plan('频次接口降级'))

    await act(async () => {
      root.render(<PlanWorkspace onLogout={vi.fn()} me={me} />)
      await settle()
    })

    expect(api.getExerciseUsageStats).toHaveBeenCalledTimes(1)
    expect(host.querySelector('[data-testid="editor-note"]')?.textContent).toBe('频次接口降级')
    expect(host.textContent).not.toContain('无法连接后端')
  }, 15_000)

  it('keeps the first student workspace usable when roster badge loading fails', async () => {
    api.getCoachStudents.mockResolvedValue([
      { id: 'student', display_name: '首位学员', status: 'active', evaluation: null },
      { id: 'student-2', display_name: '后台失败学员', status: 'active', evaluation: null },
    ])
    api.getStudentPlans.mockImplementation((studentId: string) => (
      studentId === 'student'
        ? Promise.resolve([plan('首位学员仍可编辑')])
        : Promise.reject(new Error('rate limited'))
    ))
    api.getStudentVideos.mockImplementation((studentId: string) => (
      studentId === 'student'
        ? Promise.resolve([])
        : Promise.reject(new Error('video unavailable'))
    ))
    api.getPlan.mockResolvedValue(plan('首位学员仍可编辑'))

    await act(async () => {
      root.render(<PlanWorkspace onLogout={vi.fn()} me={me} />)
      await settle()
    })

    expect(host.querySelector('[data-testid="editor-note"]')?.textContent).toBe('首位学员仍可编辑')
    expect(host.textContent).not.toContain('无法连接后端')
    expect(host.querySelector('.coach-statusbar')?.textContent).toContain('待排 1')
    const videosTab = [...host.querySelectorAll('button')].find((item) => item.textContent?.includes('训练视频'))
    expect(videosTab?.querySelector('.coach-nav-badge')).toBeNull()
  }, 15_000)

  it('切换学员时清空旧计划挂载，且较早的后台计划响应不能覆盖较新的结果', async () => {
    const studentAPlan = studentPlan({
      id: 'plan-a',
      studentId: 'student-a',
      name: '甲学员计划',
      status: 'published',
      startDate: '2026-08-03',
      endDate: '2026-08-09',
    })
    const studentBPlan = studentPlan({
      id: 'plan-b',
      studentId: 'student-b',
      name: '乙学员最新计划',
      status: 'published',
      startDate: '2026-08-03',
      endDate: '2026-08-09',
    })
    let resolveBackgroundB!: (rows: PlanResponse[]) => void
    let resolveForegroundB!: (rows: PlanResponse[]) => void
    let studentBRequests = 0
    api.getCoachStudents.mockResolvedValue([
      { id: 'student-a', display_name: '甲学员', status: 'active', evaluation: null },
      { id: 'student-b', display_name: '乙学员', status: 'active', evaluation: null },
    ])
    api.getStudentPlans.mockImplementation((id: string) => {
      if (id === 'student-a') return Promise.resolve([studentAPlan])
      studentBRequests += 1
      return new Promise<PlanResponse[]>((resolve) => {
        if (studentBRequests === 1) resolveBackgroundB = resolve
        else resolveForegroundB = resolve
      })
    })
    api.getPlan.mockImplementation((id: string) => Promise.resolve(id === 'plan-a' ? studentAPlan : studentBPlan))

    await act(async () => {
      root.render(<PlanWorkspace onLogout={vi.fn()} me={me} />)
      await settle()
    })
    expect(host.querySelector('[data-testid="plan-options"]')?.textContent).toBe('甲学员计划')

    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-testid="switch-student-b"]')?.click()
      await settle()
    })
    expect(host.querySelector('[data-testid="current-student"]')?.textContent).toBe('student-b')
    expect(host.querySelector('[data-testid="plan-options"]')?.textContent).toBe('')

    await act(async () => {
      resolveForegroundB([studentBPlan])
      await settle()
    })
    expect(host.querySelector('[data-testid="plan-options"]')?.textContent).toBe('乙学员最新计划')

    await act(async () => {
      resolveBackgroundB([])
      await settle()
    })
    expect(host.querySelector('[data-testid="plan-options"]')?.textContent).toBe('乙学员最新计划')
    expect(host.querySelector('.coach-statusbar')?.textContent).toContain('待排 0')
  }, 15_000)

  it('部分计划加载时导航待排数与总览页签同源且一致', async () => {
    let keepSecondPending!: (rows: PlanResponse[]) => void
    api.getCoachStudents.mockResolvedValue([
      { id: 'student', display_name: '已知待排', status: 'active', evaluation: null },
      { id: 'student-2', display_name: '状态未知', status: 'active', evaluation: null },
    ])
    api.getStudentPlans.mockImplementation((id: string) => (
      id === 'student'
        ? Promise.resolve([])
        : new Promise<PlanResponse[]>((resolve) => { keepSecondPending = resolve })
    ))

    await act(async () => {
      root.render(<PlanWorkspace onLogout={vi.fn()} me={me} />)
      await settle()
    })

    expect(host.querySelector('.coach-queue-heading')?.textContent).toBe('待排队列 · 1')
    expect(host.querySelector('.coach-statusbar')?.textContent).toContain('待排 1')

    await act(async () => {
      clickButton(host, '总览')
      await settle()
    })
    const pendingTab = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
      .find((button) => button.textContent?.startsWith('待排'))
    expect(pendingTab?.textContent).toBe('待排1')

    await act(async () => {
      keepSecondPending([])
      await settle()
    })
  }, 15_000)

  it('计划更新会拒绝在途旧周吨位，并只展示按需重拉的新值', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-27T12:00:00Z'))
    const summary = studentPlan({
      id: 'current-plan',
      studentId: 'student',
      name: '当前计划',
      status: 'published',
      startDate: '2026-07-20',
      endDate: '2026-08-02',
    })
    const tonnagePlan = (targetValue: string): PlanWithChildren => ({
      ...summary,
      plan_weeks: 2,
      days: [{
        id: 'week-two',
        plan_id: summary.id,
        day_of_week: 1,
        week_number: 2,
        sort_order: 0,
        shifted_to_date: null,
        exercises: [{
          id: 'exercise-row',
          plan_day_id: 'week-two',
          exercise_id: exercise.id,
          is_main_lift: true,
          sort_order: 0,
          notes: null,
          sets: [{
            id: 'tonnage-set',
            plan_exercise_id: 'exercise-row',
            set_number: 1,
            target_reps: 10,
            target_reps_max: null,
            intensity_mode: 'weight',
            target_value: targetValue,
            set_type: 'working',
            rest_seconds: null,
            coach_note: null,
            created_at: '2026-07-20T00:00:00Z',
          }],
        }],
      }],
    })
    const oldPlan = tonnagePlan('50')
    const freshPlan = tonnagePlan('100')
    let resolveOldTonnage!: (value: PlanWithChildren) => void
    api.getStudentPlans.mockResolvedValue([summary])
    api.publishPlan.mockResolvedValue(summary)
    api.getPlan
      .mockResolvedValueOnce(oldPlan)
      .mockImplementationOnce(() => new Promise<PlanWithChildren>((resolve) => { resolveOldTonnage = resolve }))
      .mockResolvedValueOnce(freshPlan)

    await act(async () => {
      root.render(<PlanWorkspace onLogout={vi.fn()} me={me} />)
      await settle()
    })
    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-testid="publish-plan"]')?.click()
      await settle()
    })
    await act(async () => {
      clickButton(host, '总览')
      await settle()
    })
    expect(host.querySelector('[data-student-id="student"] .roster-number')?.textContent).toBe('1.0t')

    await act(async () => {
      resolveOldTonnage(oldPlan)
      await settle()
    })
    expect(host.querySelector('[data-student-id="student"] .roster-number')?.textContent).toBe('1.0t')
  }, 15_000)

  it('反馈刷新后的新视频不会被较早发出的后台响应覆盖', async () => {
    const selectedPlan = studentPlan({ id: 'plan-a', studentId: 'student-a', name: '视频测试计划' })
    const initialVideo = video('video-a', '刷新前视频')
    const refreshedVideo = video('video-a', '反馈后最新视频')
    const staleVideo = video('video-stale', '后台旧视频')
    let resolveBackgroundVideo!: (rows: StudentVideo[]) => void
    let studentAVideoRequests = 0
    api.getCoachStudents.mockResolvedValue([
      { id: 'student-a', display_name: '甲学员', status: 'active', evaluation: null },
      { id: 'student-b', display_name: '乙学员', status: 'active', evaluation: null },
    ])
    api.getStudentPlans.mockImplementation((id: string) => (
      Promise.resolve(id === 'student-a' ? [selectedPlan] : [])
    ))
    api.getPlan.mockResolvedValue(selectedPlan)
    api.getStudentVideos.mockImplementation((id: string) => {
      if (id === 'student-b') return Promise.resolve([])
      studentAVideoRequests += 1
      if (studentAVideoRequests === 1) {
        return new Promise<StudentVideo[]>((resolve) => { resolveBackgroundVideo = resolve })
      }
      if (studentAVideoRequests === 2) return Promise.resolve([initialVideo])
      return Promise.resolve([refreshedVideo])
    })

    await act(async () => {
      root.render(<PlanWorkspace onLogout={vi.fn()} me={me} />)
      await settle()
    })
    await act(async () => {
      clickButton(host, '训练视频')
      await settle()
    })
    expect(host.textContent).toContain('刷新前视频')

    await act(async () => {
      await settle()
    })
    const feedback = host.querySelector<HTMLTextAreaElement>('.video-feedback textarea')!
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
      setter?.call(feedback, '动作反馈')
      feedback.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      host.querySelector<HTMLButtonElement>('.video-feedback footer button')?.click()
      await settle()
    })
    expect(api.postCoachFeedback).toHaveBeenCalledTimes(1)
    expect(host.textContent).toContain('反馈后最新视频')

    await act(async () => {
      resolveBackgroundVideo([staleVideo])
      await settle()
    })
    expect(host.textContent).toContain('反馈后最新视频')
    expect(host.textContent).not.toContain('后台旧视频')
  }, 15_000)

  it('零学员空态可进入消息页且不发聊天请求', async () => {
    api.getCoachStudents.mockResolvedValue([])

    await act(async () => {
      root.render(<PlanWorkspace onLogout={vi.fn()} me={me} />)
      await settle()
    })
    expect(host.querySelectorAll('.coach-nav-item')).toHaveLength(6)
    expect([...host.querySelectorAll('.coach-nav-item')].map((item) => item.firstElementChild?.textContent)).toEqual([
      '总览', '计划编排', '消息', '动作库', '训练视频', '学员申请',
    ])
    expect(api.listConversations).not.toHaveBeenCalled()

    await act(async () => {
      clickButton(host, '消息')
      await settle()
    })

    expect(host.querySelector('.empty-page')?.textContent).toBe('接受学员申请后即可与学员聊天')
    expect(host.querySelector('.coach-shell-body')?.children).toHaveLength(2)
    expect(host.querySelector('.coach-main')).not.toBeNull()
    expect(api.listConversations).not.toHaveBeenCalled()
  }, 15_000)

  it('零学员时仍每 60 秒轮询学员申请', async () => {
    vi.useFakeTimers()
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    api.getCoachStudents.mockResolvedValue([])

    await act(async () => {
      root.render(<PlanWorkspace onLogout={vi.fn()} me={me} />)
      await settle()
    })
    expect(api.getBindRequests).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
      await settle()
    })

    expect(api.getBindRequests).toHaveBeenCalledTimes(2)
    expect(api.listConversations).not.toHaveBeenCalled()
  }, 15_000)

  it('接受申请后立即刷新学员列表和申请计数', async () => {
    api.getBindRequests
      .mockResolvedValueOnce([bindRequest])
      .mockResolvedValue([])
    api.refreshCoachStudents.mockResolvedValue([
      { id: 'student', display_name: '学员', status: 'active', evaluation: null },
      { id: 'student-2', display_name: '新学员', status: 'active', evaluation: null },
    ])
    api.getStudentPlans.mockImplementation((studentId: string) => (
      studentId === 'student' ? Promise.resolve([plan('接受申请')]) : Promise.resolve([])
    ))
    api.getPlan.mockResolvedValue(plan('接受申请'))

    await act(async () => {
      root.render(<PlanWorkspace onLogout={vi.fn()} me={me} />)
      await settle()
    })
    const requestsTab = [...host.querySelectorAll('button')].find((item) => item.textContent?.includes('学员申请'))
    expect(requestsTab?.querySelector('.coach-nav-badge')?.textContent).toBe('1')

    await act(async () => {
      clickButton(host, '学员申请')
      await settle()
    })
    expect(host.querySelector('.requests-count')?.textContent).toBe('1 条')
    expect(host.querySelector('.request-list')?.textContent).toContain('新学员')
    await act(async () => {
      host.querySelector<HTMLButtonElement>('.request-row button.accept')?.click()
      await settle()
    })

    expect(api.acceptBindRequest).toHaveBeenCalledWith('request')
    expect(api.refreshCoachStudents).toHaveBeenCalledTimes(1)
    expect(api.getBindRequests).toHaveBeenCalledTimes(2)
    expect(host.querySelector('.requests-count')?.textContent).toBe('0 条')
    expect(host.querySelector('.request-list')?.textContent).not.toContain('新学员')
    expect(requestsTab?.querySelector('.coach-nav-badge')).toBeNull()
  }, 15_000)

  it('接受申请后丢弃更早发出的轮询响应，申请卡片和角标不复活', async () => {
    vi.useFakeTimers()
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    let resolveStale!: (value: CoachBindRequest[]) => void
    const stale = new Promise<CoachBindRequest[]>((resolve) => { resolveStale = resolve })
    api.getBindRequests
      .mockResolvedValueOnce([bindRequest])
      .mockReturnValueOnce(stale)
      .mockResolvedValue([])
    api.refreshCoachStudents.mockResolvedValue([
      { id: 'student', display_name: '学员', status: 'active', evaluation: null },
      { id: 'student-2', display_name: '新学员', status: 'active', evaluation: null },
    ])
    api.getPlan.mockResolvedValue(plan('申请乱序测试'))

    await act(async () => {
      root.render(<PlanWorkspace onLogout={vi.fn()} me={me} />)
      await settle()
    })
    const requestsTab = [...host.querySelectorAll('button')].find((item) => item.textContent?.includes('学员申请'))
    await act(async () => {
      clickButton(host, '学员申请')
      await settle()
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
      await settle()
    })
    expect(api.getBindRequests).toHaveBeenCalledTimes(2)

    await act(async () => {
      host.querySelector<HTMLButtonElement>('.request-row button.accept')?.click()
      await settle()
    })
    expect(api.getBindRequests).toHaveBeenCalledTimes(3)
    expect(host.querySelector('.requests-count')?.textContent).toBe('0 条')
    expect(requestsTab?.querySelector('.coach-nav-badge')).toBeNull()

    await act(async () => {
      resolveStale([bindRequest])
      await settle()
    })
    expect(host.querySelector('.requests-count')?.textContent).toBe('0 条')
    expect(host.querySelector('.request-list')?.textContent).not.toContain('新学员')
    expect(requestsTab?.querySelector('.coach-nav-badge')).toBeNull()
  }, 15_000)

  it('markRead 清零后丢弃更早采样的 inbox 响应，红点不复活', async () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(true)
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    let resolveStale!: (value: ChatConversation[]) => void
    const stale = new Promise<ChatConversation[]>((resolve) => { resolveStale = resolve })
    api.listConversations
      .mockResolvedValueOnce([chatConversation(1)])
      .mockReturnValueOnce(stale)
      .mockResolvedValue([])
    api.getPlan.mockResolvedValue(plan('聊天红点测试'))

    await act(async () => {
      root.render(<PlanWorkspace onLogout={vi.fn()} me={me} />)
      await settle()
    })
    await act(async () => {
      clickButton(host, '消息')
      await settle()
    })
    await act(async () => {
      host.querySelector<HTMLButtonElement>('.chat-row')?.click()
      await settle()
    })
    expect(api.markConversationRead).toHaveBeenCalledWith('conversation', 'chat-message')

    await act(async () => {
      resolveStale([chatConversation(1)])
      await settle()
    })
    const messagesTab = [...host.querySelectorAll('button')].find((item) => item.textContent?.includes('消息'))
    expect(messagesTab?.querySelector('.coach-nav-badge')).toBeNull()
  }, 15_000)

  it('does not pass any write callbacks to a completed historical plan', async () => {
    const completed = plan('历史快照', 'completed')
    api.getStudentPlans.mockResolvedValue([completed])
    api.getPlan.mockResolvedValue(completed)

    await act(async () => {
      root.render(<PlanWorkspace onLogout={vi.fn()} me={me} />)
      await settle()
    })

    const props = api.captureEditorProps.mock.calls.at(-1)?.[0]
    expect(props).toMatchObject({ readOnly: true })
    expect(props.onSave).toBeUndefined()
    expect(props.onRename).toBeUndefined()
    expect(props.onPublish).toBeUndefined()
  })
})
