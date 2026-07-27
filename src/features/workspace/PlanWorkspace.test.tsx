import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthUser, ChatConversation, ChatMessage, ExerciseResponse, PlanWithChildren } from '../../api/types'
import type { Week } from '../plan-editor/types'

const api = vi.hoisted(() => ({
  getCoachStudents: vi.fn(),
  getStudentPlans: vi.fn(),
  getPlan: vi.fn(),
  getStudentOnboarding: vi.fn(),
  getBindRequests: vi.fn(),
  listExercises: vi.fn(),
  getExerciseUsageStats: vi.fn(),
  listConversations: vi.fn(),
  getMessages: vi.fn(),
  markConversationRead: vi.fn(),
  sendTextMessage: vi.fn(),
  openConversation: vi.fn(),
  captureEditorProps: vi.fn(),
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
  getExerciseUsageStats: api.getExerciseUsageStats,
  createCustomExercise: vi.fn(),
}))
vi.mock('../../api/coach', () => ({
  getBindRequests: api.getBindRequests,
  refreshCoachStudents: vi.fn(),
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
    onPublish?: unknown
    onLeaveGuardChange?: (guard: (() => Promise<boolean>) | null) => void
  }) => {
    const { initialWeeks, onLeaveGuardChange } = props
    api.captureEditorProps(props)
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
const me: AuthUser = { id: 'coach', phone: '+8613900000001', role: 'coach', createdAt: '2026-01-01T00:00:00Z' }
const chatConversation = (unreadCount: number): ChatConversation => ({
  id: 'conversation', other_party: { id: 'student', display_name: '学员' },
  last_message: { id: 'chat-message', seq: 1, kind: 'text', preview: '新消息', created_at: '2026-07-22T10:00:00Z', sender_id: 'student' },
  last_message_at: '2026-07-22T10:00:00Z', unread_count: unreadCount,
  my_last_read: null, other_last_read: null,
})
const chatMessage: ChatMessage = {
  id: 'chat-message', conversation_id: 'conversation', seq: 1, sender_id: 'student', kind: 'text', body: '新消息',
  attachment_id: null, image_url: null, image_expires_in: null, client_id: 'student-client', created_at: '2026-07-22T10:00:00Z',
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
    api.getExerciseUsageStats.mockResolvedValue([])
    api.getCoachStudents.mockResolvedValue([{ id: 'student', display_name: '学员', status: 'active', evaluation: null }])
    api.getStudentPlans.mockResolvedValue([plan('加载时快照')])
    api.getStudentOnboarding.mockResolvedValue(null)
    api.getBindRequests.mockResolvedValue([])
    api.listConversations.mockResolvedValue([])
    api.getMessages.mockResolvedValue({ messages: [chatMessage], meta: { other_last_read: null, has_more: false } })
    api.markConversationRead.mockResolvedValue({ my_last_read: { message_id: 'chat-message', seq: 1 }, unread_count: 0 })
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
      clickButton(host, '计划编写')
      await settle()
    })

    expect(api.getPlan).toHaveBeenCalledTimes(2)
    expect(host.querySelector('[data-testid="editor-note"]')?.textContent).toBe('服务端最新备注')
  })

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
  })

  it('零学员空态可进入消息页且不发聊天请求', async () => {
    api.getCoachStudents.mockResolvedValue([])

    await act(async () => {
      root.render(<PlanWorkspace onLogout={vi.fn()} me={me} />)
      await settle()
    })
    expect(api.listConversations).not.toHaveBeenCalled()

    await act(async () => {
      clickButton(host, '消息')
      await settle()
    })

    expect(host.querySelector('.empty-page')?.textContent).toBe('接受学员申请后即可与学员聊天')
    expect(api.listConversations).not.toHaveBeenCalled()
  })

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
    expect(messagesTab?.querySelector('.coach-rail-badge')).toBeNull()
  })

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
