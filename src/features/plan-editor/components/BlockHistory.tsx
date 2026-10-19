import { useEffect, useRef, useState } from 'react'
import { getExerciseStats } from '../../../api/coach'
import type { ExerciseHistorySession, ExerciseHistorySet, ExerciseStatsDetail, ExerciseStatsOverview, StudentOnboardingProfile, StudentVideo } from '../../../api/types'
import { fmt, S } from '../../../i18n/strings'
import type { ExerciseRow } from '../types'
import { contextRailLevel, historyQuery, historySessions, historyTopSet, metricCells, Profile, RAIL_MODE_KEY } from './ContextRail'
import { kg, shortDate } from '../../workspace/WorkspaceCommon'
import { VideoWorkbench } from '../../workspace/VideoWorkbench'
import type { FeedbackEntry } from '../feedbackModel'
import type { FeedbackSession } from '../feedbackSession'
import { useGlobalKeyboardHandler } from '../../workspace/globalKeyboard'
const noRefresh = async () => {}

const setLabel = (set: ExerciseHistorySet) => `${kg(set.weight_kg)}×${set.reps}${set.rpe ? ` @${Number(set.rpe)}` : ''}`

export function BlockHistory({ studentId, studentName, row, profile, overview, onVideos, onVideoVisibilityChange, videos, entries = [], feedback = null, onFeedbackChange, onHighlight, onVideoViewed, onRefreshVideos }: {
  studentId?: string; studentName: string; row: ExerciseRow | null
  profile?: StudentOnboardingProfile | null; overview?: ExerciseStatsOverview | null
  videos?: StudentVideo[] | null
  entries?: FeedbackEntry[]
  feedback?: FeedbackSession | null
  onFeedbackChange?: (session: FeedbackSession | null) => void
  onHighlight?: (entry: FeedbackEntry | null) => void
  onVideoViewed?: (id: string) => Promise<void>
  onRefreshVideos?: (studentId: string) => Promise<void>
  onVideos?: () => void
  onVideoVisibilityChange?: (open: boolean) => void
}) {
  const rail = useRef<HTMLElement>(null)
  const [sidebar, setSidebar] = useState<HTMLDivElement | null>(null)
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem(RAIL_MODE_KEY) === 'collapsed' } catch { return false } })
  const [ceiling, setCeiling] = useState(4)
  const signature = `${row?.id}:${row?.exerciseId}:${row?.boxes.length}:${row?.reps}`
  const [previous, setPrevious] = useState(signature)
  if (previous !== signature) { setPrevious(signature); setCeiling(4) }
  const query = historyQuery(row, previous === signature ? ceiling : 4)
  const key = query && studentId ? JSON.stringify([studentId, query]) : ''
  // Cache both completed and in-flight queries for the whole mounted page session.
  const cache = useRef(new Map<string, Promise<ExerciseStatsDetail>>())
  const [result, setResult] = useState<{ key: string; detail?: ExerciseStatsDetail; failed?: boolean }>({ key: '' })
  const [retry, setRetry] = useState(0)
  const [playing, setPlaying] = useState<{ id: string; title: string; video: StudentVideo } | null>(null)
  const editorFocus = useRef<HTMLElement | null>(null)
  const detail = result.key === key ? result.detail : undefined
  useEffect(() => {
    if (!query || !studentId) return
    let cancelled = false
    let request = cache.current.get(key)
    if (!request) { request = getExerciseStats(studentId, query.exerciseId, query); cache.current.set(key, request) }
    request.then(detail => { if (!cancelled) setResult({ key, detail }) }).catch(() => {
      cache.current.delete(key)
      if (!cancelled) setResult({ key, failed: true })
    })
    return () => { cancelled = true }
  }, [key, retry]) // key includes every query parameter
  const toggle = () => {
    if (!collapsed && playing) closePlayer()
    try { localStorage.setItem(RAIL_MODE_KEY, !collapsed ? 'collapsed' : 'expanded') } catch { /* preference remains usable for this session */ }
    setCollapsed(!collapsed)
  }
  const level = Math.min(contextRailLevel(row), ceiling)
  const { sessions, degraded } = detail && query ? historySessions(detail, query) : { sessions: [], degraded: false }
  const scope = query?.sets ? `${query.sets}${query.reps ? `×${query.reps}` : ''}` : ''
  const isPlaying = (set: ExerciseHistorySet) => !!playing && set.video_id === playing.id
  const closePlayer = () => {
    const active = document.activeElement
    const focus = active instanceof HTMLElement && active.closest('.block-cell') ? active : editorFocus.current
    setPlaying(null)
    if (feedback) onFeedbackChange?.({ ...feedback, playerOpen: false })
    if (focus?.isConnected) focus.focus({ preventScroll: true })
    // Restoring a name input can open its picker; dismiss that after focus so the
    // next Escape reaches the edit card instead of being consumed by the picker.
    onVideoVisibilityChange?.(false)
  }
  const videoButton = (set: ExerciseHistorySet, session: ExerciseHistorySession) => set.has_video || set.video_id ? <button className={isPlaying(set) ? 'playing' : ''} aria-label={set.video_id ? S.block.play : S.block.videos} onClick={() => {
    if (!set.video_id) { onVideos?.(); return }
    onVideoVisibilityChange?.(true)
    setPlaying({ id: set.video_id, video: videos?.find(video => video.id === set.video_id) ?? { id: set.video_id, set_log_id: null, plan_exercise_id: row?.serverRowId ?? null, content_type: 'video/mp4', size_bytes: 0, filename: '', created_at: session.date, logged_at: session.date, exercise_name: row?.name, set_index: set.set_index, weight_kg: set.weight_kg, reps: set.reps, rpe: set.rpe }, title: `${shortDate(session.date)} · ${fmt.exerciseName({ name: row!.name, name_en: row!.nameEn })} · ${S.video.setNumber(set.set_index + 1)} · ${setLabel(set)}` })
  }}>▶</button> : null
  const activeEntry = entries.find(entry => entry.video.id === feedback?.videoId)
  const activeVideo = activeEntry?.video
  const visibleEntries = entries.filter(entry => feedback?.includeViewed || entry.video.viewed_at == null)
  const visibleIndex = visibleEntries.findIndex(entry => entry.video.id === feedback?.videoId)
  const pending = entries.filter(entry => entry.video.viewed_at == null).length
  const openEntry = (entry?: FeedbackEntry) => {
    if (document.activeElement && rail.current?.contains(document.activeElement)) rail.current.focus({ preventScroll: true })
    onFeedbackChange?.({ videoId: entry?.video.id ?? null, playerOpen: !!entry, includeViewed: feedback?.includeViewed ?? false })
  }
  const exitFeedback = () => {
    onFeedbackChange?.(null); onHighlight?.(null)
    if (document.activeElement instanceof HTMLElement && rail.current?.contains(document.activeElement)) document.activeElement.blur()
    if (editorFocus.current?.isConnected) editorFocus.current.focus({ preventScroll: true })
    onVideoVisibilityChange?.(false)
  }
  useEffect(() => { if (feedback) setPlaying(null) }, [!!feedback])
  useEffect(() => { onHighlight?.(feedback ? activeEntry ?? null : null) }, [feedback?.videoId, activeEntry?.rowId, activeEntry?.dayId])
  useEffect(() => { onVideoVisibilityChange?.(!!(feedback?.playerOpen && activeVideo) || !!playing) }, [feedback?.playerOpen, activeVideo?.id, playing?.id])
  useGlobalKeyboardHandler(({ event, editable }) => {
    if (event.key === 'Escape') {
      if (feedback && editable && event.target instanceof HTMLElement && event.target.closest('.feedback-workbench,.history-player')) {
        event.preventDefault(); event.target.blur(); rail.current?.focus({ preventScroll: true }); return true
      }
      if ((feedback?.playerOpen && activeVideo) || playing) { event.preventDefault(); closePlayer(); return true }
      if (feedback) { event.preventDefault(); exitFeedback(); return true }
      return false
    }
    if (!feedback || editable || event.metaKey || event.ctrlKey || event.altKey || !(event.target instanceof Node && rail.current?.contains(event.target))) return false
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return false
    event.preventDefault()
    const index = entries.findIndex(entry => entry.video.id === feedback.videoId)
    const candidates = event.key === 'ArrowLeft' ? entries.slice(0, index < 0 ? entries.length : index).reverse() : entries.slice(index + 1)
    const next = candidates.find(entry => feedback.includeViewed || entry.video.viewed_at == null)
    if (next) openEntry(next)
    return true
  }, 100)
  const entryName = (entry: FeedbackEntry) => fmt.exerciseName({ name: entry.video.exercise_name || entry.video.filename || S.video.trainingVideo, name_en: entry.video.name_en })
  const entryPlace = (entry: FeedbackEntry) => entry.inPlan ? `W${entry.week} · D${entry.day}` : shortDate(entry.video.logged_at ?? entry.video.created_at)
  const title = activeEntry ? `${entryPlace(activeEntry)} · ${entryName(activeEntry)} · ${S.video.setNumber((activeVideo?.set_index ?? 0) + 1)} ${activeVideo?.weight_kg != null ? kg(activeVideo.weight_kg) : '—'}×${activeVideo?.reps ?? '—'}${activeVideo?.rpe ? ` @${Number(activeVideo.rpe)}` : ''}` : ''
  const currentPlayer = feedback ? activeVideo ? { video: activeVideo, title } : null : playing
  return <><aside ref={rail} data-block-history="" data-feedback-mode={feedback ? "" : undefined} tabIndex={-1} className={`block-history${collapsed && !feedback ? ' collapsed' : ''}`} onMouseDown={event => {
    const active = document.activeElement
    if (active instanceof HTMLElement && active.closest('.block-cell')) editorFocus.current = active
    // History controls never move the edit caret or invoke block-selection gestures.
    if (!feedback && !(event.target instanceof HTMLVideoElement)) event.preventDefault()
    event.stopPropagation()
  }}>
    {feedback ? <>
      <header className="feedback-head"><button onClick={exitFeedback}>{S.block.backHistory}</button><b>{S.block.pendingVideos(pending)}</b><label><input type="checkbox" checked={feedback.includeViewed} onChange={event => onFeedbackChange?.({ ...feedback, includeViewed: event.target.checked })} />{S.block.includeViewed}</label></header>
      {videos === null ? <p>{S.block.videosFailed} <button onClick={() => { if (studentId) void onRefreshVideos?.(studentId) }}>{S.common.retry}</button></p> : <div className="feedback-queue" tabIndex={0}>
        {[true, false].map(inPlan => <section key={String(inPlan)}>
          {!inPlan && visibleEntries.some(entry => !entry.inPlan) && <h4>{S.block.outsidePlan}</h4>}
          {visibleEntries.filter(entry => entry.inPlan === inPlan).map(entry => <button key={entry.video.id} data-feedback-video={entry.video.id}
            className={`${entry.video.id === feedback.videoId ? 'selected' : ''}${entry.video.viewed_at != null ? ' viewed' : ''}`}
            onMouseEnter={() => onHighlight?.(entry)} onMouseLeave={() => onHighlight?.(activeEntry ?? null)}
            onFocus={() => onHighlight?.(entry)} onClick={() => openEntry(entry)}>
            <time>{entryPlace(entry)}</time><span>{entryName(entry)}{entry.addedExerciseId && <small> · {S.block.added}</small>}{!inPlan && entry.video.plan_exercise_id && <small> · {S.block.previousBlock}</small>}</span><small>{S.video.setNumber((entry.video.set_index ?? 0) + 1)}</small>
          </button>)}
        </section>)}
      </div>}
      <div ref={setSidebar} className="feedback-sidebar" />
    </> : <>
    <header><span>{S.block.history}</span>{!collapsed && onFeedbackChange && (videos === null ? <button className="pending-entry" onClick={() => { if (studentId) void onRefreshVideos?.(studentId) }}>{S.block.videosFailed} · {S.common.retry}</button> : <button className="pending-entry" onClick={() => openEntry(entries.find(entry => entry.video.viewed_at == null))}>▶ {S.block.pendingVideos(pending)}</button>)}<button aria-label={collapsed ? S.block.expand : S.block.collapse} onClick={toggle}>{collapsed ? '‹' : '›'}</button></header>
    {!collapsed && <div className="block-history-body">
      {!query ? <><h3>{studentName}</h3><Profile profile={profile} compact />
        <div className="history-metrics">{metricCells({ level: 1, profile, detail: null, overview, reps: 0, weight: null }).map(cell => <div key={cell.label}><b>{cell.value}</b><small>{cell.label}</small></div>)}</div>
        <p>{S.block.historyHint}</p></> : <>
        <nav aria-label={S.block.history} className="history-breadcrumbs">
          <button className={level === 2 ? 'current' : ''} onClick={() => setCeiling(2)}>{fmt.exerciseName({ name: row!.name, name_en: row!.nameEn })}</button>
          {contextRailLevel(row) >= 3 && <><span>›</span><button className={level === 3 ? 'current' : ''} onClick={() => setCeiling(3)}>{S.common.countSets(row!.boxes.length)}</button></>}
          {contextRailLevel(row) >= 4 && <><span>›</span><button className={level === 4 ? 'current' : ''} onClick={() => setCeiling(4)}>{S.block.reps(Number(row!.reps))}</button></>}
        </nav>
        <h3>{degraded ? S.block.recent : `${scope ? `${scope} · ` : ''}${S.block.recent}`} {detail?.e1rm && <small>e1RM {kg(detail.e1rm.value)}</small>}</h3>
        {degraded && <p>{S.block.degraded}</p>}
        {!detail && <p>{result.key === key && result.failed ? <>{S.stats.context.recordsFailed} <button onClick={() => setRetry(value => value + 1)}>{S.common.retry}</button></> : S.stats.context.recordsLoading}</p>}
        {detail && sessions.length === 0 && <p>{S.block.noRecords(degraded ? '' : scope)}{level > 2 && <button onClick={() => setCeiling(level - 1)}>{S.block.back}</button>}</p>}
        {sessions.map((session, index) => {
          const top = historyTopSet(session.sets)
          const withVideo = session.sets.find(set => set.video_id || set.has_video)
          return <details className={`history-session${session.sets.some(isPlaying) ? ' is-playing' : ''}`} key={`${key}:${session.date}:${index}`}>
            <summary><span>{shortDate(session.date)} · {session.prescribed ? `${session.prescribed.sets}×${session.prescribed.reps}` : `${session.sets.length}×${session.sets[0]?.reps ?? '—'}`} · {S.block.top} <b>{top ? setLabel(top) : '—'}</b></span>{withVideo && videoButton(withVideo, session)}</summary>
            {session.sets.map((set, i) => <div className={`history-set${isPlaying(set) ? ' is-playing' : ''}${set.failed ? ' failed' : !set.completed ? ' incomplete' : ''}`} key={`${set.set_index}:${i}`}><span>{set.set_index + 1}</span><b>{setLabel(set)}</b><span>{set.failed ? S.common.failure : set.completed ? '✓' : '—'}</span>{videoButton(set, session)}</div>)}
          </details>
        })}
      </>}
    </div>}
    </>}
  </aside>
    {currentPlayer && (!collapsed || feedback) && <VideoWorkbench studentId={studentId ?? ''} videos={videos} onRefreshVideos={onRefreshVideos ?? noRefresh}
      embedded={{ ...currentPlayer, playerOpen: feedback ? feedback.playerOpen : true, anchor: rail, onClose: closePlayer, onVideoViewed, sidebar: feedback ? sidebar : null, studentName,
        positionLabel: feedback && visibleIndex >= 0 ? `${visibleIndex + 1} / ${visibleEntries.length}` : undefined }} /> }
  </>
}
