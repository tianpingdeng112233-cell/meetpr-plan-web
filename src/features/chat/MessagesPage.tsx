import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
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
import { usePersistentCollapse } from '../workspace/usePersistentCollapse'

const INTERACTION_WINDOW_MS = 120_000
const MAX_MESSAGE_CHARS = 4000
const QUICK_REPLIES = [
  '按计划完成，很好，下周继续加。',
  '这组速度掉得太多，下周降 5% 重量。',
  '视频收到了，我今晚逐组给你反馈。',
  '这周先别硬顶，睡够再练。',
  '距比赛还有 5 周，注意控体重。',
] as const
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'] as const

interface MessagesPageProps {
  me: AuthUser
  students: CoachStudent[]
  selectedStudentId: string
  conversations: ChatConversation[] | null
  bindLostIds: ReadonlySet<string>
  sessionDead: boolean
  activeId: string | null
  drafts: Record<string, string>
  onActiveIdChange: (id: string | null) => void
  onStudentChange: (studentId: string) => void
  onOpenPlan: (studentId: string) => void
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
  selectedStudentId,
  conversations,
  bindLostIds,
  sessionDead,
  activeId,
  drafts,
  onActiveIdChange,
  onStudentChange,
  onOpenPlan,
  onDraftChange,
  onConversationsChanged,
  onReadStateApplied,
  onBindLost,
  onSessionExpired,
}: MessagesPageProps) {
  const now = useClockTick(60_000)
  const [sidebarCollapsed, toggleSidebar] = usePersistentCollapse('meetpr:sidebar:messages')
  const localSelection = useRef<{ conversationId: string; selectedStudentId: string } | null>(null)
  const activeFromList = activeId == null
    ? null
    : conversations?.find((conversation) => conversation.id === activeId) ?? null
  const selectedConversation = conversations?.find((conversation) => (
    conversation.other_party.id === selectedStudentId
  )) ?? null
  const keepLocalSelection = activeFromList != null
    && localSelection.current?.conversationId === activeId
    && localSelection.current.selectedStudentId === selectedStudentId
  const activeMatchesSelectedStudent = activeFromList?.other_party.id === selectedStudentId
  const synchronizedActiveId = conversations === null || keepLocalSelection || activeMatchesSelectedStudent
    ? activeId
    : selectedConversation?.id ?? null
  const found = synchronizedActiveId == null
    ? null
    : conversations?.find((conversation) => conversation.id === synchronizedActiveId) ?? null
  const [activeSnapshot, setActiveSnapshot] = useState<ChatConversation | null>(null)
  const [unavailableStudentIds, setUnavailableStudentIds] = useState<Set<string>>(() => new Set())
  const [openingConversation, setOpeningConversation] = useState(false)
  const [openError, setOpenError] = useState('')
  const active = activeSnapshot?.id === synchronizedActiveId ? activeSnapshot : found
  const activeBindLost = active == null
    ? false
    : bindLostIds.has(active.id) || !students.some((student) => student.id === active.other_party.id)

  useEffect(() => {
    if (synchronizedActiveId == null) { setActiveSnapshot(null); return }
    const incoming = conversations?.find((conversation) => conversation.id === synchronizedActiveId)
    if (!incoming) return
    setActiveSnapshot((current) => current?.id === incoming.id
      ? {
          ...current,
          ...incoming,
          my_last_read: newerCursor(current.my_last_read, incoming.my_last_read),
          other_last_read: newerCursor(current.other_last_read, incoming.other_last_read),
        }
      : incoming)
  }, [conversations, synchronizedActiveId])

  useEffect(() => {
    if (conversations === null || activeId === synchronizedActiveId) return
    localSelection.current = null
    onActiveIdChange(synchronizedActiveId)
  }, [activeId, conversations, onActiveIdChange, synchronizedActiveId])

  const selectConversation = (conversation: ChatConversation) => {
    localSelection.current = {
      conversationId: conversation.id,
      selectedStudentId,
    }
    onActiveIdChange(conversation.id)
    const lost = bindLostIds.has(conversation.id)
      || !students.some((student) => student.id === conversation.other_party.id)
    if (!lost) onStudentChange(conversation.other_party.id)
  }

  const startConversation = async (studentId: string) => {
    if (!studentId || openingConversation || sessionDead) return
    setOpeningConversation(true)
    setOpenError('')
    try {
      const opened = await openConversation(studentId)
      onConversationsChanged((prev) => prev.some((item) => item.id === opened.id)
        ? prev.map((item) => item.id === opened.id ? opened : item)
        : [...prev, opened])
      selectConversation(opened)
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

  const totalUnread = unreadTotal(conversations)
  const activeStudent = active
    ? students.find((student) => student.id === active.other_party.id) ?? null
    : null
  const activeMeta = activeBindLost
    ? '已解除绑定'
    : activeStudent?.status === 'in_evaluation'
      ? '评估期'
      : '在训学员'
  const nextUnread = () => {
    const next = conversations?.find((conversation) => conversation.unread_count > 0)
    if (next) selectConversation(next)
    else window.dispatchEvent(new CustomEvent('meetpr:toast', { detail: '没有未读消息了' }))
  }

  return <main className="chat-page">
    <aside className={`chat-sidebar${sidebarCollapsed ? ' collapsed' : ''}`} aria-label="会话列表">
      <header className="chat-panel-head chat-list-head">
        <b>会话</b>
        <button type="button" className="chat-next-unread" onClick={nextUnread}>
          下一条未读 <span>{totalUnread}</span>
        </button>
        <button
          type="button"
          className="column-collapse-toggle"
          aria-label={sidebarCollapsed ? '展开会话列表' : '收起会话列表'}
          aria-expanded={!sidebarCollapsed}
          title={sidebarCollapsed ? '展开会话列表' : '收起会话列表'}
          onClick={toggleSidebar}
        >
          {sidebarCollapsed ? '›' : '‹'}
        </button>
      </header>
      {openError && <div className="chat-open-error">{openError}</div>}
      {conversations === null
        ? <div className="empty-state">加载中…</div>
        : <ConversationList
            conversations={conversations}
            students={students}
            bindLostIds={bindLostIds}
            unavailableStudentIds={unavailableStudentIds}
            activeId={synchronizedActiveId}
            openingConversation={openingConversation}
            sessionDead={sessionDead}
            now={now}
            onOpen={selectConversation}
            onStart={(studentId) => { void startConversation(studentId) }}
          />}
    </aside>
    <section className="chat-main-panel" aria-label="消息">
      {active && <header className="chat-panel-head chat-thread-head">
        <span className="chat-thread-avatar">{active.other_party.display_name.slice(0, 1) || '?'}</span>
        <b>{active.other_party.display_name || '未命名学员'}</b>
        <span className="chat-thread-meta">{activeMeta}</span>
        <button
          type="button"
          className="chat-open-plan"
          disabled={activeBindLost}
          title={activeBindLost ? '该学员已不在你的名下，无法打开计划' : undefined}
          onClick={() => onOpenPlan(active.other_party.id)}
        >
          打开 TA 的计划
        </button>
      </header>}
      {conversations === null
        ? <div className="empty-state">加载中…</div>
        : synchronizedActiveId == null
          ? <div className="empty-state">选择会话开始聊天</div>
          : active
            ? <ConversationThread
                key={active.id}
                me={me}
                conversation={active}
                studentName={active.other_party.display_name || '未命名学员'}
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
    </section>
  </main>
}

function ConversationList({
  conversations,
  students,
  bindLostIds,
  unavailableStudentIds,
  activeId,
  openingConversation,
  sessionDead,
  now,
  onOpen,
  onStart,
}: {
  conversations: ChatConversation[]
  students: CoachStudent[]
  bindLostIds: ReadonlySet<string>
  unavailableStudentIds: ReadonlySet<string>
  activeId: string | null
  openingConversation: boolean
  sessionDead: boolean
  now: number
  onOpen: (conversation: ChatConversation) => void
  onStart: (studentId: string) => void
}) {
  const studentIds = new Set(students.map((student) => student.id))
  const conversationStudentIds = new Set(conversations.map((conversation) => conversation.other_party.id))
  const unstarted = students.filter((student) => !conversationStudentIds.has(student.id))
  if (conversations.length === 0 && unstarted.length === 0) {
    return <div className="empty-state">暂无会话</div>
  }
  return <div className="chat-list">{conversations.map((conversation) => {
    const name = conversation.other_party.display_name || '未命名学员'
    const lost = bindLostIds.has(conversation.id) || !studentIds.has(conversation.other_party.id)
    return <button
      type="button"
      aria-current={activeId === conversation.id ? 'true' : undefined}
      className={`chat-row${activeId === conversation.id ? ' active' : ''}${conversation.unread_count > 0 ? ' unread' : ''}${lost ? ' lost' : ''}`}
      key={conversation.id}
      onClick={() => onOpen(conversation)}
    >
      <span className="chat-row-copy">
        <b>{name}</b>
        <small>{lost && '（已解除绑定）'}{conversationPreview(conversation)}</small>
      </span>
      <span className="chat-row-meta">
        <time>{chatRelativeTime(conversation.last_message_at, now)}</time>
        {conversation.unread_count > 0 && <i className="chat-unread-badge" aria-label={`${conversation.unread_count} 条未读`}>
          {conversation.unread_count}
        </i>}
      </span>
    </button>
  })}
    {unstarted.map((student) => <button
      type="button"
      className="chat-row chat-row-new"
      key={student.id}
      disabled={sessionDead || openingConversation || unavailableStudentIds.has(student.id)}
      onClick={() => onStart(student.id)}
    >
      <span className="chat-row-copy">
        <b>{student.display_name || '未命名学员'}</b>
        <small>{unavailableStudentIds.has(student.id) ? '该学员已不在你的名下' : '还没有消息'}</small>
      </span>
      <span className="chat-row-start">{openingConversation ? '发起中…' : '发起'}</span>
    </button>)}
  </div>
}

function ConversationThread({
  me,
  conversation,
  studentName,
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
  studentName: string
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
  // Scrolling has to wait for React to commit the new bubbles: a bare rAF can run before the
  // commit, so scrollHeight is still the pre-render value and a 50-message page lands at the
  // top instead of the bottom. useLayoutEffect fires after the DOM mutation, before paint.
  const pendingScroll = useRef<{ kind: 'bottom' } | { kind: 'anchor'; previousHeight: number } | null>(null)
  // Armed with the landing scrollTop of a programmatic scroll and consumed by the one scroll event
  // that reports exactly it, so the document-level listener can tell that event apart from the
  // coach actually touching the thread. A time window would not do: a long task can delay the
  // event past any deadline, and a real scroll inside the window would be swallowed.
  const programmaticScrollTop = useRef<number | null>(null)
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
    // Programmatic scrolling (the sink-to-bottom below) also fires a scroll event, and this is a
    // capture listener on document, so it would see it. Counting that as user interaction lets an
    // idle coach's thread mark itself read on the next tick — exactly what §8.2.25 forbids.
    const interacted = (event: Event) => {
      const thread = scrollRef.current
      if (event.type === 'scroll' && thread !== null && event.target === thread) {
        const armed = programmaticScrollTop.current
        // Any scroll on the thread retires the marker, matching or not: leaving a stale one armed
        // would swallow a later genuine scroll that happens to land back on the same offset.
        programmaticScrollTop.current = null
        if (armed !== null && thread.scrollTop === armed) return
      }
      lastInteractionAt.current = Date.now()
    }
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

  useLayoutEffect(() => {
    const action = pendingScroll.current
    if (!action) return
    pendingScroll.current = null
    const scroll = scrollRef.current
    if (!scroll) return
    const before = scroll.scrollTop
    if (action.kind === 'bottom') scroll.scrollTop = scroll.scrollHeight
    else scroll.scrollTop += scroll.scrollHeight - action.previousHeight
    // Only arm when the position actually moved — an unchanged scrollTop fires no event, and a
    // stale marker would swallow the coach's next scroll that happens to land on the same value.
    programmaticScrollTop.current = scroll.scrollTop === before ? null : scroll.scrollTop
  }, [messages])

  const mergePage = (pageMessages: ChatMessage[], otherLastRead: ChatReadCursor | null, scrollToBottom: boolean) => {
    const next = mergeMessages(messagesRef.current, pageMessages)
    commitMessages(next)
    chatOutbox.reconcile(conversation.id, pageMessages, me.id)
    commitOtherLastRead(otherLastRead)
    // An anchor already queued means the coach explicitly asked for older history; React may batch
    // both updates into one commit, and yanking them back to the bottom would undo that click.
    if (scrollToBottom && pendingScroll.current?.kind !== 'anchor') pendingScroll.current = { kind: 'bottom' }
    return next
  }

  // Evaluated at merge time, never at tick start: a request can be in flight while the coach
  // scrolls up and loads older history, and a pre-request sample would then yank them back down.
  const isNearBottom = () => {
    const scroll = scrollRef.current
    return !scroll || scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight <= 48
  }

  useVisiblePolling(async () => {
    if (sessionDead) return
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
        ? mergePage(result.messages, otherLastRead, isNearBottom())
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
    try {
      const page = await getMessages(conversation.id, { mode: 'before', seq: beforeSeq, limit: 50 })
      // Sampled here, not before the request: a poll tick can append to the bottom while the
      // history page is in flight, and a pre-request height would fold that growth into the
      // anchor delta and shove the coach down by it.
      const oldHeight = scrollRef.current?.scrollHeight ?? 0
      const next = mergeMessages(messagesRef.current, page.messages)
      commitMessages(next)
      chatOutbox.reconcile(conversation.id, page.messages, me.id)
      commitOtherLastRead(page.meta.other_last_read)
      setHasMoreHistory(page.meta.has_more)
      pendingScroll.current = { kind: 'anchor', previousHeight: oldHeight }
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
  const messageGroups = messages ? groupMessagesByDay(messages, now) : []
  const todayKey = localDayKey(now)
  const lastMessageGroupIsToday = messageGroups.at(-1)?.key === todayKey
  const pendingSharesLastMessageGroup = !error && lastMessageGroupIsToday
  return <>
    <div className="chat-thread" ref={scrollRef} aria-busy={messages === null && !error}>
      {hasMoreHistory && <button className="chat-more" disabled={loadingHistory} onClick={() => { void loadHistory() }}>
        {loadingHistory ? '加载中…' : '加载更早消息'}
      </button>}
      {error && <div className="empty-state">{error}</div>}
      {!error && messages === null && <div className="empty-state">加载中…</div>}
      {!error && messages?.length === 0 && pendingItems.length === 0 && <div className="empty-state">还没有消息</div>}
      {!error && messageGroups.map((group, index) => <section className="chat-day-group" key={group.key}>
        <div className="chat-day-label">{group.label}</div>
        {group.messages.map((message) => <ChatBubble
          key={message.id}
          message={message}
          mine={message.sender_id === me.id}
          senderLabel={studentName}
          receipt={receipt?.messageId === message.id ? receipt.status : null}
          imageUnavailable={unavailableImageIds.has(message.id)}
          onImageError={() => { void renewImage(message) }}
        />)}
        {index === messageGroups.length - 1 && pendingSharesLastMessageGroup
          && pendingItems.map((item) => <PendingBubble key={item.clientId} item={item} />)}
      </section>)}
      {pendingItems.length > 0 && !pendingSharesLastMessageGroup
        && <section className="chat-day-group" key={todayKey}>
          <div className="chat-day-label">今天</div>
          {pendingItems.map((item) => <PendingBubble key={item.clientId} item={item} />)}
        </section>}
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
    <div className="chat-message-meta"><span>我</span></div>
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
  const applyQuickReply = (reply: string) => {
    const current = draftRef.current
    // Programmatic writes bypass the textarea's maxLength, so clamp here too.
    changeDraft((current === '' ? reply : `${current}\n${reply}`).slice(0, MAX_MESSAGE_CHARS))
  }
  const send = () => {
    const body = draftRef.current.trim()
    if (disabled || body === '' || body.length > MAX_MESSAGE_CHARS) return
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
    <div className="chat-quick-replies" aria-label="快捷回复">
      {QUICK_REPLIES.map((reply) => <button
        type="button"
        className="chat-quick-reply"
        key={reply}
        disabled={disabled}
        onClick={() => applyQuickReply(reply)}
      >
        <span>{reply}</span>
      </button>)}
    </div>
    <div className="chat-composer-row">
      <textarea
        aria-label="输入消息"
        value={draft}
        maxLength={MAX_MESSAGE_CHARS}
        rows={1}
        disabled={disabled}
        placeholder={disabled ? '当前无法发送消息' : '输入消息'}
        onCompositionStart={() => { composing.current = true }}
        onCompositionEnd={(event) => { composing.current = false; changeDraft(event.currentTarget.value) }}
        onChange={(event) => changeDraft(event.currentTarget.value)}
        onKeyDown={keyDown}
        onBlur={() => onDraftChange(draftRef.current)}
      />
      <button type="submit" disabled={disabled || draft.trim() === ''}>
        发送 <span>⌘↵</span>
      </button>
    </div>
  </form>
}

function ChatBubble({ message, mine, senderLabel, receipt, imageUnavailable, onImageError }: {
  message: ChatMessage
  mine: boolean
  senderLabel: string
  receipt: '已送达' | '已读' | null
  imageUnavailable: boolean
  onImageError: () => void
}) {
  return <div className={`chat-message${mine ? ' mine' : ''}`}>
    <div className="chat-message-meta">
      <span>{mine ? '我' : senderLabel}</span>
      <time>{chatClockTime(message.created_at)}</time>
    </div>
    <div className={`chat-bubble${mine ? ' mine' : ''}`}>
      {renderMessageBody(message, onImageError, imageUnavailable)}
    </div>
    {receipt && <small className="chat-receipt">{receipt}</small>}
  </div>
}

function localDayKey(value: string | number): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return String(value)
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function chatDayLabel(iso: string, now: number): string {
  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) return '日期未知'
  const today = new Date(now)
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const key = localDayKey(iso)
  if (key === localDayKey(today.getTime())) return '今天'
  if (key === localDayKey(yesterday.getTime())) return '昨天'
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} 周${WEEKDAYS[date.getDay()]}`
}

function chatClockTime(iso: string): string {
  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) return ''
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function groupMessagesByDay(messages: ChatMessage[], now: number): {
  key: string
  label: string
  messages: ChatMessage[]
}[] {
  const groups: { key: string; label: string; messages: ChatMessage[] }[] = []
  for (const message of messages) {
    const key = localDayKey(message.created_at)
    const current = groups[groups.length - 1]
    if (current?.key === key) current.messages.push(message)
    else groups.push({ key, label: chatDayLabel(message.created_at, now), messages: [message] })
  }
  return groups
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
