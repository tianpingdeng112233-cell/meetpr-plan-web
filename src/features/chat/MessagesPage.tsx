import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { getMessages, markConversationRead, openConversation } from '../../api/chat'
import { ApiException } from '../../api/client'
import { isBindLost, isSessionExpired } from '../../api/errors'
import type {
  AuthUser,
  ChatConversation,
  ChatMessage,
  ChatReadCursor,
  ChatReadState,
  CoachStudent,
} from '../../api/types'
import {
  chatRelativeTime,
  conversationPreview,
  maxSeq,
  mergeMessages,
  minSeq,
  readReceiptFor,
  unreadTotal,
} from './chatModel'
import { catchUpSince } from './chatSync'
import { chatOutbox, type OutboxItem } from './chatOutbox'
import { useClockTick, useVisiblePolling } from './useVisiblePolling'

const INTERACTION_WINDOW_MS = 120_000

interface MessagesPageProps {
  me: AuthUser
  students: CoachStudent[]
  conversations: ChatConversation[] | null
  bindLostIds: ReadonlySet<string>
  sessionDead: boolean
  activeId: string | null
  drafts: Record<string, string>
  onActiveIdChange: (id: string | null) => void
  onDraftChange: (conversationId: string, text: string) => void
  onConversationsChanged: (update: (prev: ChatConversation[]) => ChatConversation[]) => void
  onReadStateApplied: (conversationId: string, state: ChatReadState) => void
  onBindLost: (conversationId: string) => void
  onSessionExpired: () => void
}

const newerCursor = (left: ChatReadCursor | null, right: ChatReadCursor | null) => {
  if (!left) return right
  if (!right) return left
  return right.seq > left.seq ? right : left
}

