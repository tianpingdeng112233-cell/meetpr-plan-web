import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiException } from '../../api/client'
import type { AuthUser, ChatConversation, ChatMessage, ChatReadState } from '../../api/types'
import { installLocalStorageMock } from '../../test/localStorageMock'

const chatApi = vi.hoisted(() => ({
  getMessages: vi.fn(),
  markConversationRead: vi.fn(),
  sendTextMessage: vi.fn(),
  openConversation: vi.fn(),
}))

vi.mock('../../api/chat', () => ({
  getMessages: chatApi.getMessages,
  markConversationRead: chatApi.markConversationRead,
  sendTextMessage: chatApi.sendTextMessage,
  openConversation: chatApi.openConversation,
}))

import MessagesPage from './MessagesPage'
import { chatOutbox } from './chatOutbox'
import { setRefFirstLine } from './setRef'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const me: AuthUser = { id: 'coach', phone: '+8613900000001', role: 'coach', createdAt: '2026-01-01T00:00:00Z' }
const conversation = (unread = 1, overrides: Partial<ChatConversation> = {}): ChatConversation => ({
  id: 'conversation',
  other_party: { id: 'student', display_name: '王晨曦' },
  last_message: {
    id: 'message-1', seq: 1, kind: 'text', preview: '请看一下动作',
    created_at: '2026-07-22T10:00:00.000Z', sender_id: 'student',
  },
  last_message_at: '2026-07-22T10:00:00.000Z',
  unread_count: unread,
  my_last_read: null,
  other_last_read: null,
  ...overrides,
})
const message = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'message-1', conversation_id: 'conversation', seq: 1, sender_id: 'student', kind: 'text',
  body: '请看一下动作', attachment_id: null, image_url: null, image_expires_in: null,
  set_ref: null, video_url: null, video_expires_in: null,
  client_id: 'student-client', created_at: '2026-07-22T10:00:00.000Z', ...overrides,
})
const setRef = {
  v: 1 as const,
  source: 'logged' as const,
  exercise_name: '低杠位深蹲',
  set_number: 1,
  set_total: 3,
  weight_kg: '100',
  reps: 5,
  reps_max: null,
  rpe: '8.5',
  day_date: '2026-07-27',
  set_log_id: '70000000-0000-4000-8000-000000000001',
  plan_set_id: null,
}
const setCardMessage = (overrides: Partial<ChatMessage> = {}) => message({
  set_ref: setRef,
  body: setRefFirstLine(setRef),
  ...overrides,
})

function Harness({
  initial = [conversation()],
  students = [{ id: 'student', display_name: '王晨曦', status: 'active' as const, evaluation: null }],
  initialStudentId = 'student',
  initialActiveId = null,
  initialBindLostIds = [],
  onOpenPlan = vi.fn(),
}: {
  initial?: ChatConversation[] | null
  students?: { id: string; display_name: string; status: 'active'; evaluation: null }[]
  initialStudentId?: string
  initialActiveId?: string | null
  initialBindLostIds?: string[]
  onOpenPlan?: (studentId: string) => void
}) {
  const [conversations, setConversations] = useState<ChatConversation[] | null>(initial)
  const [activeId, setActiveId] = useState<string | null>(initialActiveId)
  const [selectedStudentId, setSelectedStudentId] = useState(initialStudentId)
  const [bindLostIds, setBindLostIds] = useState<Set<string>>(() => new Set(initialBindLostIds))
  const applyRead = (conversationId: string, state: ChatReadState) => setConversations((current) => (
    current?.map((item) => item.id === conversationId
      ? { ...item, unread_count: state.unread_count, my_last_read: state.my_last_read }
      : item) ?? []
  ))
  return <div data-selected-student={selectedStudentId}>
    <MessagesPage
      me={me}
      students={students}
      selectedStudentId={selectedStudentId}
      conversations={conversations}
      bindLostIds={bindLostIds}
      sessionDead={false}
      activeId={activeId}
      drafts={{}}
      onActiveIdChange={setActiveId}
      onStudentChange={setSelectedStudentId}
      onOpenPlan={onOpenPlan}
      onDraftChange={vi.fn()}
      onConversationsChanged={(update) => setConversations((current) => update(current ?? []))}
      onReadStateApplied={applyRead}
      onBindLost={(conversationId) => setBindLostIds((prev) => new Set(prev).add(conversationId))}
      onSessionExpired={vi.fn()}
    />
  </div>
}

async function settle(): Promise<void> {
  for (let index = 0; index < 12; index += 1) await Promise.resolve()
}

