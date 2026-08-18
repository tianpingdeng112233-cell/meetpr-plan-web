import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ApiException } from '../../api/client'
import { openConversation } from '../../api/chat'
import { getUploadUrl, patchCoachRpe, postCoachFeedback } from '../../api/coach'
import { createVideoMarker, deleteVideoMarker, getVideoMarkers, markVideoViewed } from '../../api/markers'
import { abortChatImage, sendChatImage, type ChatImageSendSession } from '../../api/uploads'
import type { ChatConversation, StudentVideo, VideoMarker } from '../../api/types'
import { chatOutbox } from '../chat/chatOutbox'
import { newClientId } from '../chat/chatModel'
import { kg } from './WorkspaceCommon'
import {
  annotationLineWidth,
  drawTimeBadge,
  beginStroke,
  clearStrokes,
  commitStroke,
  displayPointToFrame,
  drawAnnotationStrokes,
  moveStroke,
  undoStroke,
  type AnnotationStroke,
  type AnnotationTool,
} from './annotationDrawing'
import { usePersistentCollapse } from './usePersistentCollapse'
import { useGlobalKeyboardHandler } from './globalKeyboard'
import { frameStepTime, precisionScrubTime, PRECISION_SCRUB_THRESHOLD_PX, VIDEO_SPEEDS } from './videoPlayback'
import { fmt, S } from '../../i18n/strings'

type VideoFilter = 'all' | 'pending' | 'reviewed'
type MarkerAvailability = 'loading' | 'available' | 'error' | 'unavailable'

const coachRpeOptions = Array.from({ length: 11 }, (_, index) => 5 + index * 0.5)

const videoDay = (video: Pick<StudentVideo, 'logged_at' | 'created_at'>) =>
  (video.logged_at ?? video.created_at).slice(0, 10)
const compactDayLabel = (day: string, zhSeparator = '-') => {
  const [year, month, date] = day.slice(0, 10).split('-').map(Number)
  return fmt.monthDay(new Date(year, month - 1, date), () => `${String(month).padStart(2, '0')}${zhSeparator}${String(date).padStart(2, '0')}`)
}
const dayLabel = (day: string) => {
  const [year, month, date] = day.split('-').map(Number)
  const parsed = new Date(year, month - 1, date)
  return `${compactDayLabel(day)} ${S.common.weekdaysSundayFirst[parsed.getDay()]}`
}
const setLabel = (index: number | null | undefined) => index == null ? null : S.video.setNumber(index + 1)
const statusLabel = (video: StudentVideo) => video.viewed_at == null ? S.video.pending : S.video.reviewed
const loadLabel = (video: StudentVideo) => (
  video.weight_kg != null && video.reps != null
    ? `${kg(video.weight_kg)}kg × ${video.reps}`
    : video.weight_kg != null
      ? `${kg(video.weight_kg)}kg`
      : video.reps != null ? S.video.repCount(video.reps) : ''
)
const videoTitle = (video: StudentVideo) =>
  [fmt.exerciseName({
    name: video.exercise_name || video.filename || S.video.trainingVideo,
    name_en: video.name_en,
  }), loadLabel(video)].filter(Boolean).join(' ')
const size = (bytes: number) => bytes < 1024 * 1024
  ? `${Math.round(bytes / 1024)} KB`
  : `${(bytes / 1024 / 1024).toFixed(1)} MB`