export default function MessagesPage({
  me,
  students,
  conversations,
  bindLostIds,
  sessionDead,
  activeId,
  drafts,
  onActiveIdChange,
  onDraftChange,
  onConversationsChanged,
  onReadStateApplied,
  onBindLost,
  onSessionExpired,
}: MessagesPageProps) {
  const now = useClockTick(60_000)
  const found = activeId == null
    ? null
    : conversations?.find((conversation) => conversation.id === activeId) ?? null
  const [activeSnapshot, setActiveSnapshot] = useState<ChatConversation | null>(null)
  const [unavailableStudentIds, setUnavailableStudentIds] = useState<Set<string>>(() => new Set())
  const [openingConversation, setOpeningConversation] = useState(false)
  const [openError, setOpenError] = useState('')
  const active = activeSnapshot?.id === activeId ? activeSnapshot : found
  const activeBindLost = active == null
    ? false
    : bindLostIds.has(active.id) || !students.some((student) => student.id === active.other_party.id)

  useEffect(() => {
    if (activeId == null) { setActiveSnapshot(null); return }
    const incoming = conversations?.find((conversation) => conversation.id === activeId)
    if (!incoming) return
    setActiveSnapshot((current) => current?.id === incoming.id
      ? {
          ...current,
          ...incoming,
          my_last_read: newerCursor(current.my_last_read, incoming.my_last_read),
          other_last_read: newerCursor(current.other_last_read, incoming.other_last_read),
        }
      : incoming)
  }, [activeId, conversations])

  const startConversation = async (studentId: string) => {
    if (!studentId || openingConversation || sessionDead) return
    setOpeningConversation(true)
    setOpenError('')
    try {
      const opened = await openConversation(studentId)
      onConversationsChanged((prev) => prev.some((item) => item.id === opened.id)
        ? prev.map((item) => item.id === opened.id ? opened : item)
        : [...prev, opened])
      onActiveIdChange(opened.id)
    } catch (caught) {
      if (isSessionExpired(caught)) onSessionExpired()
      else if (isBindLost(caught)) {
        setUnavailableStudentIds((prev) => new Set(prev).add(studentId))
        setOpenError('该学员已不在你的名下')
      } else setOpenError('发起对话失败，请重试')
    } finally {
      setOpeningConversation(false)
    }
  }

  return <main className="data-page chat-page">
    <header className="page-top">
      {activeId != null && <button className="page-back" onClick={() => onActiveIdChange(null)}>← 全部会话</button>}
      <span className="page-eyebrow">COACH / 消息</span>
      <span className="page-divider" />
      {activeId != null && <b>{active?.other_party.display_name || '未命名学员'}</b>}
      <span className="page-spacer" />
      <select
        className="student-select chat-student-select"
        aria-label="发起对话"
        value=""
        disabled={sessionDead || openingConversation}
        onChange={(event) => { void startConversation(event.currentTarget.value) }}
      >
        <option value="">{openingConversation ? '发起中…' : '＋ 发起对话'}</option>
        {students.map((student) => <option
          key={student.id}
          value={student.id}
          disabled={unavailableStudentIds.has(student.id)}
        >{student.display_name || '未命名学员'}</option>)}
      </select>
      <span className="page-status">{activeId == null
        ? `● ${unreadTotal(conversations)} 条未读 · 30s 自动刷新`
        : '● 5s 自动刷新'}</span>
    </header>
    {openError && <div className="chat-open-error">{openError}</div>}
    {conversations === null
      ? <div className="empty-state">加载中…</div>
      : activeId == null
        ? <ConversationList
            conversations={conversations}
            bindLostIds={bindLostIds}
            studentIds={new Set(students.map((student) => student.id))}
            now={now}
            onOpen={onActiveIdChange}
          />
        : active
          ? <ConversationThread
              key={active.id}
              me={me}
              conversation={active}
              now={now}
              sessionDead={sessionDead}
              bindLost={activeBindLost}
              initialDraft={drafts[active.id] ?? ''}
              onDraftChange={(text) => onDraftChange(active.id, text)}
              onConversationChanged={(update) => {
                setActiveSnapshot((current) => current?.id === active.id ? update(current) : current)
                onConversationsChanged((prev) => prev.map((item) => item.id === active.id ? update(item) : item))
              }}
              onReadStateApplied={onReadStateApplied}
              onMissing={() => {
                onConversationsChanged((prev) => prev.filter((item) => item.id !== active.id))
                onActiveIdChange(null)
              }}
              onBindLost={() => onBindLost(active.id)}
              onSessionExpired={onSessionExpired}
            />
          : <div className="empty-state">会话不存在</div>}
  </main>
}

function ConversationList({ conversations, bindLostIds, studentIds, now, onOpen }: {
  conversations: ChatConversation[]
  bindLostIds: ReadonlySet<string>
  studentIds: ReadonlySet<string>
  now: number
  onOpen: (id: string) => void
}) {
  if (conversations.length === 0) return <div className="empty-state">暂无会话</div>
  return <div className="chat-list">{conversations.map((conversation) => {
    const name = conversation.other_party.display_name || '未命名学员'
    const lost = bindLostIds.has(conversation.id) || !studentIds.has(conversation.other_party.id)
    return <button
      type="button"
      className={`chat-row${lost ? ' lost' : ''}`}
      key={conversation.id}
      onClick={() => onOpen(conversation.id)}
    >
      <span className="avatar">{conversation.other_party.display_name.slice(0, 1) || '?'}</span>
      <span className="chat-row-copy">
        <b>{name}</b>
        <small>{lost && '（已解除绑定）'}{conversationPreview(conversation)}</small>
      </span>
      <span className="chat-row-meta">
        <time>{chatRelativeTime(conversation.last_message_at, now)}</time>
        {conversation.unread_count > 0 && <i className="chat-dot" aria-label={`${conversation.unread_count} 条未读`} />}
      </span>
    </button>
  })}</div>
}

