import MessagesPage, { type MessagesPageProps } from './MessagesPage'
import { findChatVideo, parseSetRefMessage } from './setRef'
import type { FeedbackEntry } from '../plan-editor/feedbackModel'
import { fmt, S, resolveLocale } from '../../i18n/strings'
import type { CoachFeedbackResponse } from '../../api/types'
import { CommunicationComposer, type CommunicationDrafts } from './CommunicationComposer'
import type { Dispatch, SetStateAction } from 'react'
import { videoReference } from './VideoQueue'

export interface CommunicationContext {
  communicationVisible?: boolean
  entries: readonly FeedbackEntry[]
  active?: FeedbackEntry
  feedbackItems: readonly CoachFeedbackResponse[]
  onCancelVideo: () => void
  onFeedbackSent: (item: CoachFeedbackResponse) => void
  onOpenEntry: (entry: FeedbackEntry) => void
  readOnly: boolean
}
interface Props extends MessagesPageProps, CommunicationContext {
  communicationDrafts: CommunicationDrafts
  setCommunicationDrafts: Dispatch<SetStateAction<CommunicationDrafts>>
}

export function EditorChat({ communicationVisible = true, entries, active, feedbackItems, onCancelVideo, onFeedbackSent, onOpenEntry, readOnly, communicationDrafts, setCommunicationDrafts, ...messages }: Props) {
  const timeline = [...feedbackItems].sort((a, b) => a.posted_at.localeCompare(b.posted_at)).map(item => {
    const entry = entries.find(entry => entry.video.id === item.video_id)
    const label = entry ? videoReference(entry) : `${item.day_date ?? ''} · ${item.video_id || item.plan_exercise_id ? S.block.feedback : S.block.legacyDayFeedback}`
    return { id: `feedback:${item.id}`, created_at: item.posted_at, content: <article className="chat-message mine communication-feedback" data-feedback-id={item.id}>
      <div className="chat-message-meta">{S.chat.me} · {new Date(item.posted_at).toLocaleString(resolveLocale(), { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
      <div className="chat-bubble mine"><button type="button" disabled={!entry} onClick={() => entry && onOpenEntry(entry)}>{label}</button><p>{item.text}</p></div>
      <small className="chat-send-state">{item.read_at ? S.block.feedbackRead : S.block.feedbackUnread}</small>
    </article> }
  })
  return <div className="editor-communication">
    <MessagesPage key={messages.selectedStudentId} {...messages} floating visible={communicationVisible} timeline={timeline}
      renderComposer={(conversation, disabled) => <CommunicationComposer studentId={messages.selectedStudentId} active={active}
        drafts={communicationDrafts} setDrafts={setCommunicationDrafts} disabled={disabled || readOnly} conversationId={conversation?.id ?? null}
        onCancelVideo={onCancelVideo} onFeedbackSent={onFeedbackSent}
        onConversationOpened={conversation => {
          messages.onConversationsChanged(previous => [conversation, ...previous.filter(item => item.id !== conversation.id)])
          messages.onActiveIdChange(conversation.id)
        }} />}
      renderVideoCapsule={message => {
        const parsed = parseSetRefMessage(message)
        if (!parsed || !message.video_url) return undefined
        const ref = parsed.setRef
        const target = { setLogId: ref.set_log_id, dayDate: ref.day_date, exerciseName: ref.exercise_name, setIndex: ref.set_number - 1 }
        const video = findChatVideo(entries.map(entry => entry.video), target)
        const entry = entries.find(entry => entry.video.id === video?.id)
        const position = entry?.inPlan ? `W${entry.week} · D${entry.day} · ` : `${ref.day_date.slice(5).replace('-', '/')} · `
        const name = fmt.exerciseName({ name: video?.exercise_name ?? ref.exercise_name, name_en: video ? video.name_en : undefined })
        return <button type="button" className="chat-video-capsule" onClick={() => messages.onPlayVideo?.(messages.selectedStudentId, target)}>
          <span className="chat-video-thumbnail" aria-hidden="true">▶</span>
          <span className="chat-video-caption"><b>{position}{name}</b><small>{S.video.setNumber(ref.set_number)} · {ref.weight_kg ?? '—'}×{ref.reps ?? '—'}{ref.rpe ? ` @${ref.rpe}` : ''}</small></span>
          {video?.viewed_at === null && <em>{S.chat.unwatchedVideo}</em>}
        </button>
}} />
  </div>
}
