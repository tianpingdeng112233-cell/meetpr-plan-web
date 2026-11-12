import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { openConversation } from '../../api/chat'
import { postCoachFeedback } from '../../api/coach'
import { abortChatImage, sendChatImage, type ChatImageSendSession } from '../../api/uploads'
import type { ChatConversation, CoachFeedbackResponse } from '../../api/types'
import type { FeedbackEntry } from '../plan-editor/feedbackModel'
import { chatOutbox } from './chatOutbox'
import { videoDate, videoReference } from './VideoQueue'
import { S } from '../../i18n/strings'

export interface PreparedAnnotation {
  blob: Blob
  session: ChatImageSendSession
  onSent: (attachmentId?: string) => Promise<void>
}
export interface CommunicationDraft { text: string; images: PreparedAnnotation[]; busy?: boolean; error?: string }
export type CommunicationDrafts = Record<string, CommunicationDraft>
export const communicationDraftKey = (studentId: string, videoId?: string | null) => `${studentId}:${videoId ?? 'chat'}`
const empty: CommunicationDraft = { text: '', images: [] }

function ImagePreview({ image, disabled, onRemove }: { image: PreparedAnnotation; disabled: boolean; onRemove: () => void }) {
  const [url, setUrl] = useState('')
  useEffect(() => { const url = URL.createObjectURL(image.blob); setUrl(url); return () => URL.revokeObjectURL(url) }, [image.blob])
  return <figure><img src={url} alt={S.video.annotation} /><button type="button" aria-label={S.block.removeImage} disabled={disabled} onClick={onRemove}>×</button></figure>
}

export function CommunicationComposer({ studentId, active, drafts, setDrafts, disabled, conversationId, onConversationOpened, onCancelVideo, onFeedbackSent }: {
  studentId: string; active?: FeedbackEntry; drafts: CommunicationDrafts; setDrafts: Dispatch<SetStateAction<CommunicationDrafts>>
  disabled: boolean; conversationId: string | null; onConversationOpened: (conversation: ChatConversation) => void
  onCancelVideo: () => void; onFeedbackSent: (feedback: CoachFeedbackResponse) => void
}) {
  const key = communicationDraftKey(studentId, active?.video.id)
  const draft = drafts[key] ?? empty
  const composing = useRef(false)
  const sending = useRef(new Set<string>())
  const limit = active ? 2000 : 4000
  const update = (key: string, mutate: (draft: CommunicationDraft) => CommunicationDraft) => setDrafts(all => ({ ...all, [key]: mutate(all[key] ?? empty) }))
  const send = async () => {
    const text = draft.text.trim()
    if (disabled || draft.busy || sending.current.has(key) || (!text && draft.images.length === 0) || text.length > limit) return
    sending.current.add(key)
    update(key, value => ({ ...value, busy: true, error: '' }))
    try {
      let target = conversationId
      const ensureConversation = async () => {
        if (!target) { const conversation = await openConversation(studentId); target = conversation.id; onConversationOpened(conversation) }
        return target
      }
      if (text) {
        if (active) {
          const item = await postCoachFeedback({ student_id: studentId, video_id: active.video.id, plan_exercise_id: active.video.plan_exercise_id, day_date: videoDate(active), text })
          onFeedbackSent(item)
        } else chatOutbox.enqueue(await ensureConversation(), text)
        // Commit each successful part before attempting the next. Retrying an image
        // must never post a previously confirmed feedback message a second time.
        update(key, value => ({ ...value, text: value.text === draft.text ? '' : value.text }))
      }
      for (const image of draft.images) {
        const message = await sendChatImage(await ensureConversation(), image.blob, image.session)
        chatOutbox.publishConfirmed(message)
        update(key, value => ({ ...value, images: value.images.filter(item => item !== image) }))
        await image.onSent(image.session.attachmentId)
      }
    } catch {
      update(key, value => ({ ...value, error: S.block.sendPartsFailed }))
    } finally {
      sending.current.delete(key)
      update(key, value => ({ ...value, busy: false }))
    }
  }
  return <form className="chat-composer communication-composer" onSubmit={event => { event.preventDefault(); void send() }}>
    {active && <div className="communication-reply"><span>▹ {videoReference(active)}</span><button type="button" aria-label={S.block.cancelVideoReply} onClick={onCancelVideo}>×</button></div>}
    {draft.images.length > 0 && <div className="communication-images">{draft.images.map(image => <ImagePreview key={image.session.clientId} image={image} disabled={disabled || !!draft.busy} onRemove={() => {
      abortChatImage(image.session); update(key, value => ({ ...value, images: value.images.filter(item => item !== image) }))
    }} />)}</div>}
    <textarea aria-label={active ? S.block.replyVideo : S.chat.messages} value={draft.text} maxLength={limit} disabled={disabled || !!draft.busy}
      placeholder={active ? S.video.feedbackPlaceholder : S.chat.messagePlaceholder}
      onChange={event => update(key, value => ({ ...value, text: event.target.value, error: '' }))}
      onCompositionStart={() => { composing.current = true }} onCompositionEnd={() => { composing.current = false }}
      onKeyDown={event => {
        if (event.nativeEvent.isComposing || event.keyCode === 229 || composing.current) return
        if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send() }
      }} />
    {draft.error && <small role="alert">{draft.error}</small>}
    <footer><small>{S.block.enterHint}</small><button type="submit" disabled={disabled || !!draft.busy || (!draft.text.trim() && !draft.images.length)}>{draft.busy ? S.video.sending : S.common.send} ▹</button></footer>
  </form>
}