function ConversationThread({
  me,
  conversation,
  now,
  sessionDead,
  bindLost,
  initialDraft,
  onDraftChange,
  onConversationChanged,
  onReadStateApplied,
  onMissing,
  onBindLost,
  onSessionExpired,
}: {
  me: AuthUser
  conversation: ChatConversation
  now: number
  sessionDead: boolean
  bindLost: boolean
  initialDraft: string
  onDraftChange: (text: string) => void
  onConversationChanged: (update: (current: ChatConversation) => ChatConversation) => void
  onReadStateApplied: (conversationId: string, state: ChatReadState) => void
  onMissing: () => void
  onBindLost: () => void
  onSessionExpired: () => void
}) {
  const [snapshot, setSnapshot] = useState(conversation)
  const snapshotRef = useRef(conversation)
  const [messages, setMessages] = useState<ChatMessage[] | null>(null)
  const messagesRef = useRef<ChatMessage[]>([])
  const [hasMoreHistory, setHasMoreHistory] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [error, setError] = useState('')
  const initialized = useRef(false)
  const alive = useRef(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  const latestAppliedReadSeq = useRef(conversation.my_last_read?.seq ?? 0)
  const latestRequestedReadSeq = useRef(conversation.my_last_read?.seq ?? 0)
  const readRequest = useRef(0)
  const invalidReadMessageIds = useRef(new Set<string>())
  const lastInteractionAt = useRef(Date.now())
  const reportedOutboxErrors = useRef(new Set<string>())
  const syncingOutbox = useRef(false)
  const imageRenewalAttempted = useRef(new Set<string>())
  const lastImageRenewalAt = useRef(0)
  const [unavailableImageIds, setUnavailableImageIds] = useState<Set<string>>(() => new Set())
  const [, setOutboxRevision] = useState(0)

  const commitSnapshot = (update: (current: ChatConversation) => ChatConversation) => {
    const current = snapshotRef.current
    const next = update(current)
    if (next === current) return
    snapshotRef.current = next
    if (alive.current) setSnapshot(next)
    onConversationChanged(update)
  }
  const commitMessages = (next: ChatMessage[]) => {
    messagesRef.current = next
    if (alive.current) setMessages(next)
  }

  const mergeConfirmedOutbox = () => {
    if (syncingOutbox.current) return
    syncingOutbox.current = true
    try {
      const outboxItems = chatOutbox.itemsFor(conversation.id)
      const confirmed = outboxItems.filter((item): item is OutboxItem & {
        status: { state: 'confirmed'; message: ChatMessage }
      } => item.status.state === 'confirmed')
      if (confirmed.length > 0) {
        const next = mergeMessages(messagesRef.current, confirmed.map((item) => item.status.message))
        commitMessages(next)
        const latest = confirmed.reduce((current, item) => (
          !current || item.status.message.seq > current.seq ? item.status.message : current
        ), null as ChatMessage | null)
        if (latest) commitSnapshot((current) => current.last_message && current.last_message.seq > latest.seq
          ? current
          : {
              ...current,
              last_message: {
                id: latest.id,
                seq: latest.seq,
                kind: latest.kind,
                preview: latest.kind === 'text' ? latest.body ?? '' : latest.kind === 'image' ? '[图片]' : '[暂不支持的消息]',
                created_at: latest.created_at,
                sender_id: latest.sender_id,
              },
              last_message_at: latest.created_at,
            })
        confirmed.forEach((item) => chatOutbox.acknowledgeConfirmed(item.clientId))
      }
      for (const item of outboxItems) {
        if (item.status.state !== 'failed' || reportedOutboxErrors.current.has(item.clientId)) continue
        if (item.status.code === 'CHAT_BIND_REQUIRED') onBindLost()
        if (item.status.code === 'CONVERSATION_NOT_FOUND') onMissing()
        reportedOutboxErrors.current.add(item.clientId)
      }
      setOutboxRevision((revision) => revision + 1)
    } finally {
      syncingOutbox.current = false
    }
  }

  useEffect(() => {
    snapshotRef.current = {
      ...snapshotRef.current,
      ...conversation,
      my_last_read: newerCursor(snapshotRef.current.my_last_read, conversation.my_last_read),
      other_last_read: newerCursor(snapshotRef.current.other_last_read, conversation.other_last_read),
    }
    const incomingReadSeq = conversation.my_last_read?.seq ?? 0
    latestAppliedReadSeq.current = Math.max(latestAppliedReadSeq.current, incomingReadSeq)
    latestRequestedReadSeq.current = Math.max(latestRequestedReadSeq.current, incomingReadSeq)
    setSnapshot(snapshotRef.current)
  }, [conversation])

  useEffect(() => {
    alive.current = true
    const interacted = () => { lastInteractionAt.current = Date.now() }
    window.addEventListener('pointerdown', interacted)
    window.addEventListener('keydown', interacted)
    window.addEventListener('wheel', interacted)
    window.addEventListener('focus', interacted)
    document.addEventListener('scroll', interacted, true)
    return () => {
      alive.current = false
      window.removeEventListener('pointerdown', interacted)
      window.removeEventListener('keydown', interacted)
      window.removeEventListener('wheel', interacted)
      window.removeEventListener('focus', interacted)
      document.removeEventListener('scroll', interacted, true)
    }
  }, [])

  useEffect(() => {
    const unsubscribe = chatOutbox.subscribe(mergeConfirmedOutbox)
    mergeConfirmedOutbox()
    return unsubscribe
    // The thread is keyed by conversation id, so this subscription owns one
    // immutable conversation for its full lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleError = (caught: unknown) => {
    if (isSessionExpired(caught)) { onSessionExpired(); return }
    if (caught instanceof ApiException && caught.status === 404) { onMissing(); return }
    if (caught instanceof ApiException && caught.status === 403 && caught.code === 'CHAT_BIND_REQUIRED') {
      onBindLost()
    }
  }

  const markReadIfNeeded = async (currentMessages: ChatMessage[]) => {
    if (
      document.visibilityState !== 'visible'
      || !document.hasFocus()
      || Date.now() - lastInteractionAt.current > INTERACTION_WINDOW_MS
    ) return
    const target = currentMessages.reduce<ChatMessage | null>((latest, message) => (
      message.sender_id !== me.id && (!latest || message.seq > latest.seq) ? message : latest
    ), null)
    if (
      !target
      || target.seq <= latestRequestedReadSeq.current
      || invalidReadMessageIds.current.has(target.id)
    ) return

    latestRequestedReadSeq.current = target.seq
    const request = ++readRequest.current
    try {
      const state = await markConversationRead(conversation.id, target.id)
      if (request !== readRequest.current) return
      latestAppliedReadSeq.current = state.my_last_read.seq
      latestRequestedReadSeq.current = state.my_last_read.seq
      commitSnapshot((current) => ({
        ...current,
        unread_count: state.unread_count,
        my_last_read: state.my_last_read,
      }))
      onReadStateApplied(conversation.id, state)
    } catch (caught) {
      if (request !== readRequest.current) return
      latestRequestedReadSeq.current = latestAppliedReadSeq.current
      if (caught instanceof ApiException && caught.status === 400 && caught.code === 'CHAT_INVALID_CURSOR') {
        invalidReadMessageIds.current.add(target.id)
        console.warn('Chat read cursor rejected for current conversation', target.id)
        return
      }
      handleError(caught)
    }
  }

  const commitOtherLastRead = (otherLastRead: ChatReadCursor | null) => {
    commitSnapshot((current) => {
      const next = newerCursor(current.other_last_read, otherLastRead)
      return next === current.other_last_read ? current : { ...current, other_last_read: next }
    })
  }

  const mergePage = (pageMessages: ChatMessage[], otherLastRead: ChatReadCursor | null, scrollToBottom: boolean) => {
    const next = mergeMessages(messagesRef.current, pageMessages)
    commitMessages(next)
    chatOutbox.reconcile(conversation.id, pageMessages, me.id)
    commitOtherLastRead(otherLastRead)
    if (scrollToBottom) window.requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    })
    return next
  }

  useVisiblePolling(async () => {
    if (sessionDead) return
    const scroll = scrollRef.current
    const nearBottom = !scroll || scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight <= 48
    try {
      if (!initialized.current || maxSeq(messagesRef.current) === 0) {
        const page = await getMessages(conversation.id, { mode: 'latest', limit: 50 })
        initialized.current = true
        if (alive.current) { setHasMoreHistory(page.meta.has_more); setError('') }
        const next = mergePage(page.messages, page.meta.other_last_read, true)
        await markReadIfNeeded(next)
        return 5_000
      }

      let otherLastRead: ChatReadCursor | null = null
      const result = await catchUpSince(async (afterSeq) => {
        const page = await getMessages(conversation.id, { mode: 'since', seq: afterSeq, limit: 50 })
        otherLastRead = newerCursor(otherLastRead, page.meta.other_last_read)
        return page
      }, maxSeq(messagesRef.current))
      const next = result.messages.length > 0
        ? mergePage(result.messages, otherLastRead, nearBottom)
        : messagesRef.current
      if (result.messages.length === 0) commitOtherLastRead(otherLastRead)
      await markReadIfNeeded(next)
      return result.pagesFetched > 1 ? Math.min(30_000, result.pagesFetched * 2_000) : 5_000
    } catch (caught) {
      if (!initialized.current && alive.current) setError('消息加载失败，请稍后重试')
      handleError(caught)
      return 5_000
    }
  }, 5_000, { enabled: !sessionDead, immediate: true })

  const loadHistory = async () => {
    const beforeSeq = minSeq(messagesRef.current)
    if (!beforeSeq || loadingHistory) return
    setLoadingHistory(true)
    const scroll = scrollRef.current
    const oldHeight = scroll?.scrollHeight ?? 0
    try {
      const page = await getMessages(conversation.id, { mode: 'before', seq: beforeSeq, limit: 50 })
      const next = mergeMessages(messagesRef.current, page.messages)
      commitMessages(next)
      chatOutbox.reconcile(conversation.id, page.messages, me.id)
      commitOtherLastRead(page.meta.other_last_read)
      setHasMoreHistory(page.meta.has_more)
      window.requestAnimationFrame(() => {
        if (scrollRef.current) scrollRef.current.scrollTop += scrollRef.current.scrollHeight - oldHeight
      })
    } catch (caught) {
      handleError(caught)
    } finally {
      if (alive.current) setLoadingHistory(false)
    }
  }

  const renewImage = async (message: ChatMessage) => {
    if (imageRenewalAttempted.current.has(message.id)) {
      setUnavailableImageIds((prev) => new Set(prev).add(message.id))
      return
    }
    imageRenewalAttempted.current.add(message.id)
    const now = Date.now()
    const renewalAt = Math.max(now, lastImageRenewalAt.current + 500)
    const delay = renewalAt - now
    // Reserve the slot before awaiting so several images failing in the same
    // frame are still spaced 500ms apart rather than all observing the old time.
    lastImageRenewalAt.current = renewalAt
    if (delay > 0) await new Promise<void>((resolve) => window.setTimeout(resolve, delay))
    if (!alive.current) return
    try {
      const page = await getMessages(conversation.id, { mode: 'before', seq: message.seq + 1, limit: 1 })
      const renewed = page.messages.find((candidate) => candidate.seq === message.seq)
      if (!renewed?.image_url) throw new Error('CHAT_IMAGE_UNAVAILABLE')
      mergePage([renewed], page.meta.other_last_read, false)
    } catch (caught) {
      if (alive.current) setUnavailableImageIds((prev) => new Set(prev).add(message.id))
      handleError(caught)
    }
  }

  const receipt = messages ? readReceiptFor(messages, me.id, snapshot.other_last_read) : null
  const pendingItems = chatOutbox.itemsFor(conversation.id)
  return <>
    <div className="chat-thread" ref={scrollRef} aria-busy={messages === null && !error}>
      {hasMoreHistory && <button className="chat-more" disabled={loadingHistory} onClick={() => { void loadHistory() }}>
        {loadingHistory ? '加载中…' : '加载更早消息'}
      </button>}
      {error && <div className="empty-state">{error}</div>}
      {!error && messages === null && <div className="empty-state">加载中…</div>}
      {!error && messages?.length === 0 && pendingItems.length === 0 && <div className="empty-state">还没有消息</div>}
      {!error && messages?.map((message) => <ChatBubble
        key={message.id}
        message={message}
        mine={message.sender_id === me.id}
        now={now}
        receipt={receipt?.messageId === message.id ? receipt.status : null}
        imageUnavailable={unavailableImageIds.has(message.id)}
        onImageError={() => { void renewImage(message) }}
      />)}
      {pendingItems.map((item) => <PendingBubble key={item.clientId} item={item} />)}
    </div>
    <ChatComposer
      conversationId={conversation.id}
      initialDraft={initialDraft}
      disabled={sessionDead || bindLost}
      onDraftChange={onDraftChange}
    />
    {bindLost && <em className="chat-blocked">该学员已不在你的名下，无法继续发送</em>}
  </>
}

