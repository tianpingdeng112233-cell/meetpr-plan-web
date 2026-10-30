import { useEffect, useRef, useState } from 'react'
import { postCoachFeedback } from '../../../api/coach'
import type { CoachFeedbackResponse } from '../../../api/types'
import { fmt, resolveLocale, S } from '../../../i18n/strings'
import type { DayFeedbackDetail, FeedbackDay } from '../feedbackModel'

export const feedbackDayPlace = (day: FeedbackDay) => `W${day.week} · D${day.day}`
export const feedbackDayDate = (day: FeedbackDay) => day.date && day.weekday != null ? `${S.common.weekdaysMondayFirst[day.weekday]} ${Number(day.date.slice(5, 7))}/${Number(day.date.slice(8, 10))}` : '—'
export const feedbackSource = (item: DayFeedbackDetail) => item.source === 'day' ? S.block.wholeDay
  : [item.exerciseName ? fmt.exerciseName({ name: item.exerciseName, name_en: item.exerciseNameEn }) : S.common.unnamed,
    item.setIndex == null ? null : S.video.setNumber(item.setIndex + 1)].filter(Boolean).join(' ')
const feedbackTime = (date: string) => new Date(date).toLocaleString(resolveLocale() === 'en' ? 'en-GB' : 'zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
export function FeedbackBubble() {
  return <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true"><path d="M3 2h10v8H7l-4 3V2Z" /></svg>
}
export function DayFeedbackMarker({ day, onOpen }: { day?: FeedbackDay; onOpen: (day: FeedbackDay) => void }) {
  if (!day?.feedback.length) return null
  return <span className="day-feedback-marker-wrap" onMouseDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
    <button type="button" className="day-feedback-marker" data-day-feedback-marker={day.dayId} onClick={() => onOpen(day)}>
      <FeedbackBubble />{S.block.feedbackBadge(day.feedback.length)}
    </button>
    <span role="tooltip" className="day-feedback-tooltip"><b>{S.block.dayFeedbackHint(`${feedbackDayPlace(day)} ${day.weekday == null ? '' : S.common.weekdaysMondayFirst[day.weekday]}`, day.feedback.length)}</b>
      {day.feedback.map(item => <span key={item.feedback.id}><small>{feedbackTime(item.feedback.posted_at)} · {feedbackSource(item)}</small><span>{item.feedback.text}</span></span>)}
    </span>
  </span>
}

export function DayFeedbackDetail({ day, studentId, onSent, datesFailed, onRetryDates }: { datesFailed?: boolean; onRetryDates?: () => void; day: FeedbackDay; studentId: string; onSent: (item: CoachFeedbackResponse) => void }) {
  const [text, setText] = useState('')
  const draft = useRef('')
  const sending = useRef(false)
  const mounted = useRef(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const send = async () => {
    const submitted = draft.current
    if (!day.date || sending.current || !submitted.trim() || submitted.trim().length > 2000) return
    sending.current = true; setBusy(true); setError(false)
    try {
      const result = await postCoachFeedback({ student_id: studentId, day_date: day.date, plan_exercise_id: null, video_id: null, text: submitted.trim() })
      onSent(result)
      if (mounted.current && draft.current === submitted) { draft.current = ''; setText('') }
    } catch { if (mounted.current) setError(true) }
    finally { sending.current = false; if (mounted.current) setBusy(false) }
  }
  return <section className="day-feedback-detail feedback-workbench">
    <h4>{S.block.dayFeedback} · {feedbackDayPlace(day)} {feedbackDayDate(day)}</h4>
    <div className="day-feedback-cards">{day.feedback.map(item => <article key={item.feedback.id}>
      <header><span>{feedbackTime(item.feedback.posted_at)} · {feedbackSource(item)}</span><small>{item.feedback.read_at ? S.block.feedbackRead : S.block.feedbackUnread}</small></header>
      <p>{item.feedback.text}</p>
    </article>)}</div>
    {!day.date && <p role="status">{S.block.trainingDateUnavailable}{datesFailed && <button onClick={onRetryDates}>{S.common.retry}</button>}</p>}
    <textarea disabled={!day.date} aria-label={S.block.dayFeedback} value={text} maxLength={2000} placeholder={S.block.dayFeedbackPlaceholder(feedbackDayPlace(day))}
      onChange={event => { draft.current = event.target.value; setText(event.target.value); setError(false) }}
      onKeyDown={event => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.nativeEvent.isComposing) { event.preventDefault(); void send() } }} />
    <footer>{error && <p role="alert">{S.video.feedbackFailed}</p>}<button disabled={!day.date || busy || !text.trim()} onClick={() => void send()}>{busy ? S.video.sending : S.video.sendFeedback} <small>⌘↵</small></button></footer>
  </section>
}
