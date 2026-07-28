import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiException } from '../../api/client'
import type { AuthUser, ChatConversation, ChatMessage, ChatReadState } from '../../api/types'

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
const conversation = (unread = 1): ChatConversation => ({
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
})
const message = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'message-1', conversation_id: 'conversation', seq: 1, sender_id: 'student', kind: 'text',
  body: '请看一下动作', attachment_id: null, image_url: null, image_expires_in: null,
  set_ref: null, video_url: null, video_expires_in: null,
  client_id: 'student-client', created_at: '2026-07-22T10:00:00.000Z', ...overrides,
})
const setRef = {
  v: 1 as const,
  exercise_name: '低杠位深蹲',
  set_number: 1,
  weight_kg: '100',
  reps: 5,
  rpe: '8.5',
  day_date: '2026-07-27',
  set_log_id: '70000000-0000-4000-8000-000000000001',
}
const setCardMessage = (overrides: Partial<ChatMessage> = {}) => message({
  set_ref: setRef,
  body: setRefFirstLine(setRef),
  ...overrides,
})

function Harness({ initial = [conversation()] }: { initial?: ChatConversation[] | null }) {
  const [conversations, setConversations] = useState<ChatConversation[] | null>(initial)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [bindLostIds, setBindLostIds] = useState<Set<string>>(() => new Set())
  const applyRead = (conversationId: string, state: ChatReadState) => setConversations((current) => (
    current?.map((item) => item.id === conversationId
      ? { ...item, unread_count: state.unread_count, my_last_read: state.my_last_read }
      : item) ?? []
  ))
  return <MessagesPage
    me={me}
    students={[{ id: 'student', display_name: '王晨曦', status: 'active', evaluation: null }]}
    conversations={conversations}
    bindLostIds={bindLostIds}
    sessionDead={false}
    activeId={activeId}
    drafts={{}}
    onActiveIdChange={setActiveId}
    onDraftChange={vi.fn()}
    onConversationsChanged={(update) => setConversations((current) => update(current ?? []))}
    onReadStateApplied={applyRead}
    onBindLost={(conversationId) => setBindLostIds((prev) => new Set(prev).add(conversationId))}
    onSessionExpired={vi.fn()}
  />
}

async function settle(): Promise<void> {
  for (let index = 0; index < 12; index += 1) await Promise.resolve()
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

  it('从列表进入线程，首屏没有新增消息也立即打已读并清红点', async () => {
    await act(async () => { root.render(<Harness />); await settle() })
    expect(host.querySelector('.chat-dot')).not.toBeNull()

    const row = host.querySelector<HTMLButtonElement>('.chat-row')
    await act(async () => { row?.click(); await settle() })

    expect(host.textContent).toContain('请看一下动作')
    expect(chatApi.markConversationRead).toHaveBeenCalledWith('conversation', 'message-1')
    expect(host.querySelector('.chat-dot')).toBeNull()
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
    const row = host.querySelector<HTMLButtonElement>('.chat-row')
    await act(async () => { row?.click(); await settle() })

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
      await act(async () => { host.querySelector<HTMLButtonElement>('.chat-row')?.click() })
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
    await act(async () => { host.querySelector<HTMLButtonElement>('.chat-row')?.click(); await settle() })
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
    await act(async () => { root.render(<Harness key="empty" initial={[]} />) })
    expect(host.textContent).toContain('暂无会话')
  })

  it('中文输入法候选态的 Enter 不误发，上屏后的 Enter 正常发送', async () => {
    await act(async () => { root.render(<Harness initial={[conversation(0)]} />); await settle() })
    await act(async () => { host.querySelector<HTMLButtonElement>('.chat-row')?.click(); await settle() })
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
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, isComposing: false }))
      await settle()
    })
    expect(chatApi.sendTextMessage).toHaveBeenCalledTimes(1)
    expect(chatApi.sendTextMessage.mock.calls[0]?.[1]).toBe('明天深蹲 RPE7')
  })

  it('发送遇到绑定失效后禁用输入框，失败气泡不提供重试', async () => {
    chatApi.sendTextMessage.mockRejectedValue(new ApiException(403, 'CHAT_BIND_REQUIRED'))
    await act(async () => { root.render(<Harness initial={[conversation(0)]} />); await settle() })
    await act(async () => { host.querySelector<HTMLButtonElement>('.chat-row')?.click(); await settle() })
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
    const select = host.querySelector<HTMLSelectElement>('.chat-student-select')!
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!
    await act(async () => {
      valueSetter.call(select, 'student')
      select.dispatchEvent(new Event('change', { bubbles: true }))
      await settle()
    })
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
    await act(async () => { host.querySelector<HTMLButtonElement>('.chat-row')?.click(); await settle() })
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