function inputTextarea(textarea: HTMLTextAreaElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
  valueSetter.call(textarea, value)
  textarea.dispatchEvent(new Event('input', { bubbles: true }))
}

// vi.restoreAllMocks() 不撤销 stubGlobal,也不撤销手写的 defineProperty——布局桩必须自己收。
const LAYOUT_PROPS = ['scrollHeight', 'scrollTop'] as const
const originalLayoutDescriptors = LAYOUT_PROPS.map((name) => [
  name,
  Object.getOwnPropertyDescriptor(HTMLElement.prototype, name),
] as const)

describe('MessagesPage', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    installLocalStorageMock()
    window.localStorage.removeItem('meetpr:sidebar:messages')
    vi.spyOn(document, 'hasFocus').mockReturnValue(true)
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    chatApi.getMessages.mockResolvedValue({
      messages: [message()],
      meta: { other_last_read: null, has_more: false },
    })
    chatApi.markConversationRead.mockResolvedValue({
      my_last_read: { message_id: 'message-1', seq: 1 },
      unread_count: 0,
    })
    chatApi.sendTextMessage.mockImplementation((_conversationId, body, clientId) => Promise.resolve(message({
      id: 'sent-message', seq: 2, sender_id: 'coach', body, client_id: clientId,
    })))
    chatApi.openConversation.mockResolvedValue(conversation(0))
    chatOutbox.reset()
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.clearAllMocks()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    for (const [name, descriptor] of originalLayoutDescriptors) {
      if (descriptor) Object.defineProperty(HTMLElement.prototype, name, descriptor)
      else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[name]
    }
    chatOutbox.reset()
  })

  it('折叠会话列并从 localStorage 恢复', async () => {
    await act(async () => { root.render(<Harness />); await settle() })
    const toggle = host.querySelector<HTMLButtonElement>('[aria-label="收起会话列表"]')!

    act(() => toggle.click())
    expect(host.querySelector('.chat-sidebar')?.classList.contains('collapsed')).toBe(true)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(window.localStorage.getItem('meetpr:sidebar:messages')).toBe('true')

    act(() => root.unmount())
    root = createRoot(host)
    await act(async () => { root.render(<Harness />); await settle() })
    expect(host.querySelector('.chat-sidebar')?.classList.contains('collapsed')).toBe(true)
    expect(host.querySelector('[aria-label="展开会话列表"]')).not.toBeNull()
  })

  it('进入消息屏自动选中当前学员的会话，首屏没有新增消息也立即打已读并清红点', async () => {
    await act(async () => { root.render(<Harness />); await settle() })

    expect(host.textContent).toContain('请看一下动作')
    expect(chatApi.markConversationRead).toHaveBeenCalledWith('conversation', 'message-1')
    expect(host.querySelector('.chat-unread-badge')).toBeNull()
    expect(host.querySelector('.chat-row.active')?.textContent).toContain('王晨曦')
  })

  it('当前学员没有会话时不越界打开其他学员会话', async () => {
    await act(async () => {
      root.render(<Harness
        initial={[conversation(1)]}
        initialStudentId="student-2"
        students={[
          { id: 'student', display_name: '王晨曦', status: 'active', evaluation: null },
          { id: 'student-2', display_name: '林知夏', status: 'active', evaluation: null },
        ]}
      />)
      await settle()
    })

    expect(host.querySelector('.chat-row.active')).toBeNull()
    expect(host.textContent).toContain('选择会话开始聊天')
    expect(chatApi.getMessages).not.toHaveBeenCalled()
    expect(chatApi.markConversationRead).not.toHaveBeenCalled()
    expect(host.querySelector('[data-selected-student]')?.getAttribute('data-selected-student')).toBe('student-2')
  })

  it('跨页保留的 active 与当前学员不一致时同步到当前学员会话', async () => {
    const second = conversation(2, {
      id: 'conversation-2',
      other_party: { id: 'student-2', display_name: '林知夏' },
      last_message: {
        id: 'message-2', seq: 1, kind: 'text', preview: '第二个会话',
        created_at: '2026-07-22T11:00:00.000Z', sender_id: 'student-2',
      },
      last_message_at: '2026-07-22T11:00:00.000Z',
    })
    chatApi.getMessages.mockImplementation((conversationId: string) => Promise.resolve({
      messages: [message({
        id: conversationId === 'conversation-2' ? 'message-2' : 'message-1',
        conversation_id: conversationId,
        sender_id: conversationId === 'conversation-2' ? 'student-2' : 'student',
        body: conversationId === 'conversation-2' ? '第二个会话' : '第一个会话',
      })],
      meta: { other_last_read: null, has_more: false },
    }))

    await act(async () => {
      root.render(<Harness
        initial={[conversation(0), second]}
        initialActiveId="conversation"
        initialStudentId="student-2"
        students={[
          { id: 'student', display_name: '王晨曦', status: 'active', evaluation: null },
          { id: 'student-2', display_name: '林知夏', status: 'active', evaluation: null },
        ]}
      />)
      await settle()
    })

    expect(host.querySelector('.chat-row.active')?.textContent).toContain('林知夏')
    expect(host.querySelector('.chat-thread-head')?.textContent).toContain('林知夏')
    expect(chatApi.getMessages).toHaveBeenCalledWith('conversation-2', { mode: 'latest', limit: 50 })
    expect(chatApi.getMessages).not.toHaveBeenCalledWith('conversation', expect.anything())
  })

  it('跨页保留的 active 与当前学员不一致且当前学员无会话时清空 active', async () => {
    await act(async () => {
      root.render(<Harness
        initial={[conversation(1)]}
        initialActiveId="conversation"
        initialStudentId="student-2"
        students={[
          { id: 'student', display_name: '王晨曦', status: 'active', evaluation: null },
          { id: 'student-2', display_name: '林知夏', status: 'active', evaluation: null },
        ]}
      />)
      await settle()
    })

    expect(host.querySelector('.chat-row.active')).toBeNull()
    expect(host.textContent).toContain('选择会话开始聊天')
    expect(chatApi.getMessages).not.toHaveBeenCalled()
    expect(chatApi.markConversationRead).not.toHaveBeenCalled()
  })

  it('lost 会话可查看历史但不污染当前学员，且不能打开计划', async () => {
    const openPlan = vi.fn()
    const lost = conversation(0, {
      id: 'conversation-lost',
      other_party: { id: 'student-lost', display_name: '已解绑学员' },
      last_message: {
        id: 'message-lost', seq: 1, kind: 'text', preview: '历史消息',
        created_at: '2026-07-21T11:00:00.000Z', sender_id: 'student-lost',
      },
      last_message_at: '2026-07-21T11:00:00.000Z',
    })
    chatApi.getMessages.mockImplementation((conversationId: string) => Promise.resolve({
      messages: [message({
        id: conversationId === 'conversation-lost' ? 'message-lost' : 'message-1',
        conversation_id: conversationId,
        sender_id: conversationId === 'conversation-lost' ? 'student-lost' : 'student',
        body: conversationId === 'conversation-lost' ? '只读历史消息' : '当前学员消息',
      })],
      meta: { other_last_read: null, has_more: false },
    }))
    await act(async () => {
      root.render(<Harness initial={[conversation(0), lost]} onOpenPlan={openPlan} />)
      await settle()
    })

    const lostRow = [...host.querySelectorAll<HTMLButtonElement>('.chat-row')]
      .find((row) => row.textContent?.includes('已解绑学员'))!
    await act(async () => { lostRow.click(); await settle() })

    expect(host.querySelector('.chat-row.active')?.textContent).toContain('已解绑学员')
    expect(host.textContent).toContain('只读历史消息')
    expect(host.querySelector('[data-selected-student]')?.getAttribute('data-selected-student')).toBe('student')
    const planButton = host.querySelector<HTMLButtonElement>('.chat-open-plan')!
    expect(planButton.disabled).toBe(true)
    expect(planButton.title).toBe('该学员已不在你的名下，无法打开计划')
    planButton.click()
    expect(openPlan).not.toHaveBeenCalled()
  })

  it('草稿为空时点击快捷回复会填入完整文案并显示已实现的快捷键提示', async () => {
    await act(async () => { root.render(<Harness initial={[conversation(0)]} />); await settle() })
    const quickReply = host.querySelector<HTMLButtonElement>('.chat-quick-reply')!
    const textarea = host.querySelector<HTMLTextAreaElement>('.chat-composer textarea')!

    await act(async () => { quickReply.click(); await settle() })

    expect(textarea.value).toBe('按计划完成，很好，下周继续加。')
    expect(quickReply.querySelector('kbd')?.textContent).toBe('⌥1')
    expect(chatApi.sendTextMessage).not.toHaveBeenCalled()
  })

  it('草稿非空时点击快捷回复会换行追加而不覆盖草稿', async () => {
    await act(async () => { root.render(<Harness initial={[conversation(0)]} />); await settle() })
    const quickReply = host.querySelector<HTMLButtonElement>('.chat-quick-reply')!
    const textarea = host.querySelector<HTMLTextAreaElement>('.chat-composer textarea')!
    await act(async () => { inputTextarea(textarea, '已有草稿') })

    await act(async () => { quickReply.click(); await settle() })

    expect(textarea.value).toBe('已有草稿\n按计划完成，很好，下周继续加。')
    expect(chatApi.sendTextMessage).not.toHaveBeenCalled()
  })

  it('⌥1–5 复用点击语义并在输入框聚焦时豁免', async () => {
    await act(async () => { root.render(<Harness initial={[conversation(0)]} />); await settle() })
    const textarea = host.querySelector<HTMLTextAreaElement>('.chat-composer textarea')!

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', {
        key: '™',
        code: 'Digit2',
        altKey: true,
        bubbles: true,
      }))
    })
    expect(textarea.value).toBe('这组速度掉得太多，下周降 5% 重量。')

    textarea.focus()
    await act(async () => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', {
        key: '£',
        code: 'Digit3',
        altKey: true,
        bubbles: true,
      }))
    })
    expect(textarea.value).toBe('这组速度掉得太多，下周降 5% 重量。')

    textarea.blur()
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', {
        key: '∞',
        code: 'Digit5',
        altKey: true,
        bubbles: true,
      }))
    })
    expect(textarea.value).toBe('这组速度掉得太多，下周降 5% 重量。\n距比赛还有 5 周，注意控体重。')
  })

  it('快捷回复追加不会顶穿 4000 字上限，超限草稿也发不出去', async () => {
    await act(async () => { root.render(<Harness initial={[conversation(0)]} />); await settle() })
    const quickReply = host.querySelector<HTMLButtonElement>('.chat-quick-reply')!
    const textarea = host.querySelector<HTMLTextAreaElement>('.chat-composer textarea')!
    await act(async () => { inputTextarea(textarea, '长'.repeat(3995)) })

    await act(async () => { quickReply.click(); await settle() })
    expect(textarea.value.length).toBe(4000)

    await act(async () => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      await settle()
    })
    expect(chatApi.sendTextMessage).toHaveBeenCalledTimes(1)
    const [, body] = chatApi.sendTextMessage.mock.calls[0]
    expect(String(body.body ?? body).length).toBeLessThanOrEqual(4000)
  })

  it('跨日发送的 pending 气泡归入新建的今天日期组', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-23T12:00:00.000Z'))
    let finishSend: (sent: ChatMessage) => void = () => {}
    chatApi.sendTextMessage.mockImplementation(() => new Promise<ChatMessage>((resolve) => {
      finishSend = resolve
    }))
    try {
      await act(async () => { root.render(<Harness initial={[conversation(0)]} />) })
      await act(async () => { await vi.advanceTimersByTimeAsync(50) })
      const textarea = host.querySelector<HTMLTextAreaElement>('.chat-composer textarea')!
      await act(async () => {
        inputTextarea(textarea, '今天待发送')
        textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        await settle()
      })

      const groups = [...host.querySelectorAll<HTMLElement>('.chat-day-group')]
      expect(groups.map((group) => group.querySelector('.chat-day-label')?.textContent))
        .toEqual(['昨天', '今天'])
      expect(groups.at(-1)?.querySelector('.chat-message.pending')?.textContent).toContain('今天待发送')
    } finally {
      await act(async () => {
        finishSend(message({
          id: 'sent-message', seq: 2, sender_id: 'coach', body: '今天待发送', client_id: 'sent-client',
          created_at: '2026-07-23T12:00:00.000Z',
        }))
        await settle()
      })
      vi.useRealTimers()
    }
  })

  it('下一条未读按现有列表顺序跳到第一个有未读的会话', async () => {
    const second = conversation(2, {
      id: 'conversation-2',
      other_party: { id: 'student-2', display_name: '林知夏' },
      last_message: {
        id: 'message-2',
        seq: 1,
        kind: 'text',
        preview: '第二个会话',
        created_at: '2026-07-22T11:00:00.000Z',
        sender_id: 'student-2',
      },
      last_message_at: '2026-07-22T11:00:00.000Z',
    })
    chatApi.getMessages.mockImplementation((conversationId: string) => Promise.resolve({
      messages: [message({
        id: conversationId === 'conversation-2' ? 'message-2' : 'message-1',
        conversation_id: conversationId,
        sender_id: conversationId === 'conversation-2' ? 'student-2' : 'student',
        body: conversationId === 'conversation-2' ? '第二个会话' : '第一个会话',
      })],
      meta: { other_last_read: null, has_more: false },
    }))
    await act(async () => {
      root.render(<Harness
        initial={[conversation(0), second]}
        students={[
          { id: 'student', display_name: '王晨曦', status: 'active', evaluation: null },
          { id: 'student-2', display_name: '林知夏', status: 'active', evaluation: null },
        ]}
      />)
      await settle()
    })

    await act(async () => {
      host.querySelector<HTMLButtonElement>('.chat-next-unread')?.click()
      await settle()
    })

    expect(host.querySelector('.chat-row.active')?.textContent).toContain('林知夏')
    expect(host.querySelector('.chat-thread-head')?.textContent).toContain('林知夏')
    expect(host.querySelector('[data-selected-student]')?.getAttribute('data-selected-student')).toBe('student-2')
    expect(chatApi.getMessages).toHaveBeenCalledWith('conversation-2', { mode: 'latest', limit: 50 })
  })

  it('教练气泡靠右，学员气泡靠左', async () => {
    chatApi.getMessages.mockResolvedValue({
      messages: [
        message({ id: 'student-message', seq: 1, body: '学员消息' }),
        message({ id: 'coach-message', seq: 2, sender_id: 'coach', body: '教练消息' }),
      ],
      meta: { other_last_read: null, has_more: false },
    })

    await act(async () => { root.render(<Harness initial={[conversation(0)]} />); await settle() })

    expect(host.querySelector('.chat-message:not(.mine) .chat-bubble')?.textContent).toBe('学员消息')
    expect(host.querySelector('.chat-message.mine .chat-bubble')?.textContent).toBe('教练消息')
  })

  it('没有未读时点击下一条未读提示没有未读消息', async () => {
    const toast = vi.fn()
    window.addEventListener('meetpr:toast', toast)
    try {
      await act(async () => { root.render(<Harness initial={[conversation(0)]} />); await settle() })
      await act(async () => { host.querySelector<HTMLButtonElement>('.chat-next-unread')?.click() })
      expect(toast).toHaveBeenCalledTimes(1)
      expect((toast.mock.calls[0]?.[0] as CustomEvent<string>).detail).toBe('没有未读消息了')
    } finally {
      window.removeEventListener('meetpr:toast', toast)
    }
  })

  it('重入会话拿到整页历史后滚到底部，而不是停在这一页顶部', async () => {
    // 走查 2026-07-27 抓到的回归:滚动曾用裸 requestAnimationFrame,在真实浏览器里会赶在 React
    // 提交 50 条气泡之前跑,读到的 scrollHeight 还是渲染前的旧值,落点停在这一页顶部。
    //
    // jsdom 没有布局,所以高度得自己造。**关键是让它由 DOM 真实推导**:常量高度会让「同步执行
    // 但早于 React 提交」的实现也通过(它照样读到 4200),而那正是真实浏览器里会坏的写法。
    // 按当前已渲染的 .chat-message 条数算高度后,提交前读到的是 0、提交后才是 50 条的高度,
    // 断言 scrollTop 落在后者,就真的钉住了「滚动发生在 DOM 提交之后」。
    // 额外把 rAF 打桩成永不回调,顺带堵死「推迟到下一帧」这条路。
    const ROW_HEIGHT = 84
    vi.stubGlobal('requestAnimationFrame', () => 0)
    let scrollTopValue = 0
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get(this: HTMLElement) { return this.querySelectorAll('.chat-message').length * ROW_HEIGHT },
    })
    Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
      configurable: true,
      get: () => scrollTopValue,
      set(next: number) { scrollTopValue = next },
    })

    chatApi.getMessages.mockResolvedValue({
      messages: Array.from({ length: 50 }, (_unused, index) => message({
        id: `message-${index + 1}`, seq: index + 1, body: `第 ${index + 1} 条`,
      })),
      meta: { other_last_read: null, has_more: true },
    })
    chatApi.markConversationRead.mockResolvedValue({
      my_last_read: { message_id: 'message-50', seq: 50 },
      unread_count: 0,
    })

    await act(async () => { root.render(<Harness />); await settle() })

    expect(host.textContent).toContain('第 50 条')
    expect(scrollTopValue).toBe(50 * ROW_HEIGHT)
  })

  it('程序化沉底产生的 scroll 事件不算用户交互，闲置超窗后不得自己打已读', async () => {
    // 复审第 2 轮 BLOCKER:document 上的捕获式 scroll 监听会收到自动沉底产生的事件。若把它记成
    // 交互,闲置教练的线程会在下一拍自己打已读,绕过 §8.2.25(已读不越权)。
    // 本测试必须真正构造场景:①闲置超过 INTERACTION_WINDOW_MS(120s);②新消息到达触发自动沉底;
    // ③派发那个 scroll 事件;④再走一拍轮询。删掉抑制逻辑时这条必须挂。
    vi.useFakeTimers()
    try {
      const ROW_HEIGHT = 84
      let scrollTopValue = 0
      Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
        configurable: true,
        get(this: HTMLElement) { return this.querySelectorAll('.chat-message').length * ROW_HEIGHT },
      })
      Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
        configurable: true,
        get: () => scrollTopValue,
        set(next: number) { scrollTopValue = next },
      })

      await act(async () => { root.render(<Harness initial={[conversation(0)]} />) })
      await act(async () => { await vi.advanceTimersByTimeAsync(50) })
      const thread = host.querySelector('.chat-thread')!

      // 闲置超过交互窗口
      await act(async () => { await vi.advanceTimersByTimeAsync(130_000) })
      chatApi.markConversationRead.mockClear()

      // 新消息到达 → 自动沉底
      chatApi.getMessages.mockResolvedValue({
        messages: [message({ id: 'm-2', seq: 2, body: '学员刚发的' })],
        meta: { other_last_read: null, has_more: false },
      })
      chatApi.markConversationRead.mockResolvedValue({
        my_last_read: { message_id: 'm-2', seq: 2 }, unread_count: 0,
      })
      await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })
      expect(host.textContent).toContain('学员刚发的')

      // 派发自动沉底产生的 scroll 事件(jsdom 不会自己发)
      await act(async () => { thread.dispatchEvent(new Event('scroll')) })
      // 再走两拍轮询
      await act(async () => { await vi.advanceTimersByTimeAsync(11_000) })

      // 交互没被刷新 → 闲置状态维持 → 不得打已读
      expect(chatApi.markConversationRead).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('未知 kind 前向兼容降级，不让整个线程崩掉', async () => {
    chatApi.getMessages.mockResolvedValue({
      messages: [message({ kind: 'future_set_card', sender_id: 'coach' })],
      meta: { other_last_read: null, has_more: false },
    })
    await act(async () => { root.render(<Harness initial={[conversation(0)]} />); await settle() })
    expect(host.textContent).toContain('当前版本暂不支持的消息类型')
  })

  it('v2 组卡夹在普通消息中时仅该条按纯文本降级', async () => {
    chatApi.getMessages.mockResolvedValue({
      messages: [
        message({ id: 'm-1', seq: 1, body: '前一条普通消息' }),
        message({
          id: 'm-2',
          seq: 2,
          set_ref: { v: 2, future: true },
          body: '[训练分享] 未来版本的纯文本降级',
        }),
        message({ id: 'm-3', seq: 3, body: '后一条普通消息' }),
      ],
      meta: { other_last_read: null, has_more: false },
    })
    await act(async () => { root.render(<Harness initial={[conversation(0)]} />); await settle() })
    await act(async () => { host.querySelector<HTMLButtonElement>('.chat-row')?.click(); await settle() })

    expect(host.textContent).toContain('前一条普通消息')
    expect(host.textContent).toContain('[训练分享] 未来版本的纯文本降级')
    expect(host.textContent).toContain('后一条普通消息')
    expect(host.querySelector('.set-ref-card')).toBeNull()
  })

  it('首行不匹配时整条 body 按纯文本显示', async () => {
    const body = `${setRefFirstLine(setRef).replace('第1组', '第2组')}\n这是备注`
    chatApi.getMessages.mockResolvedValue({
      messages: [setCardMessage({ body })],
      meta: { other_last_read: null, has_more: false },
    })
    await act(async () => { root.render(<Harness initial={[conversation(0)]} />); await settle() })
    await act(async () => { host.querySelector<HTMLButtonElement>('.chat-row')?.click(); await settle() })

    expect(host.querySelector('.set-ref-card')).toBeNull()
    expect(host.querySelector('.chat-bubble p')?.textContent).toBe(body)
  })

  it('未加载与零会话使用不同空态', async () => {
    await act(async () => { root.render(<Harness key="loading" initial={null} />) })
    expect(host.textContent).toContain('加载中…')
    expect(host.textContent).not.toContain('暂无会话')
    await act(async () => { root.render(<Harness key="empty" initial={[]} students={[]} initialStudentId="" />) })
    expect(host.textContent).toContain('暂无会话')
  })

  it('中文输入法候选态的 Enter 不误发，上屏后的 ⌘↵ 正常发送', async () => {
    await act(async () => { root.render(<Harness initial={[conversation(0)]} />); await settle() })
    const textarea = host.querySelector<HTMLTextAreaElement>('.chat-composer textarea')!
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
    await act(async () => {
      valueSetter.call(textarea, '明天深蹲 RPE7')
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
    })

    await act(async () => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, isComposing: true }))
      await settle()
    })
    expect(chatApi.sendTextMessage).not.toHaveBeenCalled()

    await act(async () => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter', metaKey: true, bubbles: true, isComposing: false,
      }))
      await settle()
    })
    expect(chatApi.sendTextMessage).toHaveBeenCalledTimes(1)
    expect(chatApi.sendTextMessage.mock.calls[0]?.[1]).toBe('明天深蹲 RPE7')
  })

  it('发送遇到绑定失效后禁用输入框，失败气泡不提供重试', async () => {
    chatApi.sendTextMessage.mockRejectedValue(new ApiException(403, 'CHAT_BIND_REQUIRED'))
    await act(async () => { root.render(<Harness initial={[conversation(0)]} />); await settle() })
    const textarea = host.querySelector<HTMLTextAreaElement>('.chat-composer textarea')!
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
    await act(async () => {
      valueSetter.call(textarea, '还在吗')
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      await settle()
    })

    expect(textarea.disabled).toBe(true)
    expect(host.textContent).toContain('该学员已不在你的名下，无法继续发送')
    expect(host.textContent).toContain('发送失败')
    expect(host.querySelector('.chat-send-state button')).toBeNull()
  })

  it('发起对话走 get-or-create 并直接进入线程', async () => {
    await act(async () => { root.render(<Harness initial={[]} />); await settle() })
    const start = host.querySelector<HTMLButtonElement>('.chat-row-new')!
    await act(async () => { start.click(); await settle() })
    expect(chatApi.openConversation).toHaveBeenCalledWith('student')
    expect(host.textContent).toContain('王晨曦')
    expect(chatApi.getMessages).toHaveBeenCalledWith('conversation', { mode: 'latest', limit: 50 })
  })

  it('图片加载失败后用 before_seq=seq+1 单条续签并更新 URL', async () => {
    chatApi.getMessages
      .mockResolvedValueOnce({
        messages: [message({ kind: 'image', body: null, image_url: 'https://old.example/image.jpg' })],
        meta: { other_last_read: null, has_more: false },
      })
      .mockResolvedValueOnce({
        messages: [message({ kind: 'image', body: null, image_url: 'https://new.example/image.jpg' })],
        meta: { other_last_read: null, has_more: false },
      })
    await act(async () => { root.render(<Harness initial={[conversation(0)]} />); await settle() })
    const image = host.querySelector<HTMLImageElement>('.chat-bubble img')!
    expect(image.src).toBe('https://old.example/image.jpg')
    await act(async () => { image.dispatchEvent(new Event('error')); await settle() })

    expect(chatApi.getMessages).toHaveBeenLastCalledWith('conversation', { mode: 'before', seq: 2, limit: 1 })
    expect(host.querySelector<HTMLImageElement>('.chat-bubble img')?.src).toBe('https://new.example/image.jpg')
  })

  it('组卡仅在 video_url 非空时显示播放入口，并打开无前后导航的既有视频弹窗', async () => {
    chatApi.getMessages.mockResolvedValue({
      messages: [
        setCardMessage({
          id: 'with-video',
          seq: 1,
          video_url: 'https://old.example/video.mp4',
          video_expires_in: 900,
        }),
        setCardMessage({ id: 'without-video', seq: 2 }),
      ],
      meta: { other_last_read: null, has_more: false },
    })
    await act(async () => { root.render(<Harness initial={[conversation(0)]} />); await settle() })
    await act(async () => { host.querySelector<HTMLButtonElement>('.chat-row')?.click(); await settle() })

    expect(host.querySelectorAll('.set-ref-card')).toHaveLength(2)
    expect(host.querySelectorAll('.set-ref-play')).toHaveLength(1)
    await act(async () => { host.querySelector<HTMLButtonElement>('.set-ref-play')?.click(); await settle() })
    expect(host.querySelector<HTMLVideoElement>('.video-modal video')?.src)
      .toBe('https://old.example/video.mp4')
    expect(host.querySelector('.video-nav')).toBeNull()
  })

  it('打开超过 expires_in 的组卡视频前，用 before_seq=seq+1&limit=1 单条续签', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
    chatApi.getMessages
      .mockResolvedValueOnce({
        messages: [setCardMessage({
          video_url: 'https://old.example/video.mp4',
          video_expires_in: 900,
        })],
        meta: { other_last_read: null, has_more: false },
      })
      .mockResolvedValueOnce({
        messages: [setCardMessage({
          video_url: 'https://new.example/video.mp4',
          video_expires_in: 900,
        })],
        meta: { other_last_read: null, has_more: false },
      })
    await act(async () => { root.render(<Harness initial={[conversation(0)]} />); await settle() })
    await act(async () => { host.querySelector<HTMLButtonElement>('.chat-row')?.click(); await settle() })
    clock.mockReturnValue(1_901_000)
    await act(async () => { host.querySelector<HTMLButtonElement>('.set-ref-play')?.click(); await settle() })

    expect(chatApi.getMessages).toHaveBeenLastCalledWith(
      'conversation',
      { mode: 'before', seq: 2, limit: 1 },
    )
    expect(host.querySelector<HTMLVideoElement>('.video-modal video')?.src)
      .toBe('https://new.example/video.mp4')
  })

  it('视频播放错误只对该消息走单条续签并替换弹窗 URL', async () => {
    chatApi.getMessages
      .mockResolvedValueOnce({
        messages: [setCardMessage({
          video_url: 'https://old.example/video.mp4',
          video_expires_in: 900,
        })],
        meta: { other_last_read: null, has_more: false },
      })
      .mockResolvedValueOnce({
        messages: [setCardMessage({
          video_url: 'https://new.example/video.mp4',
          video_expires_in: 900,
        })],
        meta: { other_last_read: null, has_more: false },
      })
    await act(async () => { root.render(<Harness initial={[conversation(0)]} />); await settle() })
    await act(async () => { host.querySelector<HTMLButtonElement>('.chat-row')?.click(); await settle() })
    await act(async () => { host.querySelector<HTMLButtonElement>('.set-ref-play')?.click(); await settle() })
    const video = host.querySelector<HTMLVideoElement>('.video-modal video')!
    await act(async () => { video.dispatchEvent(new Event('error')); await settle() })

    expect(chatApi.getMessages).toHaveBeenLastCalledWith(
      'conversation',
      { mode: 'before', seq: 2, limit: 1 },
    )
    expect(host.querySelector<HTMLVideoElement>('.video-modal video')?.src)
      .toBe('https://new.example/video.mp4')
  })

  it.each([
    { name: '空响应', renewalMessages: [] },
    {
      name: '只返回相邻消息',
      renewalMessages: [message({ id: 'adjacent', seq: 1, body: '仍可见的相邻消息' })],
    },
  ])('视频续签$name找不到目标 seq 时删除本地消息并关闭弹窗', async ({ renewalMessages }) => {
    const target = setCardMessage({
      id: 'target-video',
      seq: 2,
      video_url: 'https://old.example/video.mp4',
      video_expires_in: 900,
    })
    const adjacent = message({ id: 'adjacent', seq: 1, body: '仍可见的相邻消息' })
    chatApi.getMessages
      .mockResolvedValueOnce({
        messages: [adjacent, target],
        meta: { other_last_read: null, has_more: false },
      })
      .mockResolvedValueOnce({
        messages: renewalMessages,
        meta: { other_last_read: null, has_more: false },
      })

    await act(async () => { root.render(<Harness initial={[conversation(0)]} />); await settle() })
    await act(async () => { host.querySelector<HTMLButtonElement>('.chat-row')?.click(); await settle() })
    await act(async () => { host.querySelector<HTMLButtonElement>('.set-ref-play')?.click(); await settle() })
    const video = host.querySelector<HTMLVideoElement>('.video-modal video')!
    await act(async () => { video.dispatchEvent(new Event('error')); await settle() })

    expect(chatApi.getMessages).toHaveBeenLastCalledWith(
      'conversation',
      { mode: 'before', seq: 3, limit: 1 },
    )
    expect(host.querySelector('.video-modal')).toBeNull()
    expect(host.querySelector('.set-ref-card')).toBeNull()
    expect(host.textContent).toContain('仍可见的相邻消息')
  })
})
