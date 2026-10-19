import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { getExerciseStats, getUploadUrl } from '../../../api/coach'
import type { ExerciseHistorySession, ExerciseHistorySet, ExerciseStatsDetail, ExerciseStatsOverview, StudentOnboardingProfile } from '../../../api/types'
import { fmt, S } from '../../../i18n/strings'
import type { ExerciseRow } from '../types'
import { contextRailLevel, historyQuery, historySessions, historyTopSet, metricCells, Profile, RAIL_MODE_KEY } from './ContextRail'
import { kg, shortDate } from '../../workspace/WorkspaceCommon'
import { VideoFrameButtons, VideoSpeedButtons } from '../../workspace/VideoTransport'
import { useGlobalKeyboardHandler } from '../../workspace/globalKeyboard'
import { frameStepTime } from '../../workspace/videoPlayback'

const setLabel = (set: ExerciseHistorySet) => `${kg(set.weight_kg)}×${set.reps}${set.rpe ? ` @${Number(set.rpe)}` : ''}`

const timeLabel = (seconds: number) => {
  const safe = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`
}

function HistoryPlayer({ id, title, anchor, onClose }: { id: string; title: string; anchor: RefObject<HTMLElement>; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [url, setUrl] = useState('')
  const [error, setError] = useState(false)
  const [rate, setRate] = useState(1)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [paused, setPaused] = useState(false)
  const [position, setPosition] = useState({ top: 66, left: 8, width: 405 })
  useLayoutEffect(() => {
    const place = () => {
      const rect = anchor.current?.getBoundingClientRect()
      const top = Math.max(8, Math.min((rect?.top ?? 56) + 10, window.innerHeight - 120))
      const right = Math.max(16, Math.min((rect?.left ?? window.innerWidth) - 8, window.innerWidth - 8))
      const width = Math.max(1, Math.min(405, right - 8, (window.innerHeight - top - 112) * 9 / 16))
      setPosition({ top, left: right - width, width })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true) }
  }, [anchor])
  useGlobalKeyboardHandler(({ event }) => {
    if (event.key !== 'Escape') return false
    event.preventDefault()
    onClose()
    return true
  }, 100)

  useEffect(() => {
    let cancelled = false
    setUrl(''); setError(false); setDuration(0); setRate(1); setCurrentTime(0); setPaused(false)
    void getUploadUrl(id).then(result => { if (!cancelled) setUrl(result.url) }).catch(() => { if (!cancelled) setError(true) })
    return () => { cancelled = true }
  }, [id])
  return <div className="history-player" role="dialog" aria-label={S.video.trainingVideo} style={position}
    onMouseDown={event => {
      if ((event.target as HTMLElement).closest('button')) event.preventDefault()
      event.stopPropagation()
    }}>
    <header><b>{title}</b><button onClick={onClose} aria-label={S.video.closePlayer}><kbd>Esc</kbd> ×</button></header>
    {url ? <video ref={video} src={url} autoPlay playsInline onPlay={() => setPaused(false)} onPause={() => setPaused(true)} onTimeUpdate={() => setCurrentTime(video.current?.currentTime ?? 0)} onError={() => setError(true)} onLoadedMetadata={() => { const duration = video.current?.duration ?? 0; setDuration(Number.isFinite(duration) ? duration : 0); if (video.current) video.current.playbackRate = rate }} /> : <p>{error ? S.video.loadFailed : S.video.gettingLink}</p>}
    {url && error && <p role="alert">{S.video.loadFailed}</p>}
    <input className="history-progress" type="range" aria-label={S.video.progress} min={0} max={duration} step="any" value={currentTime} disabled={!duration}
      onChange={event => { const time = Number(event.target.value); if (video.current) { video.current.currentTime = time; setCurrentTime(time) } }} />
    <div className="history-transport">
      <button type="button" aria-label={paused ? S.video.play : S.video.pause} disabled={!url} onClick={() => {
        if (!video.current) return
        if (video.current.paused) void video.current.play().catch(() => setError(true))
        else video.current.pause()
      }}>{paused ? '▶' : 'Ⅱ'}</button>
      <VideoSpeedButtons compact rate={rate} onRate={value => { setRate(value); if (video.current) video.current.playbackRate = value }} />
      <VideoFrameButtons compact duration={duration} onStep={direction => {
        if (!video.current) return
        const time = frameStepTime(video.current.currentTime, direction, duration)
        if (time != null) { video.current.pause(); video.current.currentTime = time; setCurrentTime(time) }
      }} /><time>{timeLabel(currentTime)} / {timeLabel(duration)}</time></div>
  </div>
}

export function BlockHistory({ studentId, studentName, row, profile, overview, onVideos, onVideoVisibilityChange }: {
  studentId?: string; studentName: string; row: ExerciseRow | null
  profile?: StudentOnboardingProfile | null; overview?: ExerciseStatsOverview | null
  onVideos?: () => void
  onVideoVisibilityChange?: (open: boolean) => void
}) {
  const rail = useRef<HTMLElement>(null)
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
  const [playing, setPlaying] = useState<{ id: string; title: string } | null>(null)
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
    if (focus?.isConnected) focus.focus({ preventScroll: true })
    // Restoring a name input can open its picker; dismiss that after focus so the
    // next Escape reaches the edit card instead of being consumed by the picker.
    onVideoVisibilityChange?.(false)
  }
  const videoButton = (set: ExerciseHistorySet, session: ExerciseHistorySession) => set.has_video || set.video_id ? <button className={isPlaying(set) ? 'playing' : ''} aria-label={set.video_id ? S.block.play : S.block.videos} onClick={() => {
    if (!set.video_id) { onVideos?.(); return }
    onVideoVisibilityChange?.(true)
    setPlaying({ id: set.video_id, title: `${shortDate(session.date)} · ${fmt.exerciseName({ name: row!.name, name_en: row!.nameEn })} · ${S.video.setNumber(set.set_index + 1)} · ${setLabel(set)}` })
  }}>▶</button> : null
  return <><aside ref={rail} data-block-history="" className={`block-history${collapsed ? ' collapsed' : ''}`} onMouseDown={event => {
    const active = document.activeElement
    if (active instanceof HTMLElement && active.closest('.block-cell')) editorFocus.current = active
    // History controls never move the edit caret or invoke block-selection gestures.
    if (!(event.target instanceof HTMLVideoElement)) event.preventDefault()
    event.stopPropagation()
  }}>
    <header><span>{S.block.history}</span><button aria-label={collapsed ? S.block.expand : S.block.collapse} onClick={toggle}>{collapsed ? '‹' : '›'}</button></header>
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
  </aside>
    {playing && !collapsed && <HistoryPlayer {...playing} anchor={rail} onClose={closePlayer} />}
  </>
}