const timeLabel = (seconds: number) => {
  const safe = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`
}
const releaseVideo = (video: HTMLVideoElement | null) => {
  if (!video) return
  video.pause()
  video.removeAttribute('src')
  video.load()
}
const toast = (message: string) => {
  window.dispatchEvent(new CustomEvent('meetpr:toast', { detail: message }))
}
const isSecurityError = (error: unknown) => (
  error instanceof DOMException && error.name === 'SecurityError'
)

export const moveVideoIndex = (index: number, direction: -1 | 1, total: number) =>
  Math.max(0, Math.min(total - 1, index + direction))

export const markerPositionPercent = (timeMs: number, durationSeconds: number) => {
  if (!Number.isFinite(timeMs) || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0
  return Math.max(0, Math.min(100, timeMs / (durationSeconds * 1000) * 100))
}

export const videoAssociation = (video: {
  logged_at: string | null
  created_at: string | null
  exercise_name?: string | null
  name_en?: string | null
  set_index?: number | null
}) => {
  const day = video.logged_at ?? video.created_at
  return [
    day ? compactDayLabel(day, '/') : null,
    video.exercise_name ? fmt.exerciseName({ name: video.exercise_name, name_en: video.name_en }) : null,
    setLabel(video.set_index),
  ].filter(Boolean).join(' · ')
}

export interface VideoTarget {
  requestId: number
  setLogId: string | null
  dayDate: string
  exerciseName: string
  setIndex: number
}

export function VideosPage({
  studentId,
  videos,
  onRefreshVideos,
  conversation = null,
  onConversationOpened,
  target,
  onDetailOpenChange,
}: {
  studentId: string
  videos: StudentVideo[]
  onRefreshVideos: (studentId: string) => Promise<void>
  conversation?: ChatConversation | null
  onConversationOpened?: (conversation: ChatConversation) => void
  target?: VideoTarget | null
  onDetailOpenChange?: (open: boolean) => void
}) {
  const [masterCollapsed, toggleMaster] = usePersistentCollapse('meetpr:sidebar:videos')
  const [filter, setFilter] = useState<VideoFilter>('all')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [videoSource, setVideoSource] = useState<{ videoId: string; url: string } | null>(null)
  const [rate, setRate] = useState(1)
  const [playbackError, setPlaybackError] = useState('')
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [crossOriginEnabled, setCrossOriginEnabled] = useState(true)
  const [annotateUnavailable, setAnnotateUnavailable] = useState(false)
  const [annotationOpen, setAnnotationOpen] = useState(false)
  const [annotationTool, setAnnotationTool] = useState<AnnotationTool>('freehand')
  const [annotationStrokes, setAnnotationStrokes] = useState<AnnotationStroke[]>([])
  const [activeStroke, setActiveStroke] = useState<AnnotationStroke | null>(null)
  const [annotationSending, setAnnotationSending] = useState(false)
  const [annotationNote, setAnnotationNote] = useState('')
  const [feedback, setFeedback] = useState('')
  const [feedbackState, setFeedbackState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [feedbackError, setFeedbackError] = useState('')
  const [coachRpe, setCoachRpe] = useState<string | null>(null)
  const [coachRpeSaving, setCoachRpeSaving] = useState(false)
  const [coachRpeError, setCoachRpeError] = useState('')
  const [markerAvailability, setMarkerAvailability] = useState<MarkerAvailability>('loading')
  const [markers, setMarkers] = useState<VideoMarker[]>([])
  const [markerOpen, setMarkerOpen] = useState(false)
  const [markerNote, setMarkerNote] = useState('')
  const [markerSaving, setMarkerSaving] = useState(false)
  const [markerError, setMarkerError] = useState('')
  const [deletingMarkerIds, setDeletingMarkerIds] = useState<ReadonlySet<string>>(new Set())
  const [viewingAnnotation, setViewingAnnotation] = useState<VideoMarker | null>(null)

  const retried = useRef(false)
  const crossOriginRetried = useRef(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const annotationCanvasRef = useRef<HTMLCanvasElement>(null)
  const annotationFrameSize = useRef<{ width: number; height: number } | null>(null)
  // One freeze per send-attempt family: retries must resend EXACTLY the
  // image the coach saw when they hit send (the upload session records
  // etag/size against it). Editing strokes discards it via
  // invalidateAnnotationUpload; moving the playhead alone does not.
  const annotationExport = useRef<{ blob: Blob; timeMs: number; generation: number } | null>(null)
  const annotationPointer = useRef<number | null>(null)
  const annotationSession = useRef<ChatImageSendSession | null>(null)
  const annotationGeneration = useRef(0)
  const sendingSessionRef = useRef<ChatImageSendSession | null>(null)
  // Any stroke change after a failed send: the recorded upload no longer
  // matches the canvas — drop it (keeping the clientId) so the retry
  // uploads the current image instead of resending the stale attachment.
  const invalidateAnnotationUpload = () => {
    annotationExport.current = null
    const session = annotationSession.current
    if (!session || !session.attachmentId) return
    abortChatImage(session)
    annotationSession.current = { clientId: session.clientId }
  }
  // Unified abandon: every path that walks away from the annotation layer
  // (close, video switch, unmount, CORS degrade) funnels here. A session
  // that is mid-send is left to its own request: on success it publishes,
  // on generation-mismatch failure it aborts itself.
  const abandonAnnotationSession = () => {
    annotationExport.current = null
    annotationGeneration.current += 1
    const session = annotationSession.current
    if (session && session !== sendingSessionRef.current) abortChatImage(session)
    annotationSession.current = null
  }
  const urlRequest = useRef(0)
  const markerRequest = useRef(0)
  const feedbackRequest = useRef(0)
  const coachRpeRequest = useRef(0)
  const sentTimer = useRef<number>()
  const draftRef = useRef('')
  const activeVideoIdRef = useRef<string | null>(null)
  const handledTargetRequest = useRef<number | null>(null)
  const viewedRequests = useRef<Set<string>>(new Set())

  const writeFeedback = (value: string) => {
    draftRef.current = value
    setFeedback(value)
  }
  const refreshVideos = useCallback(async () => {
    if (!studentId) return
    try {
      await onRefreshVideos(studentId)
    } catch {
      // Preserve the last authoritative array when the refresh fails.
    }
  }, [onRefreshVideos, studentId])

  useEffect(() => {
    setActiveId(null)
    urlRequest.current += 1
    markerRequest.current += 1
    feedbackRequest.current += 1
    coachRpeRequest.current += 1
    void refreshVideos()
  }, [refreshVideos])

  const counts = useMemo(() => ({
    all: videos.length,
    pending: videos.filter((video) => video.viewed_at == null).length,
    reviewed: videos.filter((video) => video.viewed_at != null).length,
  }), [videos])
  const visibleVideos = useMemo(() => videos.filter((video) => (
    filter === 'all'
    || (filter === 'pending' && video.viewed_at == null)
    || (filter === 'reviewed' && video.viewed_at != null)
  )), [filter, videos])
  const selectedId = visibleVideos.some((video) => video.id === activeId)
    ? activeId
    : null
  const activeIndex = visibleVideos.findIndex((video) => video.id === selectedId)
  const active = activeIndex < 0 ? null : visibleVideos[activeIndex] ?? null
  const url = videoSource && videoSource.videoId === active?.id ? videoSource.url : ''
  activeVideoIdRef.current = active?.id ?? null
  const detailOpen = active != null
  useLayoutEffect(() => { onDetailOpenChange?.(detailOpen) }, [detailOpen, onDetailOpenChange])
  useEffect(() => {
    if (activeId != null && !visibleVideos.some((video) => video.id === activeId)) {
      setActiveId(null)
    }
  }, [activeId, visibleVideos])
  const trainingDays = useMemo(() => new Set(videos.map(videoDay)).size, [videos])
  const grouped = useMemo(() => {
    const groups = new Map<string, StudentVideo[]>()
    visibleVideos.forEach((video) => {
      const day = videoDay(video)
      const rows = groups.get(day)
      if (rows) rows.push(video)
      else groups.set(day, [video])
    })
    return [...groups.entries()]
  }, [visibleVideos])

  useEffect(() => {
    if (!target || handledTargetRequest.current === target.requestId) return
    // A non-null set_log_id must match exactly: falling back to the
    // day/exercise/set-index triple could land on a different upload of the
    // same set. The triple fallback exists only for legacy refs without an id.
    const matched = target.setLogId != null
      ? videos.find((video) => video.set_log_id === target.setLogId)
      : videos.find((video) => (
          videoDay(video) === target.dayDate
          && video.exercise_name === target.exerciseName
          && video.set_index === target.setIndex
        ))
    if (!matched) return
    handledTargetRequest.current = target.requestId
    setFilter('all')
    setActiveId(matched.id)
  }, [target?.requestId, videos])

  const resetFeedback = useCallback(() => {
    feedbackRequest.current += 1
    if (sentTimer.current != null) window.clearTimeout(sentTimer.current)
    writeFeedback('')
    setFeedbackState('idle')
    setFeedbackError('')
  }, [])

  useEffect(() => {
    const request = ++urlRequest.current
    retried.current = false
    crossOriginRetried.current = false
    setVideoSource(null)
    setRate(1)
    setPlaybackError('')
    setPlaying(false)
    setCurrentTime(0)
    setDuration(0)
    setCrossOriginEnabled(true)
    setAnnotateUnavailable(false)
    setAnnotationOpen(false)
    setViewingAnnotation(null)
    setAnnotationTool('freehand')
    setAnnotationStrokes([])
    setActiveStroke(null)
    abandonAnnotationSession()
    setAnnotationSending(false)
    annotationPointer.current = null
    resetFeedback()
    if (!active) return
    void getUploadUrl(active.id)
      .then((signed) => {
        if (request === urlRequest.current) setVideoSource({ videoId: active.id, url: signed.url })
      })
      .catch(() => { if (request === urlRequest.current) setPlaybackError(S.video.linkFailed) })
  }, [active?.id, resetFeedback])

  useEffect(() => {
    const request = ++markerRequest.current
    setMarkerAvailability('loading')
    setMarkers([])
    setMarkerOpen(false)
    setMarkerNote('')
    setMarkerSaving(false)
    setMarkerError('')
    if (!active) {
      setMarkerAvailability('unavailable')
      return
    }
    void getVideoMarkers(active.id)
      .then((next) => {
        if (request !== markerRequest.current) return
        setMarkers([...next].sort((left, right) => left.time_ms - right.time_ms))
        setMarkerAvailability('available')
      })
      .catch((error: unknown) => {
        if (request !== markerRequest.current) return
        const canDegrade = !(error instanceof ApiException) || error.status === 404
        setMarkerAvailability(canDegrade ? 'unavailable' : 'error')
        setMarkers([])
      })
  }, [active?.id])

  // Reset only on video identity change. Same-video refreshes (e.g. the
  // refreshVideos() a save triggers) must NOT bump the request counter, or
  // they would invalidate an in-flight second save on the same video; for a
  // given video the PATCH response is the authority on coach_rpe.
  useEffect(() => {
    coachRpeRequest.current += 1
    setCoachRpe(active?.coach_rpe ?? null)
    setCoachRpeSaving(false)
    setCoachRpeError('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id])

  // The <video> is keyed by active video id, so switching swaps elements; we
  // release the outgoing element here. A same-video URL renewal keeps the
  // element (and this effect must NOT release it — that was a regression that
  // cleared the freshly renewed src).
  const prevVideoNode = useRef<HTMLVideoElement | null>(null)
  useLayoutEffect(() => {
    const previous = prevVideoNode.current
    if (previous && previous !== videoRef.current) releaseVideo(previous)
    prevVideoNode.current = videoRef.current
  })
  useLayoutEffect(() => () => releaseVideo(videoRef.current), [])

  useEffect(() => {
    const video = videoRef.current
    if (video) video.playbackRate = rate
  }, [rate, url])

  const pickVideo = (video: StudentVideo) => setActiveId(video.id)
  const move = useCallback((direction: -1 | 1) => {
    if (activeIndex < 0) return
    const next = moveVideoIndex(activeIndex, direction, visibleVideos.length)
    if (next !== activeIndex) setActiveId(visibleVideos[next]?.id ?? null)
  }, [activeIndex, visibleVideos])

  useGlobalKeyboardHandler(({ event, editable, video }) => {
      if (event.key === 'Escape' && markerOpen) {
        event.preventDefault()
        setMarkerOpen(false)
        setMarkerError('')
        return true
      }
      if (editable || video || event.metaKey || event.ctrlKey || event.altKey) return false
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault()
        if (active == null) setActiveId(visibleVideos[0]?.id ?? null)
        else move(event.key === 'ArrowLeft' ? -1 : 1)
        return true
      } else if (event.key === ' ' || event.key === 'Spacebar') {
        event.preventDefault()
        togglePlayback()
        return true
      } else if (event.key === ',' || event.key === '.') {
        event.preventDefault()
        stepFrame(event.key === ',' ? -1 : 1)
        return true
      }
      return false
  }, 10)

  // Live-layer annotation keeps the whole transport usable — including
  // space/arrow shortcuts. Only Esc is intercepted to close the layer
  // (unless a send is in flight); typed input is already covered by the
  // dispatcher's editable guard.
  useGlobalKeyboardHandler(({ event }) => {
    if (!annotationOpen || event.key !== 'Escape') return false
    event.preventDefault()
    if (!annotationSending) closeAnnotation()
    return true
  }, 1000)

  useEffect(() => () => {
    if (sentTimer.current != null) window.clearTimeout(sentTimer.current)
    abandonAnnotationSession()
  }, [])

  const playbackFailed = () => {
    if (crossOriginEnabled && !crossOriginRetried.current) {
      crossOriginRetried.current = true
      setCrossOriginEnabled(false)
      setAnnotateUnavailable(true)
      setAnnotationOpen(false)
      abandonAnnotationSession()
      return
    }
    if (!active || retried.current) {
      setVideoSource(null)
      setPlaybackError(S.video.playbackFailed)
      return
    }
    retried.current = true
    const request = ++urlRequest.current
    void getUploadUrl(active.id)
      .then((signed) => {
        if (request !== urlRequest.current) return
        setPlaybackError('')
        setVideoSource({ videoId: active.id, url: signed.url })
      })
      .catch(() => {
        if (request !== urlRequest.current) return
        // Drop the dead URL so the broken <video> unmounts and the error text
        // actually becomes visible instead of hiding behind a black frame.
        setVideoSource(null)
        setPlaybackError(S.video.renewFailed)
      })
  }

  const togglePlayback = () => {
    // The passive annotation viewer yields to playback; the live-layer
    // editor does not restrict the transport at all.
    if (viewingAnnotation) setViewingAnnotation(null)
    const video = videoRef.current
    if (!video) return
    if (video.paused) void video.play()
    else video.pause()
  }
  const handleTimeUpdate = (video: HTMLVideoElement) => {
    const nextTime = video.currentTime
    setCurrentTime(nextTime)
    if (
      !active
      || active.viewed_at != null
      || viewedRequests.current.has(active.id)
      || !Number.isFinite(nextTime)
      || !Number.isFinite(video.duration)
      || video.duration <= 0
      || nextTime < video.duration / 2
    ) return

    const videoId = active.id
    viewedRequests.current.add(videoId)
    void markVideoViewed(videoId)
      .then(() => { void refreshVideos() })
      .catch(() => { viewedRequests.current.delete(videoId) })
  }
  const seekTo = (seconds: number) => {
    const video = videoRef.current
    if (!video || !Number.isFinite(seconds)) return
    const next = Math.max(0, Math.min(duration || video.duration || seconds, seconds))
    video.currentTime = next
    setCurrentTime(next)
  }
  const stepFrame = (direction: -1 | 1) => {
    const video = videoRef.current
    if (!video) return
    const next = frameStepTime(video.currentTime, direction, duration || video.duration)
    if (next == null) return
    // Stepping means "stay paused": an in-flight scrub must not resume
    // playback on release after the coach has stepped to a frame.
    if (scrubState.current) scrubState.current.wasPlaying = false
    video.pause()
    seekTo(next)
  }
  const scrubState = useRef<{
    pointerId: number
    wasPlaying: boolean
    fine?: { anchorX: number; anchorTime: number }
  } | null>(null)
  const [scrubFine, setScrubFine] = useState(false)
  const [scrubbing, setScrubbing] = useState(false)
  const seekToClientX = (element: HTMLElement, clientX: number) => {
    if (duration <= 0) return
    const rect = element.getBoundingClientRect()
    if (rect.width <= 0) return
    seekTo((clientX - rect.left) / rect.width * duration)
  }
  const beginScrub = (event: React.PointerEvent<HTMLButtonElement>) => {
    // Single active pointer: a second finger must not hijack the gesture.
    if (duration <= 0 || scrubState.current != null) return
    const video = videoRef.current
    event.currentTarget.setPointerCapture(event.pointerId)
    // Pause while dragging so the thumb follows the pointer instead of
    // fighting the advancing playhead. Read the playback state off the media
    // element itself: React's `playing` lags between play() and onPlay.
    scrubState.current = { pointerId: event.pointerId, wasPlaying: video != null && !video.paused }
    setScrubbing(true)
    video?.pause()
    seekToClientX(event.currentTarget, event.clientX)
  }
  const moveScrub = (event: React.PointerEvent<HTMLButtonElement>) => {
    const scrub = scrubState.current
    if (scrub?.pointerId !== event.pointerId) return
    const rect = event.currentTarget.getBoundingClientRect()
    const offBar = event.clientY < rect.top
      ? rect.top - event.clientY
      : event.clientY > rect.bottom
        ? event.clientY - rect.bottom
        : 0
    if (event.shiftKey || offBar > PRECISION_SCRUB_THRESHOLD_PX) {
      // Pulled away from the bar: 1px of horizontal travel = 1 frame,
      // anchored where precision mode was entered.
      if (!scrub.fine) {
        scrub.fine = {
          anchorX: event.clientX,
          anchorTime: videoRef.current?.currentTime ?? currentTime,
        }
        setScrubFine(true)
      }
      const fineTime = precisionScrubTime(
        scrub.fine.anchorTime,
        scrub.fine.anchorX,
        event.clientX,
        duration,
      )
      if (fineTime != null) seekTo(fineTime)
      return
    }
    if (scrub.fine) {
      scrub.fine = undefined
      setScrubFine(false)
    }
    seekToClientX(event.currentTarget, event.clientX)
  }
  const endScrub = (event: React.PointerEvent<HTMLButtonElement>) => {
    const scrub = scrubState.current
    if (scrub == null || scrub.pointerId !== event.pointerId) return
    scrubState.current = null
    setScrubFine(false)
    setScrubbing(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (scrub.wasPlaying) void videoRef.current?.play()
  }
  const wheelFrame = useRef<(delta: number) => void>(() => {})
  wheelFrame.current = (delta: number) => {
    if (duration <= 0 || scrubState.current != null || delta === 0) return
    stepFrame(delta > 0 ? 1 : -1)
  }
  const wheelCleanup = useRef<(() => void) | null>(null)
  // The bar mounts on demand with the player, so a mount-once effect would
  // miss it: a callback ref attaches the native non-passive wheel listener
  // whenever the element appears and cleans up when it goes. (React 18's
  // synthetic wheel listener is passive; preventDefault there is a no-op.)
  const progressRef = (element: HTMLButtonElement | null) => {
    wheelCleanup.current?.()
    wheelCleanup.current = null
    if (!element) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      wheelFrame.current(event.deltaY !== 0 ? event.deltaY : event.deltaX)
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    wheelCleanup.current = () => element.removeEventListener('wheel', onWheel)
  }
  const playerBoxRef = useRef<HTMLDivElement>(null)
  const [fullscreen, setFullscreen] = useState(false)
  useEffect(() => {
    const sync = () => setFullscreen(document.fullscreenElement === playerBoxRef.current)
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])
  const fullscreenSupported = typeof document !== 'undefined'
    && typeof document.documentElement.requestFullscreen === 'function'
    && document.fullscreenEnabled !== false
  const toggleFullscreen = () => {
    if (!fullscreenSupported) return
    if (document.fullscreenElement === playerBoxRef.current) void document.exitFullscreen()
    else void playerBoxRef.current?.requestFullscreen()
  }

  const degradeAnnotation = () => {
    setAnnotateUnavailable(true)
    setAnnotationOpen(false)
    setActiveStroke(null)
    annotationPointer.current = null
    abandonAnnotationSession()
    toast(S.video.captureUnavailable)
  }

  const openAnnotation = () => {
    if (annotateUnavailable || annotationOpen || annotationSending) return
    annotationGeneration.current += 1
    annotationSession.current = { clientId: newClientId() }
    annotationExport.current = null
    setAnnotationNote('')
    const video = videoRef.current
    if (!video || video.videoWidth <= 0 || video.videoHeight <= 0) {
      toast(S.video.frameNotReady)
      return
    }
    // The layer is a transparent telestrator over the LIVE video: playback
    // stays fully usable underneath. Pausing on entry is just a convenient
    // starting point; the frame (and its timestamp) is captured at SEND time.
    video.pause()
    annotationFrameSize.current = { width: video.videoWidth, height: video.videoHeight }
    setAnnotationTool('freehand')
    setAnnotationStrokes([])
    setActiveStroke(null)
    setAnnotationOpen(true)
  }

  useEffect(() => {
    if (!annotationOpen) return
    const canvas = annotationCanvasRef.current
    const frame = annotationFrameSize.current
    if (!canvas || !frame) return
    if (canvas.width !== frame.width) canvas.width = frame.width
    if (canvas.height !== frame.height) canvas.height = frame.height
    const context = canvas.getContext('2d')
    if (!context) return
    context.clearRect(0, 0, canvas.width, canvas.height)
    drawAnnotationStrokes(
      context,
      activeStroke ? [...annotationStrokes, activeStroke] : annotationStrokes,
      annotationLineWidth(canvas.width),
    )
  }, [activeStroke, annotationOpen, annotationStrokes])

  const annotationPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const frame = annotationFrameSize.current
    if (!frame) return null
    const rect = event.currentTarget.getBoundingClientRect()
    return displayPointToFrame(
      { x: event.clientX, y: event.clientY },
      rect,
      frame.width,
      frame.height,
    )
  }
  const beginAnnotationStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (annotationPointer.current != null || annotationSending) return
    const point = annotationPoint(event)
    if (!point) return
    annotationPointer.current = event.pointerId
    event.currentTarget.setPointerCapture(event.pointerId)
    setActiveStroke(beginStroke(annotationTool, point))
  }
  const moveAnnotationStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (annotationPointer.current !== event.pointerId) return
    const point = annotationPoint(event)
    if (!point) return
    setActiveStroke((current) => current ? moveStroke(current, point) : current)
  }
  const endAnnotationStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (annotationPointer.current !== event.pointerId) return
    annotationPointer.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setActiveStroke((current) => {
      setAnnotationStrokes((strokes) => commitStroke(strokes, current))
      return null
    })
    invalidateAnnotationUpload()
  }
  const closeAnnotation = () => {
    if (annotationSending) return
    // A half-uploaded attachment from a failed send is cleaned up on abandon.
    abandonAnnotationSession()
    setAnnotationOpen(false)
    setActiveStroke(null)
    annotationPointer.current = null
  }
  const annotationBlob = (generation: number) => new Promise<{ blob: Blob; timeMs: number }>((resolve, reject) => {
    // A prior failed attempt already froze an image the session's upload
    // state refers to — retries resend exactly that. The freeze belongs to
    // one annotation generation: a layer opened later never reuses it.
    const existing = annotationExport.current
    if (existing && existing.generation === generation) { resolve(existing); return }
    const video = videoRef.current
    const frame = annotationFrameSize.current
    if (!video || !frame) { reject(new Error('ANNOTATION_CANVAS_MISSING')); return }
    let settled = false
    const capture = (mediaTime: number) => {
      if (settled) return
      settled = true
      try {
        const exportCanvas = document.createElement('canvas')
        exportCanvas.width = frame.width
        exportCanvas.height = frame.height
        const context = exportCanvas.getContext('2d')
        if (!context) { reject(new Error('ANNOTATION_EXPORT_FAILED')); return }
        context.drawImage(video, 0, 0, frame.width, frame.height)
        drawAnnotationStrokes(context, annotationStrokes, annotationLineWidth(frame.width))
        drawTimeBadge(context, frame.width, frame.height, timeLabel(mediaTime))
        const timeMs = Math.max(0, Math.round(mediaTime * 1000))
        exportCanvas.toBlob((blob) => {
          if (!blob) { reject(new Error('ANNOTATION_EXPORT_FAILED')); return }
          const frozen = { blob, timeMs, generation }
          // The async callback may land after the coach moved on: only the
          // owning generation caches globally; an orphan still resolves so
          // its own in-flight send can finish coherently.
          if (generation === annotationGeneration.current) {
            annotationExport.current = frozen
          }
          resolve(frozen)
        }, 'image/jpeg', 0.9)
      } catch (caught) {
        reject(caught)
      }
    }
    // Badge, marker time, and pixels must come from the same PRESENTED
    // frame. Already-paused & not seeking → the presented frame is stable.
    // Playing → register rVFC BEFORE pausing so the next presentation fires
    // it. Seeking → wait for seeked. Fallbacks guarantee we never hang.
    const vfc = video as HTMLVideoElement & {
      requestVideoFrameCallback?: (
        callback: (now: number, metadata: { mediaTime: number }) => void,
      ) => number
    }
    if (video.seeking) {
      video.addEventListener('seeked', () => capture(video.currentTime), { once: true })
      video.pause()
      window.setTimeout(() => capture(video.currentTime), 300)
    } else if (!video.paused && typeof vfc.requestVideoFrameCallback === 'function') {
      vfc.requestVideoFrameCallback((_now, metadata) => capture(metadata.mediaTime))
      video.pause()
      window.setTimeout(() => capture(video.currentTime), 300)
    } else {
      video.pause()
      capture(video.currentTime)
    }
  })
  const dropAnnotationMarker = async (
    videoId: string,
    timeMs: number,
    note: string,
    attachmentId?: string,
  ) => {
    // The marker surface may be hidden (endpoint 404) — then skip silently,
    // matching the rest of the optional-marker contract.
    if (markerAvailability !== 'available') return
    try {
      const marker = await createVideoMarker(videoId, {
        time_ms: timeMs,
        note: note.trim().slice(0, 500) || S.video.annotationFallback,
        // The same chat_image attachment anchors the drawn frame onto the
        // marker so the student can view it from the player (0055).
        ...(attachmentId ? { attachment_id: attachmentId } : {}),
      })
      if (activeVideoIdRef.current !== videoId) return
      setMarkers((current) => (current.some((item) => item.id === marker.id)
        ? current
        : [...current, marker].sort((left, right) => left.time_ms - right.time_ms)))
    } catch {
      if (activeVideoIdRef.current === videoId) {
        toast(S.video.annotationMarkerFailed)
      }
    }
  }

  const sendAnnotation = async () => {
    if (annotationSending) return
    const videoId = activeVideoIdRef.current
    if (videoId == null) return
    const generation = annotationGeneration.current
    const session = annotationSession.current ?? { clientId: newClientId() }
    annotationSession.current = session
    setAnnotationSending(true)
    sendingSessionRef.current = session
    try {
      const { blob: image, timeMs: frozenTimeMs } = await annotationBlob(generation)
      if (image.size > 10 * 1024 * 1024) {
        toast(S.video.annotationTooLarge)
        return
      }
      let targetConversation = conversation
      if (!targetConversation) {
        targetConversation = await openConversation(studentId)
        onConversationOpened?.(targetConversation)
      }
      const message = await sendChatImage(targetConversation.id, image, session)
      // Publishing belongs to the request that produced it — but the editing
      // state may already belong to a newer annotation; never touch that.
      chatOutbox.publishConfirmed(message)
      await dropAnnotationMarker(videoId, frozenTimeMs, annotationNote, session.attachmentId)
      if (generation !== annotationGeneration.current) return
      annotationSession.current = null
      setAnnotationOpen(false)
      setActiveStroke(null)
      annotationPointer.current = null
    } catch (caught) {
      if (generation !== annotationGeneration.current) {
        // The UI moved on; this orphaned attempt owns its cleanup.
        abortChatImage(session)
        return
      }
      if (isSecurityError(caught)) degradeAnnotation()
      else toast(S.video.sendFailed)
    } finally {
      if (sendingSessionRef.current === session) sendingSessionRef.current = null
      if (generation === annotationGeneration.current) setAnnotationSending(false)
    }
  }

  const sendFeedback = async () => {
    if (!active || feedbackState === 'sending') return
    const draft = feedback
    const text = draft.trim()
    if (!text || text.length > 2000) return
    const request = ++feedbackRequest.current
    setFeedbackState('sending')
    setFeedbackError('')
    try {
      await postCoachFeedback({
        student_id: studentId,
        day_date: videoDay(active),
        plan_exercise_id: active.plan_exercise_id,
        video_id: active.id,
        text,
      })
      if (request !== feedbackRequest.current) return
      void refreshVideos()
      if (draftRef.current !== draft) {
        setFeedbackState('idle')
        return
      }
      writeFeedback('')
      setFeedbackState('sent')
      sentTimer.current = window.setTimeout(() => {
        if (request === feedbackRequest.current) setFeedbackState('idle')
      }, 2000)
    } catch {
      if (request === feedbackRequest.current) {
        setFeedbackState('idle')
        setFeedbackError(S.video.feedbackFailed)
      }
    }
  }

  const saveCoachRpe = async (next: number | null) => {
    if (!active?.set_log_id || coachRpeSaving) return
    const videoId = active.id
    const setLogId = active.set_log_id
    const previous = coachRpe
    const optimistic = next == null ? null : String(next)
    const request = ++coachRpeRequest.current
    setCoachRpe(optimistic)
    setCoachRpeSaving(true)
    setCoachRpeError('')
    try {
      const updated = await patchCoachRpe(setLogId, next)
      if (request !== coachRpeRequest.current || activeVideoIdRef.current !== videoId) return
      setCoachRpe(updated.coach_rpe)
      void refreshVideos()
    } catch {
      if (request === coachRpeRequest.current && activeVideoIdRef.current === videoId) {
        setCoachRpe(previous)
        setCoachRpeError(S.video.calibrationFailed)
      }
    } finally {
      if (request === coachRpeRequest.current && activeVideoIdRef.current === videoId) {
        setCoachRpeSaving(false)
      }
    }
  }

  const addMarker = async () => {
    if (!active || markerSaving) return
    const videoId = active.id
    const note = markerNote.trim()
    if (!note || note.length > 500) return
    setMarkerSaving(true)
    setMarkerError('')
    try {
      const marker = await createVideoMarker(videoId, {
        time_ms: Math.max(0, Math.round(currentTime * 1000)),
        note,
      })
      if (activeVideoIdRef.current !== videoId) return
      setMarkers((current) => (current.some((item) => item.id === marker.id)
        ? current
        : [...current, marker].sort((left, right) => left.time_ms - right.time_ms)))
      setMarkerOpen(false)
      setMarkerNote('')
    } catch {
      if (activeVideoIdRef.current === videoId) setMarkerError(S.video.markerSaveFailed)
    } finally {
      if (activeVideoIdRef.current === videoId) setMarkerSaving(false)
    }
  }
  const removeMarker = async (marker: VideoMarker) => {
    if (!active || deletingMarkerIds.has(marker.id)) return
    const videoId = active.id
    setDeletingMarkerIds((current) => new Set(current).add(marker.id))
    try {
      await deleteVideoMarker(videoId, marker.id)
      if (activeVideoIdRef.current !== videoId) return
      setMarkers((current) => current.filter((item) => item.id !== marker.id))
      setMarkerError('')
    } catch (caught) {
      if (activeVideoIdRef.current !== videoId) return
      // A 404 means the marker is already gone (double click, another tab):
      // that IS the desired end state, not a failure to surface.
      if (caught instanceof ApiException && caught.status === 404) {
        setMarkers((current) => current.filter((item) => item.id !== marker.id))
        setMarkerError('')
      } else {
        setMarkerError(S.video.markerDeleteFailed)
      }
    } finally {
      setDeletingMarkerIds((current) => {
        const next = new Set(current)
        next.delete(marker.id)
        return next
      })
    }
  }

  const markerServiceVisible = markerAvailability === 'available' || markerAvailability === 'error'

  const detailMeta = active ? [
    dayLabel(videoDay(active)),
    setLabel(active.set_index),
  ].filter(Boolean).join(' · ') : ''

  return (
    <main className={`videos-page${masterCollapsed ? ' master-collapsed' : ''}`}>
      {active && <section className="videos-detail">
        {(
          <>
            <header className="video-detail-head">
              <button
                type="button"
                className="video-detail-close"
                aria-label={S.video.closePlayer}
                onClick={() => setActiveId(null)}
              >×</button>
              <b>{videoTitle(active)}</b>
              <span className={`video-status ${active.viewed_at == null ? 'pending' : 'reviewed'}`}>
                {statusLabel(active)}
              </span>
              <small>{detailMeta}</small>
              <span className={`video-rpe-calibration${coachRpe != null ? ' calibrated' : ''}`}>
                <span className="video-student-rpe">
                  {S.video.athleteRpe} <b>{active.rpe == null ? S.video.notProvided : `@${Number(active.rpe)}`}</b>
                </span>
                {coachRpe != null && (
                  <span className="video-coach-rpe">
                    {S.video.coachRpe} <b>@{Number(coachRpe)}</b>
                  </span>
                )}
                {active.set_log_id != null && (
                  <>
                    <select
                      aria-label={S.video.calibrateRpeAria}
                      value={coachRpe == null ? '' : String(Number(coachRpe))}
                      disabled={coachRpeSaving}
                      onChange={(event) => void saveCoachRpe(Number(event.target.value))}
                    >
                      <option value="" disabled>{S.video.calibrateRpe}</option>
                      {coachRpeOptions.map((value) => (
                        <option value={value} key={value}>RPE {value}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="video-rpe-clear"
                      disabled={coachRpe == null || coachRpeSaving}
                      onClick={() => void saveCoachRpe(null)}
                    >
                      {S.video.clearCalibration}
                    </button>
                    {coachRpeSaving && <i className="video-rpe-saving">{S.video.saving}</i>}
                    {coachRpeError && (
                      <i className="video-rpe-error" role="alert">{coachRpeError}</i>
                    )}
                  </>
                )}
              </span>
              <span className="video-detail-nav">
                <i>{activeIndex + 1} / {visibleVideos.length}</i>
                <button
                  type="button"
                  aria-label={S.video.previousVideo}
                  disabled={activeIndex === 0}
                  onClick={() => move(-1)}
                >‹</button>
                <button
                  type="button"
                  aria-label={S.video.nextVideo}
                  disabled={activeIndex === visibleVideos.length - 1}
                  onClick={() => move(1)}
                >›</button>
              </span>
            </header>

            <div className="video-player" ref={playerBoxRef}>
              <div className="video-player-stage">
                {(!annotateUnavailable || markerServiceVisible) && (
                  <div className="video-stage-actions">
                    {!annotateUnavailable && (
                      <button
                        type="button"
                        className="video-annotate"
                        disabled={duration <= 0 || annotationOpen || annotationSending}
                        onClick={openAnnotation}
                      ><i>✏️</i>{S.video.annotation}</button>
                    )}
                    {markerServiceVisible && (
                      <button
                        type="button"
                        className="video-add-marker"
                        onClick={() => {
                          setMarkerOpen(true)
                          setMarkerError('')
                        }}
                      ><i>＋</i>{S.video.addMarkerHere}</button>
                    )}
                  </div>
                )}
                <div className="video-portrait">
                  {url ? (
                    <video
                      key={`${active?.id}:${crossOriginEnabled ? 'cors' : 'direct'}`}
                      ref={videoRef}
                      crossOrigin={crossOriginEnabled ? 'anonymous' : undefined}
                      src={url}
                      autoPlay
                      playsInline
                      onClick={togglePlayback}
                      onDoubleClick={toggleFullscreen}
                      onPlay={() => setPlaying(true)}
                      onPause={() => setPlaying(false)}
                      onTimeUpdate={(event) => handleTimeUpdate(event.currentTarget)}
                      onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
                      onDurationChange={(event) => setDuration(event.currentTarget.duration)}
                      onEnded={() => setPlaying(false)}
                      onError={playbackFailed}
                    />
                  ) : (
                    <div className="video-loading">{playbackError || S.video.gettingLink}</div>
                  )}
                  {viewingAnnotation?.annotation_url && !annotationOpen && (
                    <button
                      type="button"
                      className="video-annotation-view"
                      aria-label={S.video.annotatedFrameClose(timeLabel(viewingAnnotation.time_ms / 1000))}
                      onClick={() => setViewingAnnotation(null)}
                    >
                      <img
                        src={viewingAnnotation.annotation_url}
                        alt={viewingAnnotation.note || S.video.annotatedFrame}
                        onError={() => {
                          // Signed URL likely expired: refresh the list once
                          // so the next tap gets a fresh one.
                          setViewingAnnotation(null)
                          markerRequest.current += 1
                          void getVideoMarkers(viewingAnnotation.video_id)
                            .then((fresh) => {
                              if (activeVideoIdRef.current === viewingAnnotation.video_id) {
                                setMarkers(fresh)
                              }
                            })
                            .catch(() => {})
                        }}
                      />
                      <span>{S.video.annotatedFrameHint(timeLabel(viewingAnnotation.time_ms / 1000))}</span>
                    </button>
                  )}
                  {annotationOpen && annotationFrameSize.current && (
                    <div className="video-annotation-layer live" aria-label={S.video.annotationLayer}>
                      <div
                        className="video-annotation-frame"
                      >
                        <canvas
                          ref={annotationCanvasRef}
                          width={annotationFrameSize.current.width}
                          height={annotationFrameSize.current.height}
                          onPointerDown={beginAnnotationStroke}
                          onPointerMove={moveAnnotationStroke}
                          onPointerUp={endAnnotationStroke}
                          onPointerCancel={endAnnotationStroke}
                          onLostPointerCapture={endAnnotationStroke}
                        />
                        <div className="video-annotation-tools">
                          <span className="video-annotation-toolset" aria-label={S.video.annotationTools}>
                            <button
                              type="button"
                              className={annotationTool === 'freehand' ? 'active' : ''}
                              aria-pressed={annotationTool === 'freehand'}
                              disabled={annotationSending}
                              onClick={() => setAnnotationTool('freehand')}
                            >{S.video.pen}</button>
                            <button
                              type="button"
                              className={annotationTool === 'line' ? 'active' : ''}
                              aria-pressed={annotationTool === 'line'}
                              disabled={annotationSending}
                              onClick={() => setAnnotationTool('line')}
                            >{S.video.line}</button>
                          </span>
                          <button
                            type="button"
                            disabled={annotationStrokes.length === 0 || annotationSending}
                            onClick={() => {
                              setAnnotationStrokes((strokes) => undoStroke(strokes))
                              invalidateAnnotationUpload()
                            }}
                          >{S.video.undo}</button>
                          <button
                            type="button"
                            disabled={annotationStrokes.length === 0 || annotationSending}
                            onClick={() => {
                              setAnnotationStrokes(clearStrokes())
                              invalidateAnnotationUpload()
                            }}
                          >{S.common.clear}</button>
                          <input
                            className="video-annotation-note"
                            maxLength={500}
                            value={annotationNote}
                            placeholder={S.video.notePlaceholder}
                            disabled={annotationSending}
                            onChange={(event) => setAnnotationNote(event.target.value)}
                          />
                          <span className="video-annotation-spacer" />
                          <button type="button" disabled={annotationSending} onClick={closeAnnotation}>{S.common.cancel}</button>
                          <button
                            type="button"
                            className="video-annotation-send"
                            disabled={annotationSending}
                            onClick={() => void sendAnnotation()}
                          >{annotationSending ? S.video.sending : S.video.sendToChat}</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="video-controls">
                <button
                  type="button"
                  className="video-play-toggle"
                  aria-label={playing ? S.video.pause : S.video.play}
                  onClick={togglePlayback}
                >{playing ? 'Ⅱ' : '▶'}</button>
                <button
                  type="button"
                  className="video-frame-step"
                  aria-label={S.video.previousFrame}
                  disabled={duration <= 0}
                  onClick={() => stepFrame(-1)}
                >⏮ᶠ</button>
                <button
                  type="button"
                  className="video-frame-step"
                  aria-label={S.video.nextFrame}
                  disabled={duration <= 0}
                  onClick={() => stepFrame(1)}
                >⏭ᶠ</button>
                <span className="video-time">
                  {timeLabel(currentTime)} / {timeLabel(duration)}
                  {scrubFine
                    ? <em className="video-scrub-fine">{S.video.fineScrub}</em>
                    : scrubbing && <em className="video-scrub-hint">{S.video.scrubHint}</em>}
                </span>
                <button
                  type="button"
                  className={`video-progress${scrubFine ? ' fine' : ''}`}
                  aria-label={S.video.progress}
                  title={S.video.progressHint}
                  onPointerDown={beginScrub}
                  onPointerMove={moveScrub}
                  onPointerUp={endScrub}
                  onPointerCancel={endScrub}
                  onLostPointerCapture={endScrub}
                  ref={progressRef}
                >
                  <span style={{ width: `${duration > 0 ? markerPositionPercent(currentTime * 1000, duration) : 0}%` }} />
                  {markerAvailability === 'available' && markers.map((marker) => (
                    <i
                      className="video-marker-tick"
                      style={{ left: `${markerPositionPercent(marker.time_ms, duration)}%` }}
                      data-time-ms={marker.time_ms}
                      key={marker.id}
                    />
                  ))}
                </button>
                {fullscreenSupported && <button
                  type="button"
                  className="video-fullscreen-toggle"
                  aria-label={fullscreen ? S.video.exitFullscreen : S.video.watchFullscreen}
                  title={fullscreen ? `${S.video.exitFullscreen} (Esc)` : S.video.watchFullscreen}
                  onClick={toggleFullscreen}
                >{fullscreen ? '⤡' : '⤢'}</button>}
                <span className="video-speeds" aria-label={S.video.playbackSpeed}>
                  {VIDEO_SPEEDS.map((speed) => (
                    <button
                      type="button"
                      className={rate === speed ? 'active' : ''}
                      onClick={() => setRate(speed)}
                      key={speed}
                    >{speed}×</button>
                  ))}
                </span>
              </div>
              {markerServiceVisible && markerOpen && (
                <div className="video-marker-editor">
                  <span className="video-marker-editor-time">{timeLabel(currentTime)}</span>
                  <input
                    autoFocus
                    maxLength={500}
                    value={markerNote}
                    placeholder={S.video.markerFeedbackPlaceholder}
                    aria-label={S.video.markerComment}
                    onChange={(event) => {
                      setMarkerNote(event.target.value)
                      setMarkerError('')
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                        event.preventDefault()
                        void addMarker()
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="video-marker-save"
                    disabled={!markerNote.trim() || markerSaving}
                    onClick={() => void addMarker()}
                  >{markerSaving ? S.video.saving : S.video.saveMarker}</button>
                  <button
                    type="button"
                    className="video-marker-cancel"
                    onClick={() => setMarkerOpen(false)}
                  >{S.common.cancel}</button>
                </div>
              )}
            </div>

            <div className="video-detail-bottom">
              <section className="video-feedback">
                <header>
                  <b>{S.video.feedbackTitle}</b>
                  <span>{videoAssociation(active)}</span>
                </header>
                <textarea
                  value={feedback}
                  maxLength={2000}
                  placeholder={S.video.feedbackPlaceholder}
                  onChange={(event) => {
                    writeFeedback(event.target.value)
                    setFeedbackError('')
                    if (feedbackState === 'sent') setFeedbackState('idle')
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                      event.preventDefault()
                      void sendFeedback()
                    }
                  }}
                />
                <footer>
                  <span>{feedbackError}</span>
                  <button
                    type="button"
                    disabled={!feedback.trim() || feedback.length > 2000 || feedbackState === 'sending'}
                    onClick={() => void sendFeedback()}
                  >
                    {feedbackState === 'sending' ? S.video.sending : feedbackState === 'sent' ? S.video.sent : S.video.sendFeedback}
                    <small>⌘↵</small>
                  </button>
                </footer>
              </section>

              <section className="video-data-card">
                <h2>{S.video.setData}</h2>
                <dl>
                  <div><dt>{S.common.weight}</dt><dd>{active.weight_kg == null ? '—' : `${kg(active.weight_kg)} kg`}</dd></div>
                  <div><dt>{S.common.reps}</dt><dd>{active.reps == null ? '—' : active.reps}</dd></div>
                  <div><dt>{S.video.athleteRpeLabel}</dt><dd>{active.rpe == null ? S.video.notProvided : Number(active.rpe)}</dd></div>
                  <div><dt>{S.video.fileSize}</dt><dd>{size(active.size_bytes)}</dd></div>
                </dl>
              </section>

              {markerServiceVisible && (
                <section className="video-markers-card">
                  <h2>{S.video.markers(markers.length)}</h2>
                  <div>
                    {markerAvailability === 'error'
                      ? <span className="video-marker-service-error">{S.video.markerServiceError}</span>
                      : (
                        <>
                          {markers.length === 0 && <span className="video-markers-empty">{S.video.noMarkers}</span>}
                          {markers.map((marker) => (
                            <div className="video-marker-row" key={marker.id}>
                              <button
                                type="button"
                                className="video-marker-seek"
                                onClick={() => {
                                  seekTo(marker.time_ms / 1000)
                                  if (marker.annotation_url) {
                                    videoRef.current?.pause()
                                    setViewingAnnotation(marker)
                                  }
                                }}
                              >
                                <i />
                                <time>{timeLabel(marker.time_ms / 1000)}</time>
                                <span>{marker.note}</span>
                                {marker.annotation_url && <em className="video-marker-annotated" aria-label={S.video.hasAnnotation}>✏️</em>}
                              </button>
                              <button
                                type="button"
                                className="video-marker-delete"
                                aria-label={S.video.deleteMarker(timeLabel(marker.time_ms / 1000))}
                                disabled={deletingMarkerIds.has(marker.id)}
                                onClick={() => void removeMarker(marker)}
                              >×</button>
                            </div>
                          ))}
                        </>
                      )}
                  </div>
                  {markerError && <small className="video-marker-error">{markerError}</small>}
                </section>
              )}
            </div>
          </>
        )}
      </section>}

      <aside className={`videos-master${masterCollapsed ? ' collapsed' : ''}`}>
        <header className="videos-master-head">
          <span>{S.video.summary(videos.length, trainingDays)}</span>
          <button
            type="button"
            className="column-collapse-toggle"
            aria-label={masterCollapsed ? S.video.expandList : S.video.collapseList}
            aria-expanded={!masterCollapsed}
            title={masterCollapsed ? S.video.expandList : S.video.collapseList}
            onClick={toggleMaster}
          >
            {masterCollapsed ? '›' : '‹'}
          </button>
        </header>
        <div className="video-filter-tabs" role="tablist" aria-label={S.video.status}>
          {([
            ['all', S.common.all],
            ['pending', S.video.pending],
            ['reviewed', S.video.reviewed],
          ] as const).map(([value, label]) => (
            <button
              type="button"
              role="tab"
              aria-selected={filter === value}
              className={filter === value ? 'active' : ''}
              onClick={() => setFilter(value)}
              key={value}
            >
              {label}<span>{counts[value]}</span>
            </button>
          ))}
        </div>
        <div className="video-master-scroll">
          {grouped.length === 0 && <div className="video-list-empty">{S.video.noMatching}</div>}
          {grouped.map(([day, rows]) => (
            <section className="video-date-group" key={day}>
              <h2 className="video-date-heading">
                <span>{dayLabel(day)}</span>
                <small>{S.video.itemCount(rows.length)}</small>
              </h2>
              {rows.map((video) => {
                const selected = video.id === active?.id
                return (
                  <button
                    type="button"
                    className={`video-master-row${selected ? ' selected' : ''}`}
                    aria-current={selected ? 'true' : undefined}
                    onClick={() => pickVideo(video)}
                    key={video.id}
                  >
                    <span className="video-thumb" aria-hidden="true">▶</span>
                    <span className="video-row-copy">
                      <b>{videoTitle(video)}</b>
                      <small>
                        {compactDayLabel(day)} · {setLabel(video.set_index) ?? S.video.unlinkedSet} · RPE {video.rpe == null ? '—' : Number(video.rpe)}
                      </small>
                    </span>
                    <span className={`video-status ${video.viewed_at == null ? 'pending' : 'reviewed'}`}>
                      {statusLabel(video)}
                    </span>
                  </button>
                )
              })}
            </section>
          ))}
        </div>
      </aside>
    </main>
  )
}
