import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthUser, ChatConversation, ChatMessage, CoachBindRequest, ExerciseResponse, PlanResponse, PlanWithChildren, StudentVideo } from '../../api/types'
import { ApiException } from '../../api/client'
import type { Week } from '../plan-editor/types'
import { setRefFirstLine } from '../chat/setRef'

const api = vi.hoisted(() => ({
  realEditor: false,
  publicInvite: vi.fn(),
  meRequest: vi.fn(),
  rejectBindRequest: vi.fn(),
  getOverviewAlerts: vi.fn(),
  markPlanViewed: vi.fn(),
  getStudentSetLogs: vi.fn(),
  markVideoViewed: vi.fn(),
  getCoachStudents: vi.fn(),
  getStudentPlans: vi.fn(),
  getPlan: vi.fn(),
  publishPlan: vi.fn(),
  createPlan: vi.fn(),
  patchPlan: vi.fn(),
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
  createCustomExercise: vi.fn(),
  updateCustomExercise: vi.fn(),
  deleteCustomExercise: vi.fn(),
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
  reconcilePlan: vi.fn(),
  reconcileImportedPlan: vi.fn(),
  resizeServerPlanWeeks: vi.fn(),
  guardLeave: vi.fn(),
}))

vi.mock('../../api/client', async importOriginal => ({ ...await importOriginal<typeof import('../../api/client')>(), request: api.meRequest }))
vi.mock('../../api/onboarding', () => ({ getPublicInvite: api.publicInvite }))
vi.mock('../../api/overviewAlerts', () => ({ getOverviewAlerts: api.getOverviewAlerts, markPlanViewed: api.markPlanViewed }))
vi.mock('../../api/invite', async importOriginal => ({ ...await importOriginal<typeof import('../../api/invite')>(), getInviteCodes: api.getInviteCodes }))
vi.mock('../../api/plans', () => ({
  getCoachStudents: api.getCoachStudents,
  getStudentPlans: api.getStudentPlans,
  getPlan: api.getPlan,
  getStudentOnboarding: api.getStudentOnboarding,
  publishPlan: api.publishPlan,
  createPlan: api.createPlan,
  patchPlan: api.patchPlan,
  markImportedHistory: vi.fn(),
  renameCoachStudent: vi.fn(),
  deletePlan: vi.fn(),
}))
vi.mock('../../api/exercises', () => ({
  listExercises: api.listExercises,
  getExerciseUsageStats: api.getExerciseUsageStats,
  createCustomExercise: api.createCustomExercise,
  updateCustomExercise: api.updateCustomExercise,
  deleteCustomExercise: api.deleteCustomExercise,
}))
vi.mock('../../api/coach', () => ({
  getStudentSetLogs: api.getStudentSetLogs,
  getBindRequests: api.getBindRequests,
  getStudentVideos: api.getStudentVideos,
  getExerciseStatsOverview: api.getExerciseStatsOverview,
  getExerciseStats: api.getExerciseStats,
  refreshCoachStudents: api.refreshCoachStudents,
  acceptBindRequest: api.acceptBindRequest,
  getInviteCodes: api.getInviteCodes,
  getUploadUrl: api.getUploadUrl,
  postCoachFeedback: api.postCoachFeedback,
  rejectBindRequest: api.rejectBindRequest,
}))
vi.mock('../../api/markers', () => ({
  markVideoViewed: api.markVideoViewed,
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
vi.mock('../plan-editor/reconcile', async importOriginal => ({
  ...await importOriginal<typeof import('../plan-editor/reconcile')>(),
  reconcilePlan: api.reconcilePlan,
  reconcileImportedPlan: api.reconcileImportedPlan,
  resizeServerPlanWeeks: api.resizeServerPlanWeeks,
}))
vi.mock('../plan-editor/PlanEditor', async importOriginal => {
  const real = await importOriginal<typeof import('../plan-editor/PlanEditor')>()
  return ({
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
    onChangeStartDate?: (startDate: string) => Promise<void>
  }) => {
    api.captureEditorProps(props)
    if (api.realEditor) return <real.PlanEditor {...props as import('../plan-editor/PlanEditor').PlanEditorProps} />
    const { initialWeeks, onLeaveGuardChange, students, currentStudentId, plans, onPublish } = props
    api.captureEditorProps(props)
    useEffect(() => {
      onLeaveGuardChange?.(() => api.guardLeave())
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
})})
vi.mock('../catalog/CatalogPage', () => ({
  CatalogPage: ({
    onUseExercise,
    commandExerciseId,
  }: {
    onUseExercise: () => void
    commandExerciseId?: string | null
  }) => (
    <>
      <button type="button" onClick={onUseExercise}>使用动作并返回编辑器</button>
      <span data-testid="command-exercise">{commandExerciseId}</span>
    </>
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
    total_shift_days: 0, latest_shift_created_at: null, latest_shift: null,
    days: [{
      id: 'day', plan_id: 'plan', day_of_week: 1, week_number: 1, sort_order: 0,
      shifted_to_date: null,
      exercises: [{
        id: 'plan-exercise', plan_day_id: 'day', exercise_id: 'exercise', is_main_lift: true,
        sort_order: 0, target: null, notes: note, sets: [{
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

function clickNav(host: HTMLElement, label: string): void {
  const button = [...host.querySelectorAll<HTMLButtonElement>('.coach-nav-item')]
    .find((item) => item.firstElementChild?.textContent === label)
  if (!button) throw new Error(`nav button not found: ${label}`)
  button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

async function settle(): Promise<void> {
  // Workspace boot now includes roster-wide plan/video badge derivation in
  // addition to the selected plan, so give the nested Promise.all chain enough
  // microtask turns to settle even under the full suite's parallel load.
  for (let index = 0; index < 24; index++) await Promise.resolve()
}

async function playback(host: HTMLElement, seconds = 10) {
  const media = host.querySelector('video')!
  await act(async () => {
    Object.defineProperty(media, 'duration', { configurable: true, value: 20 })
    media.currentTime = seconds
    media.dispatchEvent(new Event('timeupdate'))
    await settle()
  })
}

describe('PlanWorkspace editor remount', () => {
  let host: HTMLDivElement
  let root: Root

  it('013 overview waits for the target plan and videos, then opens the first in-plan pending video', async () => {
    api.realEditor = true
    api.getPlan.mockResolvedValue(plan('初始计划'))
    api.getCoachStudents.mockResolvedValue([
      { id: 'student', display_name: '学员', status: 'active', evaluation: null },
      { id: 'second', display_name: '乙', status: 'active', evaluation: null },
    ])
    const secondPlan = { ...plan('乙计划'), id: 'second-plan', trainee_id: 'second' }
    api.getStudentPlans.mockImplementation((id: string) => Promise.resolve([id === 'second' ? secondPlan : plan('初始计划')]))
    api.getStudentVideos.mockResolvedValue([video('old-block', '上个计划'), video('target', '深蹲')])
    await act(async () => { root.render(<PlanWorkspace onLogout={vi.fn()} me={me} />); await settle() })
    await act(async () => { clickNav(host, '总览'); await settle() })
    let resolvePlan!: (value: PlanWithChildren) => void
    let resolveVideos!: (value: StudentVideo[]) => void
    api.getPlan.mockImplementation(() => new Promise(resolve => { resolvePlan = resolve }))
    api.getStudentVideos.mockImplementation(() => new Promise(resolve => { resolveVideos = resolve }))
    await act(async () => { host.querySelector<HTMLButtonElement>('[data-student-id="second"] [data-alert-kind="videos"]')!.click(); await settle() })
    expect(host.querySelector('[data-feedback-mode]')).toBeNull()
    await act(async () => { resolvePlan(secondPlan); await settle() })
    expect(host.querySelector('.block-grid')).not.toBeNull()
    expect(host.querySelector('[data-feedback-mode]')).toBeNull()
    await act(async () => { resolveVideos([{ ...video('old-block', '上个计划'), plan_exercise_id: null }, video('target', '深蹲')]); await settle() })
    expect(host.querySelector('[data-feedback-mode]')).not.toBeNull()
    expect(host.querySelector('[data-feedback-video="target"]')?.classList.contains('selected')).toBe(true)
    expect(host.querySelector('.history-player')).not.toBeNull()
    expect(api.markVideoViewed).not.toHaveBeenCalled()
  })

  it.each(['empty', 'leave'])('013 does not open feedback after an empty refresh or a newer navigation: %s', async scenario => {
    api.realEditor = true
    api.getPlan.mockResolvedValue(plan('计划'))
    api.getStudentVideos.mockResolvedValue([video('pending', '深蹲')])
    await act(async () => { root.render(<PlanWorkspace onLogout={vi.fn()} me={me} />); await settle() })
    await act(async () => { clickNav(host, '总览'); await settle() })
    let release!: (videos: StudentVideo[]) => void
    api.getStudentVideos.mockImplementation(() => new Promise(resolve => { release = resolve }))
    await act(async () => { host.querySelector<HTMLButtonElement>('[data-alert-kind="videos"]')!.click(); await settle() })
    if (scenario === 'leave') await act(async () => { clickNav(host, '动作库'); await settle() })
    await act(async () => { release(scenario === 'empty' ? [] : [video('pending', '深蹲')]); await settle() })
    if (scenario === 'leave') await act(async () => { clickNav(host, '计划编排'); await settle() })
    expect(host.querySelector('.block-grid')).not.toBeNull()
    expect(host.querySelector('[data-feedback-mode]')).toBeNull()
    expect(host.querySelector('.history-player')).toBeNull()
  })

  it('013 unread opens chat, remembers collapse, and switches the conversation with the editor athlete', async () => {
    api.getPlan.mockResolvedValue(plan('聊天计划'))
    api.getCoachStudents.mockResolvedValue([
      { id: 'student', display_name: '学员', status: 'active', evaluation: null },
      { id: 'second', display_name: '乙', status: 'active', evaluation: null },
    ])
    api.listConversations.mockResolvedValue([chatConversation(3), { ...chatConversation(1), id: 'second-chat', other_party: { id: 'second', display_name: '乙' } }])
    api.getMessages.mockImplementation((id: string) => Promise.resolve({ messages: [{ ...chatMessage, conversation_id: id, body: id === 'second-chat' ? '乙的消息' : '甲的消息' }], meta: { other_last_read: null, has_more: false } }))
    await act(async () => { root.render(<PlanWorkspace onLogout={vi.fn()} me={me} />); await settle() })
    expect(host.querySelector('.editor-chat-toggle')?.textContent).toContain('3')
    await act(async () => { clickNav(host, '总览'); await settle() })
    expect(host.querySelector('.editor-chat')).toBeNull()
    await act(async () => { host.querySelector<HTMLButtonElement>('[data-student-id="student"] [data-alert-kind="chat"]')!.click(); await settle() })
    expect(host.querySelector('.editor-chat-window')?.textContent).toContain('甲的消息')
    await act(async () => { host.querySelector<HTMLButtonElement>('[data-testid="switch-second"]')!.click(); await settle() })
    expect(host.querySelector('.editor-chat-window')?.textContent).toContain('乙的消息')
    expect(host.querySelector('.editor-chat-window')?.textContent).not.toContain('甲的消息')
    await act(async () => { host.querySelector<HTMLButtonElement>('[aria-label="收起聊天"]')!.click(); await settle() })
    expect(host.querySelector('.editor-chat-window')).toBeNull()
    await act(async () => { host.querySelector<HTMLButtonElement>('.editor-chat-toggle')!.click(); await settle() })
    act(() => root.unmount()); root = createRoot(host)
    await act(async () => { root.render(<PlanWorkspace onLogout={vi.fn()} me={me} />); await settle() })
    expect(host.querySelector('.editor-chat-window')).not.toBeNull()
  })

  it('013 legacy messages address keeps its athlete and lands in the plan editor', async () => {
    window.history.replaceState(null, '', '?view=messages&studentId=second')
    api.getCoachStudents.mockResolvedValue([
      { id: 'student', display_name: '学员', status: 'active', evaluation: null },
      { id: 'second', display_name: '乙', status: 'active', evaluation: null },
    ])
    const target = { ...plan('乙计划'), trainee_id: 'second' }
    api.getStudentPlans.mockResolvedValue([target])
    api.getPlan.mockResolvedValue(target)
    try {
      await act(async () => { root.render(<PlanWorkspace onLogout={vi.fn()} me={me} />); await settle() })
      expect(host.querySelector('[data-testid="current-student"]')?.textContent).toBe('second')
      expect(api.markPlanViewed).not.toHaveBeenCalled()
      expect(host.querySelector('.coach-nav-item.active')?.textContent).toContain('计划编排')
    } finally { window.history.replaceState(null, '', '/') }
  })

  it('013 retries failed video loads, expands a collapsed rail temporarily, and keeps confirmed viewed state through stale refreshes', async () => {
    api.realEditor = true
    api.getPlan.mockResolvedValue(plan('safe'))
    api.getStudentVideos.mockRejectedValueOnce(new Error('offline'))
    await act(async () => { root.render(<PlanWorkspace onLogout={() => {}} me={me} />); await settle() })
    expect(host.querySelector('[data-video-marker]')).toBeNull()
    expect(host.querySelector('[data-block-week]')).not.toBeNull()
    api.getStudentVideos.mockResolvedValue([video('v1', '深蹲')])
    await act(async () => { clickButton(host, '待看加载失败'); await settle() })
    expect(host.querySelector('[data-video-marker]')).not.toBeNull()
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="收起历史"]')!.click())
    await act(async () => { host.querySelector<HTMLButtonElement>('[data-video-marker]')!.click(); await settle() })
    expect(host.querySelector('[data-block-history]')?.classList.contains('collapsed')).toBe(false)
    expect(api.markVideoViewed).not.toHaveBeenCalled()
    await playback(host)
    const reply = host.querySelector<HTMLTextAreaElement>('.video-feedback textarea')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(reply, '反馈')
      reply.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => { reply.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true, cancelable: true })); await settle() })
    expect(host.querySelector('[data-video-marker]')?.classList.contains('viewed')).toBe(true)
    expect(host.querySelector('[data-feedback-video="v1"]')).toBeNull()
    await act(async () => { clickButton(host, '← 历史'); await settle() })
    expect(host.querySelector('[data-block-history]')?.classList.contains('collapsed')).toBe(true)
    await act(async () => { host.querySelector<HTMLButtonElement>('[data-video-marker]')!.click(); await settle() })
    expect(api.markVideoViewed).toHaveBeenCalledTimes(1)
    expect(api.reconcilePlan).not.toHaveBeenCalled()
  })

  it('013 repair 1 keeps the player and unsent reply when marking viewed succeeds without a list reload', async () => {
    api.realEditor = true
    api.getPlan.mockResolvedValue(plan('reply survives'))
    api.getStudentVideos.mockResolvedValue([video('v1', '深蹲')])
    await act(async () => { root.render(<PlanWorkspace onLogout={() => {}} me={me} />); await settle() })
    await act(async () => { host.querySelector<HTMLButtonElement>('[data-video-marker]')!.click(); await settle() })
    const reply = host.querySelector<HTMLTextAreaElement>('.video-feedback textarea')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(reply, '尚未发送的反馈')
      reply.dispatchEvent(new Event('input', { bubbles: true }))
    })
    api.getStudentVideos.mockRejectedValue(new Error('list unavailable'))
    await playback(host)
    expect(host.querySelector('video')).not.toBeNull()
    expect(host.querySelector<HTMLTextAreaElement>('.video-feedback textarea')?.value).toBe('尚未发送的反馈')
    expect(host.querySelector('[data-video-marker]')?.classList.contains('viewed')).toBe(true)
    expect(host.querySelector('[data-feedback-video="v1"]')).toBeNull()
  })

  it('013 repair 1 historical play waits until halfway and updates the brick once', async () => {
    api.realEditor = true
    api.getPlan.mockResolvedValue(plan('history'))
    api.getStudentVideos.mockResolvedValue([video('v1', '深蹲')])
    const session = { date: '2026-01-05', prescribed: { sets: 1, reps: 5 }, sets: [{ set_index: 0, weight_kg: '100', reps: 5, rpe: '8', completed: true, failed: false, assumed: false, has_video: true, video_id: 'v1' }] }
    api.getExerciseStats.mockResolvedValue({ recent_sessions: [session], filtered_sessions: [session], rep_prs: [], by_set_count: {} })
    await act(async () => { root.render(<PlanWorkspace onLogout={() => {}} me={me} />); await settle() })
    await act(async () => { host.querySelector<HTMLElement>('[data-block-week]')!.click(); await settle() })
    await act(async () => { host.querySelector<HTMLInputElement>('[data-c="reps"] input')!.focus(); await settle() })
    await act(async () => { host.querySelector<HTMLButtonElement>('.history-session summary button')!.click(); await settle() })
    expect(host.querySelector('[data-feedback-mode]')).toBeNull()
    expect(host.querySelector('.video-rpe-calibration')).toBeNull()
    expect(api.markVideoViewed).not.toHaveBeenCalled()
    await playback(host, 9.99)
    expect(api.markVideoViewed).not.toHaveBeenCalled()
    await playback(host)
    await playback(host, 15)
    expect(api.markVideoViewed).toHaveBeenCalledTimes(1)
    expect(api.markVideoViewed).toHaveBeenCalledWith('v1')
    expect(host.querySelector('[data-video-marker]')?.classList.contains('viewed')).toBe(true)
  })

  it('013 keeps feedback across plans, resets it across students, and preserves queue focus after opening', async () => {
    api.realEditor = true
    const first = { ...plan('first'), name: 'First plan' }
    const second = { ...plan('second'), id: 'second', name: 'Second plan', days: [] }
    const other = { ...plan('other'), id: 'other', name: 'Other plan', trainee_id: 'other-student', days: [] }
    api.getCoachStudents.mockResolvedValue([{ id: 'student', display_name: '甲', status: 'active', evaluation: null }, { id: 'other-student', display_name: '乙', status: 'active', evaluation: null }])
    api.getStudentPlans.mockImplementation((id: string) => Promise.resolve(id === 'student' ? [first, second] : [other]))
    api.getPlan.mockImplementation((id: string) => Promise.resolve(id === 'second' ? second : id === 'other' ? other : first))
    api.getStudentVideos.mockResolvedValue([video('v1', '深蹲'), video('v2', '深蹲'), video('v3', '深蹲')])
    await act(async () => { root.render(<PlanWorkspace onLogout={() => {}} me={me} />); await settle() })
    await act(async () => { clickButton(host, '待看 3'); await settle() })
    expect(api.markVideoViewed).not.toHaveBeenCalled()
    await playback(host)
    const item = host.querySelector<HTMLElement>('[data-feedback-video="v2"]')!
    await act(async () => { item.focus(); item.click(); await settle() })
    expect(host.querySelector('[data-block-history]')?.contains(document.activeElement)).toBe(true)
    expect(api.markVideoViewed).toHaveBeenCalledTimes(1)
    await playback(host)
    await act(async () => { document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })); await settle() })
    expect(api.markVideoViewed).toHaveBeenCalledTimes(2)
    await playback(host)
    expect(api.markVideoViewed.mock.calls.map(call => call[0])).toEqual(['v1', 'v2', 'v3'])
    await act(async () => { document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })); await settle() })
    expect(host.querySelector('video')).not.toBeNull()
    const switchPlan = async (name: string) => {
      await act(async () => host.querySelector<HTMLElement>('[data-plan-menu-trigger]')!.click())
      await act(async () => { clickButton(document.body, name); await settle() })
    }
    await switchPlan('Second plan')
    expect(host.querySelector('[data-feedback-mode]')).not.toBeNull()
    await act(async () => host.querySelector<HTMLInputElement>('.feedback-head input')!.click())
    expect(host.querySelector('.feedback-queue')?.textContent).toContain('不在本计划')
    expect(host.querySelector('[data-feedback-video="v1"]')?.textContent).not.toContain('W1')
    const switchStudent = async (name: string) => {
      await act(async () => { const button = [...host.querySelectorAll<HTMLButtonElement>('.block-topbar button')].find(el => el.textContent?.startsWith('学员'))!; button.click() })
      await act(async () => { clickButton(document.body, name); await settle() })
    }
    await switchStudent('乙')
    expect(host.querySelector('[data-feedback-mode]')).toBeNull()
    expect(host.querySelector('.history-breadcrumbs')).toBeNull()
    await switchStudent('甲')
    expect(host.querySelector('[data-feedback-mode]')).toBeNull()
  })

  it('013 repair 1 numbers the floating player against the currently visible queue', async () => {
    api.realEditor = true
    api.getPlan.mockResolvedValue(plan('positions'))
    api.getStudentVideos.mockResolvedValue([
      { ...video('seen', '深蹲', '2026-01-05'), set_index: 0 },
      { ...video('v1', '深蹲'), set_index: 1 },
      { ...video('v2', '深蹲'), set_index: 2 },
    ])
    await act(async () => { root.render(<PlanWorkspace onLogout={() => {}} me={me} />); await settle() })
    await act(async () => { clickButton(host, '待看 2'); await settle() })
    const position = () => host.querySelector('.history-player > header > small')?.textContent
    const includeViewed = async () => act(async () => { host.querySelector<HTMLInputElement>('.feedback-head input')!.click(); await settle() })
    expect(position()).toBe('1 / 2')
    await includeViewed()
    expect(position()).toBe('2 / 3')
    await includeViewed()
    expect(position()).toBe('1 / 2')
    await playback(host)
    expect(host.querySelector('[data-feedback-video="v1"]')).toBeNull()
    expect(position()).toBeUndefined()
    await includeViewed()
    expect(position()).toBe('2 / 3')
    await includeViewed()
    await act(async () => { host.querySelector<HTMLButtonElement>('[data-feedback-video="v2"]')!.click(); await settle() })
    expect(position()).toBe('1 / 1')
    await playback(host)
    expect(position()).toBeUndefined()
  })

  it('013 show actuals persists per coach, leaves unlogged prescriptions gray, keeps student additions read-only and copies prescriptions', async () => {
    api.realEditor = true
    const loaded = plan('prescribed')
    loaded.days[0].exercises[0].has_logs = true
    loaded.days[0].exercises.push({ ...loaded.days[0].exercises[0], id: 'future', has_logs: false })
    api.getPlan.mockResolvedValue(loaded)
    api.getStudentSetLogs.mockResolvedValue([
      { id: 'set-log', student_id: 'student', plan_exercise_id: 'plan-exercise', plan_day_id: 'day', exercise_id: 'exercise', set_index: 0, weight_kg: '123', reps: 3, rpe: '8.5', coach_rpe: null, completed: true, failed: false, assumed: false, adhoc: false, logged_at: '2026-01-05', logged_date: '2026-01-05' },
      { id: 'extra', student_id: 'student', plan_exercise_id: 'plan-exercise', plan_day_id: 'day', exercise_id: 'exercise', set_index: 1, weight_kg: '125', reps: 2, rpe: null, coach_rpe: null, completed: false, failed: true, assumed: false, adhoc: false, logged_at: '2026-01-05', logged_date: '2026-01-05' },
      { id: 'added', student_id: 'student', plan_exercise_id: null, plan_day_id: 'day', exercise_id: 'curl', set_index: 0, weight_kg: '20', reps: 12, rpe: '7', coach_rpe: null, completed: true, failed: false, assumed: false, adhoc: true, logged_at: '2026-01-05', logged_date: '2026-01-05' },
    ])
    api.getStudentVideos.mockResolvedValue([{ ...video('added-video', '弯举'), plan_exercise_id: null, set_log_id: 'added' }])
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    await act(async () => { root.render(<PlanWorkspace onLogout={() => {}} me={me} />); await settle() })
    const toggle = host.querySelector<HTMLButtonElement>('[role="switch"][aria-label="显示实际"]')!
    expect(toggle).not.toBeNull()
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    expect(host.querySelector('.block-brick')?.textContent).toContain('1×5 · 100')
    expect(host.querySelector('.block-date [data-video-marker]')).not.toBeNull()
    await act(async () => toggle.click())
    const actual = host.querySelector<HTMLElement>('[data-rowid="plan-exercise"]')!
    expect(actual.textContent).toContain('2×3/2 @8.5/— · 123/125')
    expect(actual.title).toContain('处方 1×5 · 100')
    expect(host.querySelector('[data-rowid="future"]')?.classList.contains('prescribed-muted')).toBe(true)
    const added = host.querySelector<HTMLElement>('.block-brick[data-student-added="curl"]')!
    expect(added.textContent).toContain('1×12 @7 · 20')
    expect(added.hasAttribute('data-rowid')).toBe(false)
    expect(added.hasAttribute('tabindex')).toBe(false)
    expect(added.querySelector('[data-video-marker]')).not.toBeNull()
    expect(host.querySelector('.block-date [data-video-marker]')).toBeNull()
    await act(async () => actual.click())
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', metaKey: true, bubbles: true })); await settle() })
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText.mock.calls[0][0]).toContain('100')
    expect(writeText.mock.calls[0][0]).not.toContain('123')
    await act(async () => host.querySelector<HTMLElement>('[data-block-week]')!.click())
    const actualLine = host.querySelector('[data-actuals="weight"]')?.textContent
    await act(async () => { toggle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); toggle.click() })
    expect(host.querySelector('.daygrid')).not.toBeNull()
    expect(host.querySelector('[data-actuals="weight"]')?.textContent).toBe(actualLine)
    await act(async () => toggle.click())
    expect(localStorage.getItem('meetpr:show-actuals:coach')).toBe('true')
    await act(async () => { root.render(<PlanWorkspace key="reload" onLogout={() => {}} me={me} />); await settle() })
    expect(host.querySelector('[role="switch"]')?.getAttribute('aria-checked')).toBe('true')
    expect(api.reconcilePlan).not.toHaveBeenCalled()
  })

  it('013 opens feedback from a brick, marks viewed only at halfway with retry, and Escape leaves reply then player then feedback then edit card', async () => {
    api.realEditor = true
    api.getPlan.mockResolvedValue(plan('keep this note'))
    api.getStudentVideos.mockResolvedValue([video('v1', '深蹲'), video('v2', '深蹲')])
    await act(async () => { root.render(<PlanWorkspace onLogout={() => {}} me={me} />); await settle() })
    const marker = host.querySelector<HTMLButtonElement>('[data-video-marker]')
    expect(marker).not.toBeNull()
    await act(async () => { host.querySelector<HTMLElement>('[data-block-week]')!.click(); await settle() })
    await act(async () => { host.querySelector<HTMLButtonElement>('[data-video-marker]')!.click(); await settle() })
    expect(host.querySelector('[data-feedback-mode]')).not.toBeNull()
    expect(host.querySelector('[role="dialog"][aria-label="训练视频"]')).not.toBeNull()
    expect(host.querySelector('.daygrid')).not.toBeNull()
    expect(api.markVideoViewed).not.toHaveBeenCalled()
    expect(host.querySelector('[data-feedback-video="v1"]')).not.toBeNull()
    await playback(host, 9.99)
    expect(api.markVideoViewed).not.toHaveBeenCalled()
    api.markVideoViewed.mockRejectedValueOnce(new Error('offline'))
    await playback(host)
    expect(api.markVideoViewed).toHaveBeenCalledTimes(1)
    expect(host.querySelector('[data-feedback-video="v1"]')).not.toBeNull()
    await playback(host)
    await playback(host, 15)
    expect(api.markVideoViewed).toHaveBeenCalledTimes(2)
    expect(api.markVideoViewed).toHaveBeenCalledWith('v1')
    expect(host.querySelector('[data-video-marker]')?.textContent).toContain('1')
    expect(host.querySelector('[data-feedback-video="v1"]')).toBeNull()
    await act(async () => { host.querySelector<HTMLElement>('[data-feedback-mode]')!.focus(); document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit1', key: '1', altKey: true, bubbles: true, cancelable: true })); await settle() })
    // Quick replies are off in the feedback rail for now (David, 2026-10-19): ⌥1 writes nothing.
    expect(host.querySelector('.feedback-quick-replies')).toBeNull()
    expect(host.querySelector<HTMLTextAreaElement>('.video-feedback textarea')?.value).toBe('')
    const reply = host.querySelector<HTMLTextAreaElement>('.video-feedback textarea')!
    await act(async () => reply.focus())
    const escape = async () => act(async () => { document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); await settle() })
    await escape()
    expect(document.activeElement).not.toBe(reply)
    expect(host.querySelector('video')).not.toBeNull()
    await act(async () => host.querySelector<HTMLElement>('[data-video-marker]')!.focus())
    await escape()
    expect(host.querySelector('video')).toBeNull()
    expect(host.querySelector('[data-feedback-mode]')).not.toBeNull()
    await escape()
    expect(host.querySelector('[data-feedback-mode]')).toBeNull()
    expect(host.querySelector('.daygrid')).not.toBeNull()
    await escape()
    expect(host.querySelector('.daygrid')).toBeNull()
  })

  beforeEach(() => {
    api.realEditor = false
    api.getStudentSetLogs.mockResolvedValue([])
    api.markVideoViewed.mockResolvedValue(undefined)
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
    api.meRequest.mockResolvedValue({ user: { email: 'coach@example.test', role: 'coach' } })
    api.publicInvite.mockResolvedValue({ valid: true, coach_display_name: '教练' })
    api.rejectBindRequest.mockResolvedValue(undefined)
    api.getOverviewAlerts.mockResolvedValue({ generated_at: '2026-10-22T09:00:00Z', plan_ending: [], training: [] })
    api.markPlanViewed.mockResolvedValue(undefined)
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
    api.reconcilePlan.mockImplementation(async (_id: string, weeks: Week[]) => ({
      changedDays: 1,
      degradedRows: 0,
      skippedRows: 0,
      weeks,
    }))
    api.reconcileImportedPlan.mockImplementation(async (_id: string, weeks: Week[]) => ({
      changedDays: 1,
      degradedRows: 0,
      skippedRows: 0,
      weeks,
    }))
    api.resizeServerPlanWeeks.mockResolvedValue(undefined)
    api.guardLeave.mockResolvedValue(true)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.useRealTimers()
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  async function submitMondayPlan(): Promise<void> {
    await act(async () => {
      root.render(<PlanWorkspace onLogout={vi.fn()} me={me} />)
      await settle()
    })
    await act(async () => clickButton(host, '新建计划'))
    const startDate = host.querySelector<HTMLInputElement>('input[type="date"]')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(startDate, '2026-08-10')
      startDate.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await act(async () => {
      clickButton(host, '创建计划')
      await settle()
    })
  }

  it('sends the selected D1 weekday in the create-plan request', async () => {
    const created = studentPlan({ id: 'new-plan', studentId: 'student', name: '新计划', startDate: '2026-08-10' })
    api.getStudentPlans.mockResolvedValue([])
    api.createPlan.mockResolvedValue(created)
    api.getPlan.mockResolvedValue(created)

    await submitMondayPlan()

    expect(api.createPlan).toHaveBeenCalledTimes(1)
    expect(api.createPlan).toHaveBeenCalledWith(expect.objectContaining({
      start_date: '2026-08-10',
      plan_weeks: 4,
      anchor_weekday: 1,
    }))
    expect(api.patchPlan).not.toHaveBeenCalled()
    expect(JSON.parse(window.localStorage.getItem('meetpr.plan-editor.weekdays.new-plan')!)).toEqual([0, 2, 4, 5])
  }, 15_000)

  it('falls back to legacy create then patches the weekday when create validation rejects anchor_weekday', async () => {
    const created = studentPlan({ id: 'legacy-plan', studentId: 'student', name: '新计划', startDate: '2026-08-10' })
    api.getStudentPlans.mockResolvedValue([])
    api.createPlan
      .mockRejectedValueOnce(new ApiException(400, 'VALIDATION_ERROR', {
        issues: [{ path: ['body', 'anchor_weekday'], message: 'unexpected field' }],
      }))
      .mockResolvedValueOnce(created)
    api.patchPlan.mockResolvedValue({ ...created, anchor_weekday: 1 })
    api.getPlan.mockResolvedValue({ ...created, anchor_weekday: 1 })

    await submitMondayPlan()

    expect(api.createPlan).toHaveBeenCalledTimes(2)
    expect(api.createPlan.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ anchor_weekday: 1 }))
    expect(api.createPlan.mock.calls[1]?.[0]).not.toHaveProperty('anchor_weekday')
    expect(api.patchPlan).toHaveBeenCalledWith('legacy-plan', { anchor_weekday: 1 })
  }, 15_000)

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

  it('discards an exercise command when the editor leave guard cancels navigation', async () => {
    api.getPlan.mockResolvedValue(plan('未保存编辑'))
    api.guardLeave.mockResolvedValue(false)

    await act(async () => {
      root.render(<PlanWorkspace onLogout={vi.fn()} me={me} />)
      await settle()
    })
    await act(async () => {
      host.querySelector<HTMLButtonElement>('.coach-search-shell')?.click()
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })
    const search = host.querySelector<HTMLInputElement>('[aria-label="搜索命令"]')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(search, '深蹲')
      search.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(host.querySelectorAll('[role="option"]')).toHaveLength(1)
    expect(host.querySelector('[role="option"]')?.textContent).toContain('深蹲')
    await act(async () => {
      search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      await settle()
    })

    expect(api.guardLeave).toHaveBeenCalledTimes(1)
    expect(host.querySelector('[data-testid="editor-note"]')).not.toBeNull()

    api.guardLeave.mockResolvedValue(true)
    await act(async () => {
      clickButton(host, '动作库')
      await settle()
    })
    expect(host.querySelector('[data-testid="command-exercise"]')?.textContent).toBe('')
  }, 15_000)

  it.each(['board', 'requests', null])('019 R1 always starts in planning without persisting navigation: %s', async stored => {
    if (stored) localStorage.setItem('mpw.coachView', stored)
    api.getPlan.mockResolvedValue(plan('启动计划'))
    await act(async () => { root.render(<PlanWorkspace me={me} onLogout={() => {}} />); await settle() })
    expect(host.querySelector('.coach-nav-item.active')?.textContent).toContain('计划编排')
    await act(async () => { clickNav(host, '总览'); await settle() })
    expect(localStorage.getItem('mpw.coachView')).toBe(stored)
  })

  it.each(['double-click', 'Enter', 'switcher', 'command', 'same-student command'])('019 R1 marks only an explicitly opened student plan: %s', async entry => {
    api.getCoachStudents.mockResolvedValue([
      { id: 'student', display_name: '学员', status: 'active', evaluation: null },
      { id: 'second', display_name: '乙', status: 'active', evaluation: null },
    ])
    const second = { ...plan('乙计划'), id: 'second-plan', trainee_id: 'second' }
    api.getStudentPlans.mockImplementation(async id => [id === 'second' ? second : plan('首个计划')])
    api.getPlan.mockImplementation(async id => id === 'second-plan' ? second : plan('首个计划'))
    await act(async () => { root.render(<PlanWorkspace me={me} onLogout={() => {}} />); await settle() })
    expect(host.querySelector('[data-testid="current-student"]')?.textContent).toBe('student')
    expect(api.markPlanViewed).not.toHaveBeenCalled()
    const target = entry === 'same-student command' ? 'student' : 'second'
    if (entry === 'switcher') {
      await act(async () => { host.querySelector<HTMLButtonElement>('[data-testid="switch-second"]')!.click(); await settle() })
    } else if (entry.includes('command')) {
      await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true })); await settle() })
      const search = host.querySelector<HTMLInputElement>('[aria-label="搜索命令"]')!
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(search, target === 'second' ? '乙' : '学员')
        search.dispatchEvent(new Event('input', { bubbles: true }))
      })
      await act(async () => { search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await settle() })
    } else {
      await act(async () => { clickNav(host, '总览'); await settle() })
      await act(async () => { host.querySelector<HTMLElement>('[data-student-id="second"]')!.click(); await settle() })
      expect(api.markPlanViewed).not.toHaveBeenCalled()
      await act(async () => {
        if (entry === 'Enter') window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        else host.querySelector('[data-student-id="second"]')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
        await settle()
      })
    }
    expect(host.querySelector('[data-testid="current-student"]')?.textContent).toBe(target)
    expect(api.markPlanViewed).toHaveBeenCalledTimes(1)
    expect(api.markPlanViewed).toHaveBeenCalledWith(target)
  })

  it('019 R1 caches invitation requests across overview visits within one workspace session', async () => {
    api.getPlan.mockResolvedValue(plan('邀请缓存'))
    api.getInviteCodes.mockResolvedValue([{ code: 'INVITE', type: 'personal_permanent', revoked_at: null }])
    await act(async () => { root.render(<PlanWorkspace me={me} onLogout={() => {}} />); await settle() })
    expect(api.meRequest).not.toHaveBeenCalled()
    for (let visit = 0; visit < 2; visit++) {
      await act(async () => { clickNav(host, '总览'); await settle() })
      expect(host.querySelector('.overview-invitation')?.textContent).toContain('INVITE')
      await act(async () => { clickNav(host, '计划编排'); await settle() })
    }
    expect(api.meRequest).toHaveBeenCalledTimes(1)
    expect(api.getInviteCodes).toHaveBeenCalledTimes(1)
    expect(api.publicInvite).toHaveBeenCalledTimes(1)
    await act(async () => { root.render(<PlanWorkspace key="new-session" me={me} onLogout={() => {}} />); await settle() })
    await act(async () => { clickNav(host, '总览'); await settle() })
    expect(api.meRequest).toHaveBeenCalledTimes(2)
    expect(api.getInviteCodes).toHaveBeenCalledTimes(2)
    expect(api.publicInvite).toHaveBeenCalledTimes(2)
  })

  it('019 R1 retries failed invitations and caches the successful retry', async () => {
    api.getPlan.mockResolvedValue(plan('重试邀请'))
    api.getInviteCodes.mockResolvedValue([{ code: 'INVITE', type: 'personal_permanent', revoked_at: null }])
    api.publicInvite.mockRejectedValueOnce(new Error('offline'))
    await act(async () => { root.render(<PlanWorkspace me={me} onLogout={() => {}} />); await settle() })
    await act(async () => { clickNav(host, '总览'); await settle() })
    expect(host.querySelector('.overview-invite [role="alert"]')).not.toBeNull()
    await act(async () => { host.querySelector<HTMLButtonElement>('.overview-invite [role="alert"] button')!.click(); await settle() })
    expect(host.querySelector('.overview-invitation')?.textContent).toContain('INVITE')
    await act(async () => { clickNav(host, '计划编排'); await settle() })
    await act(async () => { clickNav(host, '总览'); await settle() })
    expect(api.meRequest).toHaveBeenCalledTimes(2)
    expect(api.getInviteCodes).toHaveBeenCalledTimes(2)
    expect(api.publicInvite).toHaveBeenCalledTimes(2)
  })

  it('019 shows invitations and requests above the two-section six-column overview', async () => {
    api.getPlan.mockResolvedValue(plan('总览'))
    api.getBindRequests.mockResolvedValue([bindRequest])
    await act(async () => { root.render(<PlanWorkspace me={me} onLogout={() => {}} />); await settle() })
    await act(async () => { clickNav(host, '总览'); await settle() })
    expect(host.querySelector('.overview-invite')?.textContent).toContain('邀请学员')
    expect(host.querySelectorAll('.overview-invite li')).toHaveLength(4)
    expect(host.querySelector('.request-card')?.textContent).toContain('新学员')
    expect(host.querySelectorAll('.roster-overview-head > *')).toHaveLength(6)
    expect(host.querySelectorAll('.overview-section-head')).toHaveLength(2)
    expect(host.querySelector('.roster-segments')).toBeNull()
    expect([...host.querySelectorAll('.coach-nav-item')].some(el => el.textContent?.includes('学员申请'))).toBe(false)
    expect(host.querySelector('.coach-queue-heading')).toBeNull()
  })

  it.each(['rpe_over', 'incomplete', 'behind'] as const)('019 opens the alert day from %s and marks the student viewed', async type => {
    api.realEditor = true
    const target = plan('提醒训练日', 'published')
    api.getStudentPlans.mockResolvedValue([target])
    api.getPlan.mockResolvedValue(target)
    let seen = false
    api.markPlanViewed.mockImplementation(async () => { seen = true })
    api.getOverviewAlerts.mockImplementation(async () => ({ generated_at: '2026-10-22T09:00:00Z', plan_ending: [], training: seen ? [] : [{
      student_id: 'student', latest_at: '2026-10-21T12:00:00Z', items: [type === 'behind'
        ? { type, recommended_date: '2026-01-05', plan_day_id: 'day', week_number: 1 }
        : { type, date: '2026-01-05', plan_day_id: 'day', plan_exercise_id: 'plan-exercise', exercise_id: 'exercise', set_index: 0, reason: 'missing', target_rpe: '8', actual_rpe: '9' }],
    }] }))
    await act(async () => { root.render(<PlanWorkspace me={me} onLogout={() => {}} />); await settle() })
    await act(async () => { clickNav(host, '总览'); await settle() })
    expect(api.markPlanViewed).not.toHaveBeenCalled()
    await act(async () => { host.querySelector<HTMLButtonElement>(`[data-alert-kind="${type}"]`)!.click(); await settle() })
    expect(api.markPlanViewed).toHaveBeenCalledWith('student')
    expect(host.querySelector('.block-edit-head')).not.toBeNull()
    if (type === 'behind') expect(document.querySelector('[data-plan-shift-panel]')).not.toBeNull()
    else expect(host.querySelector('[data-alert-set-index="0"] .overview-set-highlight')?.textContent).toBe('第 1 组')
    await act(async () => { clickNav(host, '总览'); await settle() })
    expect(host.querySelector(`[data-alert-kind="${type}"]`)).toBeNull()
  })

  it('019 keeps the board visible while resolving an alert in another plan', async () => {
    const remembered = { ...plan('正在编辑的草稿'), id: 'draft', days: [] }
    const target = { ...plan('提醒训练日', 'published'), id: 'target' }
    api.getStudentPlans.mockResolvedValue([remembered, target])
    api.getPlan.mockImplementation(async id => id === 'draft' ? remembered : target)
    api.getOverviewAlerts.mockResolvedValue({ generated_at: '', plan_ending: [], training: [{ student_id: 'student', latest_at: '2026-10-21', items: [{ type: 'incomplete', date: '2026-10-21', plan_day_id: 'day', plan_exercise_id: 'plan-exercise', exercise_id: 'exercise', set_index: 1, reason: 'missing' }] }] })
    await act(async () => { root.render(<PlanWorkspace me={me} onLogout={() => {}} />); await settle() })
    await act(async () => { clickNav(host, '总览'); await settle() })
    let resolveTarget!: (value: PlanWithChildren) => void
    api.getPlan.mockImplementation(id => id === 'target' ? new Promise(resolve => { resolveTarget = resolve }) : Promise.resolve(remembered))
    await act(async () => { host.querySelector<HTMLButtonElement>('[data-alert-kind="incomplete"]')!.click(); await settle() })
    expect(host.querySelector('.overview-page')).not.toBeNull()
    expect(host.querySelector('[data-testid="current-student"]')).toBeNull()
    await act(async () => { resolveTarget(target); await settle() })
    expect(host.querySelector('[data-testid="editor-note"]')?.textContent).toBe('提醒训练日')
  })

  it('019 pre-fills the next plan date and keeps the plan-ending tag when creation is cancelled', async () => {
    api.getPlan.mockResolvedValue(plan('计划', 'published'))
    api.getOverviewAlerts.mockResolvedValue({ generated_at: '', training: [], plan_ending: [{ student_id: 'student', plan_id: 'plan', plan_name: '计划', end_date: '2026-10-25', days_left: 3 }] })
    await act(async () => { root.render(<PlanWorkspace me={me} onLogout={() => {}} />); await settle() })
    await act(async () => { clickNav(host, '总览'); await settle() })
    await act(async () => { host.querySelector<HTMLButtonElement>('[data-alert-kind="plan_ending"]')!.click(); await settle() })
    expect(host.querySelector<HTMLInputElement>('[role="dialog"] input[type="date"]')?.value).toBe('2026-10-26')
    await act(async () => { clickButton(host, '取消'); clickNav(host, '总览'); await settle() })
    expect(host.querySelector('[data-alert-kind="plan_ending"]')?.textContent).toBe('计划剩 3 天')
  })

  it('019 a low completion tag opens tracking with that student selected', async () => {
    api.getPlan.mockResolvedValue(plan('计划'))
    await act(async () => { root.render(<PlanWorkspace me={me} onLogout={() => {}} />); await settle() })
    await act(async () => { clickNav(host, '总览'); await settle() })
    await act(async () => { host.querySelector<HTMLButtonElement>('[data-alert-kind="completion"]')!.click(); await settle() })
    expect(host.querySelector('.coach-nav-item[aria-current="page"]')?.textContent).toBe('追踪')
    expect(host.querySelector('.tracking-dashboard')?.textContent ?? host.textContent).toContain('学员')
  })

  it.each([500, 404])('019 reminder %s preserves requests, invitation, and other tags', async status => {
    api.getPlan.mockResolvedValue(plan('计划'))
    api.getBindRequests.mockResolvedValue([bindRequest])
    api.getOverviewAlerts.mockRejectedValue(new ApiException(status, 'UNAVAILABLE'))
    await act(async () => { root.render(<PlanWorkspace me={me} onLogout={() => {}} />); await settle() })
    await act(async () => { clickNav(host, '总览'); await settle() })
    expect(host.querySelector('.overview-invite')?.textContent).toContain('暂时没有有效的永久邀请码')
    expect(host.querySelector('.request-card')).not.toBeNull()
    expect(host.querySelector('[data-alert-kind="completion"]')).not.toBeNull()
    expect(!!host.querySelector('[data-alert-kind="plan_ending"]')).toBe(status === 404)
    expect(!!host.querySelector('.overview-alert-error')).toBe(status === 500)
    if (status === 500) {
      api.getOverviewAlerts.mockResolvedValue({ generated_at: '', training: [], plan_ending: [] })
      await act(async () => { host.querySelector<HTMLButtonElement>('.overview-alert-error button')!.click(); await settle() })
      expect(host.querySelector('.overview-alert-error')).toBeNull()
    }
  })

  it('019 rejects a request in the overview after opening its onboarding details', async () => {
    api.getPlan.mockResolvedValue(plan('计划'))
    api.getBindRequests.mockResolvedValue([bindRequest])
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await act(async () => { root.render(<PlanWorkspace me={me} onLogout={() => {}} />); await settle() })
    await act(async () => { clickNav(host, '总览'); await settle() })
    await act(async () => host.querySelector<HTMLElement>('.request-row')!.click())
    expect(host.querySelector('.request-detail')).not.toBeNull()
    expect(host.querySelector('.request-card')?.textContent).not.toContain('INVITE')
    await act(async () => { host.querySelector<HTMLButtonElement>('.request-reject')!.click(); await settle() })
    expect(api.rejectBindRequest).toHaveBeenCalledWith('request')
    expect(host.querySelector('.request-card')).toBeNull()
    expect(host.querySelector('.overview-requests')?.textContent).toContain('暂无新申请')
  })

  it('019 publishing the next plan clears the ending reminder after returning to overview', async () => {
    api.getPlan.mockResolvedValue(plan('下一份草稿'))
    let published = false
    api.publishPlan.mockImplementation(async () => { published = true; return plan('已发布', 'published') })
    api.getOverviewAlerts.mockImplementation(async () => ({ generated_at: '2026-10-22T12:00:00Z', training: [], plan_ending: published ? [] : [{ student_id: 'student', plan_id: 'ending', plan_name: '当前计划', end_date: '2026-10-24', days_left: 2 }] }))
    await act(async () => { root.render(<PlanWorkspace me={me} onLogout={() => {}} />); await settle() })
    await act(async () => { clickNav(host, '总览'); await settle() })
    expect(host.querySelector('[data-alert-kind="plan_ending"]')).not.toBeNull()
    await act(async () => { clickNav(host, '计划编排'); await settle() })
    await act(async () => { host.querySelector<HTMLButtonElement>('[data-testid="publish-plan"]')!.click(); await settle() })
    await act(async () => { clickNav(host, '总览'); await settle() })
    expect(host.querySelector('[data-alert-kind="plan_ending"]')).toBeNull()
  })

  it('019 refreshes alerts only while visible and plan-viewed failures never block editing', async () => {
    vi.useFakeTimers()
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    api.getPlan.mockResolvedValue(plan('可用计划'))
    api.markPlanViewed.mockRejectedValue(new Error('offline'))
    await act(async () => { root.render(<PlanWorkspace me={me} onLogout={() => {}} />); await settle() })
    expect(host.querySelector('[data-testid="editor-note"]')?.textContent).toBe('可用计划')
    expect(api.markPlanViewed).not.toHaveBeenCalled()
    await act(async () => { clickNav(host, '总览'); await settle() })
    await act(async () => { host.querySelector('[data-student-id="student"]')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); await settle() })
    expect(api.markPlanViewed).toHaveBeenCalledWith('student')
    expect(host.querySelector('[data-testid="editor-note"]')?.textContent).toBe('可用计划')
    const before = api.getOverviewAlerts.mock.calls.length
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); await settle() })
    expect(api.getOverviewAlerts).toHaveBeenCalledTimes(before + 1)
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); await settle() })
    expect(api.getOverviewAlerts).toHaveBeenCalledTimes(before + 1)
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  })

  it('019 zero students keeps both top cards and the acceptance hint', async () => {
    api.getCoachStudents.mockResolvedValue([])
    await act(async () => { root.render(<PlanWorkspace me={me} onLogout={() => {}} />); await settle() })
    await act(async () => { clickNav(host, '总览'); await settle() })
    expect(host.querySelector('.overview-invite')).not.toBeNull()
    expect(host.querySelector('.overview-requests')?.textContent).toContain('暂无新申请')
    expect(host.querySelector('.empty-page')?.textContent).toBe('接受申请后，学员会出现在这里')
    expect(host.querySelector('.roster-overview')).toBeNull()
  })

  it('loads one exercise-stats overview request per student during foreground and roster hydration', async () => {
    api.getPlan.mockResolvedValue(plan('概览请求去重'))

    await act(async () => {
      root.render(<PlanWorkspace onLogout={vi.fn()} me={me} />)
      await settle()
    })

    expect(api.getExerciseStatsOverview).toHaveBeenCalledTimes(1)
    expect(api.getExerciseStatsOverview).toHaveBeenCalledWith('student')
  }, 15_000)

  it('does not cache an overview rejection as empty and retries only that request from the roster cell', async () => {
    api.getPlan.mockResolvedValue(plan('概览失败可重试'))
    api.getExerciseStatsOverview
      .mockRejectedValueOnce(new Error('overview offline'))
      .mockResolvedValueOnce({
        exercises: [],
        one_rm: { squat: '140', bench: '90', deadlift: '170' },
        last_trained_at: null,
        recent_4w: { trained_days: 3, total_planned_days: 4, completion_rate: .75 },
      })

    await act(async () => {
      root.render(<PlanWorkspace onLogout={vi.fn()} me={me} />)
      await settle()
    })
    await act(async () => {
      clickButton(host, '总览')
      await settle()
    })

    expect(api.getExerciseStatsOverview).toHaveBeenCalledTimes(1)
    expect(host.textContent).toContain('e1RM 拉取失败')
    expect(host.textContent).not.toContain('尚无实测或登记值')

    await act(async () => {
      clickButton(host, 'e1RM 拉取失败')
      await settle()
    })

    expect(api.getExerciseStatsOverview).toHaveBeenCalledTimes(2)
    expect(host.textContent).not.toContain('e1RM 拉取失败')
    expect(host.querySelector('[data-student-id="student"] .roster-completion')?.textContent).toContain('75%')
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
    expect(host.querySelector('.coach-statusbar')?.textContent).not.toContain('待排')
    const studentTab = [...host.querySelectorAll('button')].find((item) => item.firstElementChild?.textContent === '计划编排')
    expect(studentTab?.querySelector('.coach-nav-badge')).toBeNull()
  }, 15_000)

  it('retries a workspace boot failure without logging out or clearing draft mirrors', async () => {
    const onLogout = vi.fn()
    const mirrorKey = 'meetpr.planEditor.draftMirror.keep-me'
    window.localStorage.setItem(mirrorKey, 'local-draft')
    api.getCoachStudents.mockRejectedValueOnce(new Error('offline'))
    api.getPlan.mockResolvedValue(plan('重试后恢复'))

    await act(async () => {
      root.render(<PlanWorkspace onLogout={onLogout} me={me} />)
      await settle()
    })
    expect(host.textContent).toContain('无法连接后端')

    await act(async () => {
      clickButton(host, '重试')
      await settle()
    })

    expect(host.querySelector('[data-testid="editor-note"]')?.textContent).toBe('重试后恢复')
    expect(onLogout).not.toHaveBeenCalled()
    expect(window.localStorage.getItem(mirrorKey)).toBe('local-draft')
  }, 15_000)

  it('retries the failed student switch in place and restores that student context', async () => {
    const studentAPlan = studentPlan({ id: 'plan-a', studentId: 'student-a', name: '甲学员计划' })
    const studentBPlan = studentPlan({ id: 'plan-b', studentId: 'student-b', name: '乙学员计划' })
    let studentBRequests = 0
    api.getCoachStudents.mockResolvedValue([
      { id: 'student-a', display_name: '甲学员', status: 'active', evaluation: null },
      { id: 'student-b', display_name: '乙学员', status: 'active', evaluation: null },
    ])
    api.getStudentPlans.mockImplementation((id: string) => {
      if (id === 'student-a') return Promise.resolve([studentAPlan])
      studentBRequests += 1
      if (studentBRequests === 1) return Promise.resolve([])
      if (studentBRequests === 2) return Promise.reject(new Error('switch failed'))
      return Promise.resolve([studentBPlan])
    })
    api.getPlan.mockImplementation((id: string) => Promise.resolve(id === 'plan-a' ? studentAPlan : studentBPlan))

    await act(async () => {
      root.render(<PlanWorkspace onLogout={vi.fn()} me={me} />)
      await settle()
    })
    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-testid="switch-student-b"]')?.click()
      await settle()
    })
    expect(host.textContent).toContain('切换学员失败')

    await act(async () => {
      clickButton(host, '重试')
      await settle()
    })

    expect(api.getStudentPlans).toHaveBeenCalledTimes(4)
    expect(host.querySelector('[data-testid="current-student"]')?.textContent).toBe('student-b')
    expect(host.querySelector('[data-testid="plan-options"]')?.textContent).toBe('乙学员计划')
  }, 15_000)

  it('keeps create-plan unavailable while a student switch is pending, then shows it for a confirmed empty plan list', async () => {
    const studentAPlan = studentPlan({ id: 'plan-a', studentId: 'student-a', name: '甲学员计划' })
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
    api.getPlan.mockResolvedValue(studentAPlan)

    await act(async () => {
      root.render(<PlanWorkspace onLogout={vi.fn()} me={me} />)
      await settle()
    })
    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-testid="switch-student-b"]')?.click()
      await settle()
    })

    expect(host.textContent).toContain('加载中…')
    expect(host.textContent).not.toContain('乙学员 暂无计划')
    expect([...host.querySelectorAll('button')].some((button) => button.textContent?.includes('新建计划'))).toBe(false)

    await act(async () => {
      resolveForegroundB([])
      await settle()
    })

    expect(host.textContent).toContain('乙学员 暂无计划')
    expect([...host.querySelectorAll('button')].some((button) => button.textContent?.includes('新建计划'))).toBe(true)

    await act(async () => {
      resolveBackgroundB([])
      await settle()
    })
  }, 15_000)

  it('切换学员时清空旧计划挂载，且较早的后台计划响应不能覆盖较新的结果', async () => {
// Keep the “next week” expectation stable: these fixtures cover Aug 3–9.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-07-27T12:00:00Z'))
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
    expect(host.querySelector('.coach-statusbar')?.textContent).not.toContain('待排')
  }, 15_000)

  it('部分计划加载时 404 回退只将已知待排学员列入需要注意', async () => {
    api.getExerciseStatsOverview.mockResolvedValue(null)
    api.getOverviewAlerts.mockRejectedValue(new ApiException(404, 'NOT_FOUND'))
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

    expect(host.querySelector('.coach-queue-heading')).toBeNull()
    expect(host.querySelector('.coach-statusbar')?.textContent).not.toContain('待排')

    await act(async () => {
      clickButton(host, '总览')
      await settle()
    })
    expect(host.querySelector('.overview-section.attention .overview-section-head')?.textContent).toBe('需要注意1')
    expect(host.querySelector('[data-student-id="student-2"] [data-alert-kind="plan_ending"]')).toBeNull()

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
          target: null,
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
    const editorProps = api.captureEditorProps.mock.calls.at(-1)?.[0] as {
      initialWeeks: Week[]
      onSave?: (weeks: Week[]) => Promise<unknown>
    }
    await act(async () => {
      await editorProps.onSave?.(editorProps.initialWeeks)
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
    api.realEditor = true
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
      await api.captureEditorProps.mock.calls.at(-1)![0].onRefreshVideos('student-a')
      await settle()
    })
    await act(async () => {
      host.querySelector<HTMLButtonElement>('.pending-entry')?.click()
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

  it('切换编辑器学员会同时切换聊天会话', async () => {
    const studentAPlan = studentPlan({ id: 'plan-a', studentId: 'student-a', name: '甲计划' })
    const conversationA: ChatConversation = {
      ...chatConversation(0),
      id: 'conversation-a',
      other_party: { id: 'student-a', display_name: '甲学员' },
    }
    const conversationB: ChatConversation = {
      ...chatConversation(0),
      id: 'conversation-b',
      other_party: { id: 'student-b', display_name: '乙学员' },
    }
    api.getCoachStudents.mockResolvedValue([
      { id: 'student-a', display_name: '甲学员', status: 'active', evaluation: null },
      { id: 'student-b', display_name: '乙学员', status: 'active', evaluation: null },
    ])
    api.getStudentPlans.mockImplementation((id: string) => Promise.resolve(id === 'student-a' ? [studentAPlan] : []))
    api.getPlan.mockResolvedValue(studentAPlan)
    api.listConversations.mockResolvedValue([conversationA, conversationB])
    api.getStudentVideos.mockImplementation((id: string) => Promise.resolve([
      video(`video-${id}`, id === 'student-a' ? '甲视频' : '乙视频'),
    ]))
    api.getMessages.mockImplementation((conversationId: string) => Promise.resolve({
      messages: [{
        ...chatMessage,
        id: `message-${conversationId}`,
        conversation_id: conversationId,
        sender_id: conversationId === 'conversation-a' ? 'student-a' : 'student-b',
        body: conversationId === 'conversation-a' ? '甲消息' : '乙消息',
      }],
      meta: { other_last_read: null, has_more: false },
    }))

    await act(async () => {
      root.render(<PlanWorkspace onLogout={vi.fn()} me={me} />)
      await settle()
    })
    await act(async () => {
      host.querySelector<HTMLButtonElement>('.editor-chat-toggle')!.click()
      await settle()
    })
    expect(host.querySelector('.editor-chat-window')?.textContent).toContain('甲消息')

    api.getMessages.mockClear()
    api.getStudentVideos.mockClear()
    const studentBRow = host.querySelector<HTMLButtonElement>('[data-testid="switch-student-b"]')!
    await act(async () => {
      studentBRow.click()
      await settle()
    })

    expect(host.querySelector('.editor-chat-head')?.textContent).toContain('乙学员')
    expect(host.querySelector('.chat-thread')?.textContent).toContain('乙消息')
    expect(api.getMessages).toHaveBeenCalledWith('conversation-b', { mode: 'latest', limit: 50 })
  }, 15_000)

  it.each([true, false])('013 chat capsule plays its video only when owned by the current athlete: %s', async (owned) => {
    api.realEditor = true
    const setLogId = '70000000-0000-4000-8000-000000000001'
    const setRef = {
      v: 1 as const,
      source: 'logged' as const,
      exercise_name: '目标卧推',
      set_number: 2,
      set_total: 3,
      weight_kg: '100',
      reps: 5,
      reps_max: null,
      rpe: '8.5',
      day_date: '2026-07-27',
      set_log_id: setLogId,
      plan_set_id: null,
    }
    const targetVideo = {
      ...video('target-video', '目标卧推', '2026-07-27T10:00:00Z'),
      set_log_id: setLogId,
      set_index: 1,
    }
    api.getPlan.mockResolvedValue(plan('组卡定位'))
    api.listConversations.mockResolvedValue([chatConversation(0)])
    api.getStudentVideos.mockResolvedValue([
      video('other-video', '另一条待审视频'),
      ...(owned ? [targetVideo] : []),
    ])
    api.getMessages.mockResolvedValue({
      messages: [{
        ...chatMessage,
        id: 'set-card-message',
        set_ref: setRef,
        body: setRefFirstLine(setRef),
        video_url: 'https://example.test/chat-video',
        video_expires_in: 900,
      }],
      meta: { other_last_read: null, has_more: false },
    })

    await act(async () => {
      root.render(<PlanWorkspace onLogout={vi.fn()} me={me} />)
      await settle()
    })
    await act(async () => {
      host.querySelector<HTMLButtonElement>('.editor-chat-toggle')!.click()
      await settle()
    })
    expect(host.querySelector('.history-player')).toBeNull()
    await act(async () => {
      host.querySelector<HTMLButtonElement>('.chat-video-capsule')!.click()
      await settle()
    })

    if (owned) {
      expect(host.querySelector('[data-feedback-mode]')).not.toBeNull()
      expect(host.querySelector('.history-player header')?.textContent).toContain('目标卧推')
      expect(host.querySelector('.editor-chat-window')).not.toBeNull()
    } else {
      expect(host.querySelector('[data-feedback-mode]')).toBeNull()
      expect(host.querySelector('.history-player')).toBeNull()
    }
    expect(api.markVideoViewed).not.toHaveBeenCalled()
  }, 15_000)

  it('零学员预览保留四项导航且无聊天浮窗、不发聊天请求', async () => {
    api.getCoachStudents.mockResolvedValue([])

    await act(async () => {
      root.render(<PlanWorkspace onLogout={vi.fn()} me={me} />)
      await settle()
    })
    expect(host.querySelectorAll('.coach-nav-item')).toHaveLength(4)
    expect([...host.querySelectorAll('.coach-nav-item')].map((item) => item.firstElementChild?.textContent)).toEqual([
      '总览', '计划编排', '动作库', '追踪',
    ])
    expect(api.listConversations).not.toHaveBeenCalled()

    expect(host.querySelector('.editor-chat')).toBeNull()
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
    api.getExerciseStatsOverview.mockResolvedValue(null)
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
    const requestsTab = [...host.querySelectorAll('button')].find((item) => item.textContent?.startsWith('总览'))
    expect(requestsTab?.querySelector('.coach-nav-badge')?.textContent).toBe('1')

    await act(async () => {
      clickButton(host, '总览')
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
    expect(host.querySelector('.requests-count')).toBeNull()
    expect(host.querySelector('.request-list')?.textContent).not.toContain('新学员')
    expect(requestsTab?.querySelector('.coach-nav-badge')).toBeNull()
  }, 15_000)

  it('接受申请后丢弃更早发出的轮询响应，申请卡片和角标不复活', async () => {
    api.getExerciseStatsOverview.mockResolvedValue(null)
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
    const requestsTab = [...host.querySelectorAll('button')].find((item) => item.textContent?.startsWith('总览'))
    await act(async () => {
      clickButton(host, '总览')
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
    expect(host.querySelector('.requests-count')).toBeNull()
    expect(requestsTab?.querySelector('.coach-nav-badge')).toBeNull()

    await act(async () => {
      resolveStale([bindRequest])
      await settle()
    })
    expect(host.querySelector('.requests-count')).toBeNull()
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
      host.querySelector<HTMLButtonElement>('.editor-chat-toggle')!.click()
      await settle()
    })
    await act(async () => {
      await settle()
    })
    expect(api.markConversationRead).toHaveBeenCalledWith('conversation', 'chat-message')

    await act(async () => {
      resolveStale([chatConversation(1)])
      await settle()
    })
    const messagesTab = [...host.querySelectorAll('button')].find((item) => item.firstElementChild?.textContent === '计划编排')
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

  it('appends the pending-revision tag to plans with unpushed changes', async () => {
    const pending = {
      ...studentPlan({ id: 'pending-plan', studentId: 'student', name: '待更新计划', status: 'published' }),
      pending_revision_saved_at: '2026-08-22T10:00:00Z',
    }
    api.getStudentPlans.mockResolvedValue([pending])
    api.getPlan.mockResolvedValue(pending)

    await act(async () => {
      root.render(<PlanWorkspace onLogout={vi.fn()} me={me} />)
      await settle()
    })

    const props = api.captureEditorProps.mock.calls.at(-1)?.[0] as {
      plans?: Array<{ id: string; tag?: string }>
    }
    expect(props.plans?.find((item) => item.id === 'pending-plan')?.tag)
      .toBe('已发布 · 有未推送修改')
  })

  it('patches start/end together and keeps the plan week count unchanged', async () => {
    const updated = {
      ...plan('加载时快照'),
      start_date: '2026-01-07',
      end_date: '2026-01-13',
      anchor_weekday: 3,
    }
    api.patchPlan.mockResolvedValue(updated)
    api.getPlan.mockResolvedValue(plan('加载时快照'))

    await act(async () => {
      root.render(<PlanWorkspace onLogout={vi.fn()} me={me} />)
      await settle()
    })
    const editorProps = api.captureEditorProps.mock.calls.at(-1)?.[0] as {
      onChangeStartDate: (startDate: string) => Promise<void>
    }
    await act(async () => {
      await editorProps.onChangeStartDate('2026-01-07')
    })

    expect(api.patchPlan).toHaveBeenCalledWith('plan', {
      start_date: '2026-01-07',
      end_date: '2026-01-13',
    })
    const latestProps = api.captureEditorProps.mock.calls.at(-1)?.[0] as {
      planStartDate: string
      weeksCount: number
    }
    expect(latestProps.planStartDate).toBe('2026-01-07')
    expect(latestProps.weeksCount).toBe(1)
  })
})
