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
  client_id: 'student-client', created_at: '2026-07-22T10:00:00.000Z', ...overrides,
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
    // jsdom 没有布局、act() 又会同步冲刷提交,那个竞态在这里复现不出来。所以这条测试钉的是
    // 更强也更稳的不变量:**滚动不许依赖 rAF 触发**——把 rAF 打桩成永不回调,滚动仍须发生。
    vi.stubGlobal('requestAnimationFrame', () => 0)
    let scrollTopValue = 0
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get: () => 4200 })
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
    expect(scrollTopValue).toBe(4200)
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
})
