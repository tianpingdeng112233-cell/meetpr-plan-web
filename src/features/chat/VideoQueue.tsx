import { useEffect, useRef, useState } from 'react'
import type { FeedbackEntry } from '../plan-editor/feedbackModel'
import { fmt, S, resolveLocale } from '../../i18n/strings'

export const videoDate = (entry: FeedbackEntry) => (entry.video.logged_at ?? entry.video.created_at).slice(0, 10)
export const videoName = (entry: FeedbackEntry) => fmt.exerciseName({ name: entry.video.exercise_name || entry.video.filename || S.video.trainingVideo, name_en: entry.video.name_en })
export const videoReference = (entry: FeedbackEntry) => `${entry.inPlan ? `W${String(entry.week).padStart(2, '0')} · D${entry.day} · ` : ''}${videoName(entry)} · ${S.video.setNumber((entry.video.set_index ?? 0) + 1)}`

export function VideoQueue({ entries, activeId, onOpen, onHighlight }: {
  entries: readonly FeedbackEntry[]; activeId?: string | null
  onOpen: (entry: FeedbackEntry) => void; onHighlight?: (entry: FeedbackEntry | null) => void
}) {
  const dates = [...new Set(entries.map(videoDate))].sort()
  const active = entries.find(entry => entry.video.id === activeId)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const leaveTimer = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => () => clearTimeout(leaveTimer.current), [])
  useEffect(() => { if (active) setSelectedDate(videoDate(active)) }, [activeId])
  const date = selectedDate && dates.includes(selectedDate) ? selectedDate : dates.at(-1)
  const index = dates.indexOf(date ?? '')
  const clips = entries.filter(entry => videoDate(entry) === date)
  const pending = entries.filter(entry => entry.video.viewed_at == null).length
  const changeDay = (offset: number) => { setSelectedDate(dates[index + offset]); setExpanded(false) }
  const label = date ? new Date(`${date}T12:00:00`).toLocaleDateString(resolveLocale(), { month: 'long', day: 'numeric', weekday: 'short' }) : ''
  return <section className={`communication-video-queue${expanded ? ' expanded' : ''}`}
    onMouseEnter={() => clearTimeout(leaveTimer.current)}
    onMouseLeave={() => { leaveTimer.current = setTimeout(() => setExpanded(false), 140) }}>
    <h4>{S.block.pendingVideoHeading(pending)}</h4>
    {date ? <>
      <nav className="video-date-pager" aria-label={S.block.feedbackDays}>
        <button type="button" aria-label={S.block.previousVideoDay} disabled={index <= 0} onClick={() => changeDay(-1)}>‹</button>
        <div><b>{label}</b>{clips[0]?.inPlan && <small>W{String(clips[0].week).padStart(2, '0')} · D{clips[0].day}</small>}</div>
        <button type="button" aria-label={S.block.nextVideoDay} disabled={index >= dates.length - 1} onClick={() => changeDay(1)}>›</button>
      </nav>
      <div className="communication-video-list">
        {(expanded ? clips : clips.slice(0, 2)).map(entry => {
          const viewed = entry.video.viewed_at != null
          const selected = entry.video.id === activeId
          return <button type="button" key={entry.video.id} data-feedback-video={entry.video.id}
            className={`${selected ? 'selected ' : ''}${viewed ? 'viewed' : ''}`} aria-pressed={selected}
            onMouseEnter={() => onHighlight?.(entry)} onMouseLeave={() => onHighlight?.(active ?? null)}
            onFocus={() => onHighlight?.(entry)} onClick={() => onOpen(entry)}>
            <i aria-hidden="true">{viewed ? '✓' : '▷'}</i><span><b>{videoName(entry)} <small>{S.video.setNumber((entry.video.set_index ?? 0) + 1)}</small></b>
              <small>{entry.video.weight_kg ?? '—'} kg × {entry.video.reps ?? '—'}</small></span>
            <em>{selected ? `${viewed ? `${S.block.viewed} · ` : ''}${S.block.replying}` : viewed ? S.block.viewed : S.block.toWatch}</em>
          </button>
        })}
      </div>
      <div className="video-date-position">{index + 1} / {dates.length}</div>
      {clips.length > 2 && <button type="button" className="video-queue-expand" aria-expanded={expanded}
        onMouseEnter={() => setExpanded(true)} onClick={() => setExpanded(value => !value)}>
        {expanded ? S.block.collapseVideos : S.block.expandVideos(clips.length)} {expanded ? '⌃' : '⌄'}
      </button>}
    </> : <p>{S.video.noMatching}</p>}
  </section>
}
