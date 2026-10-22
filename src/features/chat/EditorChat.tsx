import { useEffect, useState, type RefObject } from 'react'
import MessagesPage, { type MessagesPageProps } from './MessagesPage'
import { findChatVideo, parseSetRefMessage } from './setRef'
import type { FeedbackEntry } from '../plan-editor/feedbackModel'
import { fmt, S } from '../../i18n/strings'

interface Props extends MessagesPageProps {
  entries: readonly FeedbackEntry[]
  open: boolean
  onOpenChange: (open: boolean) => void
  editor: RefObject<HTMLElement>
}

/** The editor owns selection and persistence; the existing thread owns chat delivery. */
export function EditorChat({ open, onOpenChange, editor, entries, ...messages }: Props) {
  const [right, setRight] = useState(300)
  // A passive effect: the editor ref sits on our parent and is attached only after child layout effects run.
  useEffect(() => {
    const element = editor.current
    if (!element) return
    const place = () => {
      const anchor = element.querySelector('.history-player') ?? element.querySelector('[data-block-history]')
      const left = anchor?.getBoundingClientRect().left
      const next = left == null ? 20 : Math.max(20, window.innerWidth - left + 20)
      setRight(current => current === next ? current : next)
    }
    place()
    // Covers rail collapse, player mount/close, and its viewport-relative position.
    const observer = new MutationObserver(place)
    observer.observe(element, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style'] })
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => { observer.disconnect(); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true) }
  }, [editor])
  const student = messages.students.find(student => student.id === messages.selectedStudentId)
  const unread = messages.conversations?.find(item => item.other_party.id === messages.selectedStudentId)?.unread_count ?? 0
  return <aside className="editor-chat" style={{ right, bottom: open ? 44 : 48 }} aria-label={S.chat.messages}>
    {open ? <section className="editor-chat-window" aria-label={student?.display_name}>
      <header className="editor-chat-head"><b>{student?.display_name}</b><span>{S.common.student}</span>
        <button type="button" aria-label={S.chat.collapse} onClick={() => onOpenChange(false)}>⌄</button>
      </header>
      <MessagesPage key={messages.selectedStudentId} {...messages} floating renderVideoCapsule={message => {
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
    </section> : <button type="button" className="editor-chat-toggle" aria-label={`${S.chat.expand}${unread ? ` · ${S.chat.unreadCount(unread)}` : ''}`} onClick={() => onOpenChange(true)}>
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M20 11.5a8 8 0 0 1-8 8 9 9 0 0 1-3.6-.8L4 20l1.3-4.4A8 8 0 1 1 20 11.5Z" /></svg>
      {unread > 0 && <span>{unread}</span>}
    </button>}
  </aside>
}