function PendingBubble({ item }: { item: OutboxItem }) {
  const failure = item.status.state === 'failed' ? item.status : null
  return <div className="chat-message mine pending">
    <div className="chat-bubble mine"><p>{item.body}</p></div>
    <small className={`chat-send-state${failure ? ' failed' : ''}`}>
      {failure ? '发送失败' : '发送中'}
      {failure?.retryable && <button type="button" onClick={() => chatOutbox.retry(item.clientId)}>重试</button>}
    </small>
  </div>
}

function ChatComposer({ conversationId, initialDraft, disabled, onDraftChange }: {
  conversationId: string
  initialDraft: string
  disabled: boolean
  onDraftChange: (text: string) => void
}) {
  const [draft, setDraft] = useState(initialDraft)
  const draftRef = useRef(initialDraft)
  const composing = useRef(false)

  useEffect(() => () => onDraftChange(draftRef.current), [conversationId])

  const changeDraft = (text: string) => {
    draftRef.current = text
    setDraft(text)
  }
  const send = () => {
    const body = draftRef.current.trim()
    if (disabled || body === '') return
    chatOutbox.enqueue(conversationId, body)
    changeDraft('')
    onDraftChange('')
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    send()
  }
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229 || composing.current) return
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      send()
    }
  }

  return <form className="chat-composer" onSubmit={submit}>
    <textarea
      aria-label="输入消息"
      value={draft}
      maxLength={4000}
      rows={1}
      disabled={disabled}
      placeholder={disabled ? '当前无法发送消息' : '输入消息'}
      onCompositionStart={() => { composing.current = true }}
      onCompositionEnd={(event) => { composing.current = false; changeDraft(event.currentTarget.value) }}
      onChange={(event) => changeDraft(event.currentTarget.value)}
      onKeyDown={keyDown}
      onBlur={() => onDraftChange(draftRef.current)}
    />
    <button type="submit" disabled={disabled || draft.trim() === ''}>发送</button>
  </form>
}

function ChatBubble({ message, mine, now, receipt, imageUnavailable, onImageError }: {
  message: ChatMessage
  mine: boolean
  now: number
  receipt: '已送达' | '已读' | null
  imageUnavailable: boolean
  onImageError: () => void
}) {
  return <div className={`chat-message${mine ? ' mine' : ''}`}>
    <div className={`chat-bubble${mine ? ' mine' : ''}`}>
      {renderMessageBody(message, onImageError, imageUnavailable)}
      <time>{chatRelativeTime(message.created_at, now)}</time>
    </div>
    {receipt && <small className="chat-receipt">{receipt}</small>}
  </div>
}

export function renderMessageBody(message: ChatMessage, onImageError?: () => void, imageUnavailable = false) {
  switch (message.kind) {
    case 'text':
      return <p>{message.body}</p>
    case 'image':
      return message.image_url && !imageUnavailable
        ? <img src={message.image_url} loading="lazy" alt="聊天图片" onError={onImageError} />
        : <span className="chat-image-missing">图片暂不可用</span>
    default:
      return <span className="chat-unknown">当前版本暂不支持的消息类型</span>
  }
}
