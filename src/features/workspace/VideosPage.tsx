import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ApiException } from '../../api/client'
import { openConversation } from '../../api/chat'
import { getUploadUrl, patchCoachRpe, postCoachFeedback } from '../../api/coach'
import { createVideoMarker, deleteVideoMarker, getVideoMarkers } from '../../api/markers'
import { abortChatImage, sendChatImage, type ChatImageSendSession } from '../../api/uploads'
import type { ChatConversation, StudentVideo, VideoMarker } from '../../api/types'
import { chatOutbox } from '../chat/chatOutbox'
import { newClientId } from '../chat/chatModel'
import { kg } from './WorkspaceCommon'
import {
  annotationLineWidth,
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
import { frameStepTime, VIDEO_SPEEDS } from './videoPlayback'

type VideoFilter = 'all' | 'pending' | 'reviewed'
type MarkerAvailability = 'loading' | 'available' | 'error' | 'unavailable'

const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const coachRpeOptions = Array.from({ length: 11 }, (_, index) => 5 + index * 0.5)

const videoDay = (video: Pick<StudentVideo, 'logged_at' | 'created_at'>) =>
  (video.logged_at ?? video.created_at).slice(0, 10)
const dayLabel = (day: string) => {
  const [year, month, date] = day.split('-').map(Number)
  return `${String(month).padStart(2, '0')}-${String(date).padStart(2, '0')} ${weekdays[new Date(year, month - 1, date).getDay()]}`
}
const setLabel = (index: number | null | undefined) => index == null ? null : `第 ${index + 1} 组`
const statusLabel = (video: StudentVideo) => video.viewed_at == null ? '待审' : '已反馈'
const loadLabel = (video: StudentVideo) => (
  video.weight_kg != null && video.reps != null
    ? `${kg(video.weight_kg)}kg × ${video.reps}`
    : video.weight_kg != null
      ? `${kg(video.weight_kg)}kg`
      : video.reps != null ? `${video.reps} 次` : ''
)
const videoTitle = (video: StudentVideo) =>
  [video.exercise_name || video.filename || '训练视频', loadLabel(video)].filter(Boolean).join(' ')
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
  set_index?: number | null
}) => {
  const day = video.logged_at ?? video.created_at
  return [
    day ? day.slice(5, 10).replace('-', '/') : null,
    video.exercise_name,
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

  const retried = useRef(false)
  const crossOriginRetried = useRef(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const annotationCanvasRef = useRef<HTMLCanvasElement>(null)
  const annotationBaseRef = useRef<HTMLCanvasElement | null>(null)
  const annotationPointer = useRef<number | null>(null)
  const annotationSession = useRef<ChatImageSendSession | null>(null)
  const annotationGeneration = useRef(0)
  const sendingSessionRef = useRef<ChatImageSendSession | null>(null)
  // Any stroke change after a failed send: the recorded upload no longer
  // matches the canvas — drop it (keeping the clientId) so the retry
  // uploads the current image instead of resending the stale attachment.
  const invalidateAnnotationUpload = () => {
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
    setAnnotationTool('freehand')
    setAnnotationStrokes([])
    setActiveStroke(null)
    abandonAnnotationSession()
    setAnnotationSending(false)
    annotationBaseRef.current = null
    annotationPointer.current = null
    resetFeedback()
    if (!active) return
    void getUploadUrl(active.id)
      .then((signed) => {
        if (request === urlRequest.current) setVideoSource({ videoId: active.id, url: signed.url })
      })
      .catch(() => { if (request === urlRequest.current) setPlaybackError('视频链接获取失败') })
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

  // The annotation surface is an editing mode even when the canvas itself is
  // not a native editable element. Consume app-wide shortcuts before any
  // screen-level registration can navigate, play, or mutate hidden content —
  // except Esc, which closes the layer (unless a send is in flight).
  useGlobalKeyboardHandler(({ event }) => {
    if (!annotationOpen) return false
    if (event.key === 'Escape') {
      event.preventDefault()
      if (!annotationSending) closeAnnotation()
    }
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
      annotationBaseRef.current = null
      abandonAnnotationSession()
      return
    }
    if (!active || retried.current) {
      setVideoSource(null)
      setPlaybackError('视频播放失败')
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
        setPlaybackError('视频链接已过期，续签失败')
      })
  }

  const togglePlayback = () => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) void video.play()
    else video.pause()
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
  const scrubState = useRef<{ pointerId: number; wasPlaying: boolean } | null>(null)
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
    video?.pause()
    seekToClientX(event.currentTarget, event.clientX)
  }
  const moveScrub = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (scrubState.current?.pointerId !== event.pointerId) return
    seekToClientX(event.currentTarget, event.clientX)
  }
  const endScrub = (event: React.PointerEvent<HTMLButtonElement>) => {
    const scrub = scrubState.current
    if (scrub == null || scrub.pointerId !== event.pointerId) return
    scrubState.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (scrub.wasPlaying) void videoRef.current?.play()
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
    annotationBaseRef.current = null
    annotationPointer.current = null
    abandonAnnotationSession()
    toast('当前视频无法安全捕获画面，标注已停用')
  }

  const openAnnotation = () => {
    if (annotateUnavailable || annotationOpen || annotationSending) return
    annotationGeneration.current += 1
    annotationSession.current = { clientId: newClientId() }
    const video = videoRef.current
    if (!video || video.videoWidth <= 0 || video.videoHeight <= 0) {
      toast('视频画面尚未就绪')
      return
    }
    video.pause()
    const base = document.createElement('canvas')
    base.width = video.videoWidth
    base.height = video.videoHeight
    const context = base.getContext('2d')
    if (!context) {
      toast('帧捕获失败，请重试')
      return
    }
    try {
      context.drawImage(video, 0, 0, base.width, base.height)
    } catch (caught) {
      if (isSecurityError(caught)) degradeAnnotation()
      else toast('帧捕获失败，请重试')
      return
    }
    annotationBaseRef.current = base
    setAnnotationTool('freehand')
    setAnnotationStrokes([])
    setActiveStroke(null)
    setAnnotationOpen(true)
  }

  useEffect(() => {
    if (!annotationOpen) return
    const canvas = annotationCanvasRef.current
    const base = annotationBaseRef.current
    if (!canvas || !base) return
    if (canvas.width !== base.width) canvas.width = base.width
    if (canvas.height !== base.height) canvas.height = base.height
    const context = canvas.getContext('2d')
    if (!context) return
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.drawImage(base, 0, 0)
    drawAnnotationStrokes(
      context,
      activeStroke ? [...annotationStrokes, activeStroke] : annotationStrokes,
      annotationLineWidth(canvas.width),
    )
  }, [activeStroke, annotationOpen, annotationStrokes])

  const annotationPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const base = annotationBaseRef.current
    if (!base) return null
    const rect = event.currentTarget.getBoundingClientRect()
    return displayPointToFrame(
      { x: event.clientX, y: event.clientY },
      rect,
      base.width,
      base.height,
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
    annotationBaseRef.current = null
    annotationPointer.current = null
  }
  const annotationBlob = () => new Promise<Blob>((resolve, reject) => {
    const canvas = annotationCanvasRef.current
    if (!canvas) { reject(new Error('ANNOTATION_CANVAS_MISSING')); return }
    try {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob)
        else reject(new Error('ANNOTATION_EXPORT_FAILED'))
      }, 'image/jpeg', 0.9)
    } catch (caught) {
      reject(caught)
    }
  })
  const sendAnnotation = async () => {
    if (annotationSending) return
    const generation = annotationGeneration.current
    const session = annotationSession.current ?? { clientId: newClientId() }
    annotationSession.current = session
    setAnnotationSending(true)
    sendingSessionRef.current = session
    try {
      const image = await annotationBlob()
      if (image.size > 10 * 1024 * 1024) {
        toast('标注图片超过 10MB，无法发送')
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
      if (generation !== annotationGeneration.current) return
      annotationSession.current = null
      setAnnotationOpen(false)
      setActiveStroke(null)
      annotationBaseRef.current = null
      annotationPointer.current = null
    } catch (caught) {
      if (generation !== annotationGeneration.current) {
        // The UI moved on; this orphaned attempt owns its cleanup.
        abortChatImage(session)
        return
      }
      if (isSecurityError(caught)) degradeAnnotation()
      else toast('发送失败')
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
        setFeedbackError('反馈发送失败，请稍后重试')
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
        setCoachRpeError('RPE 校准失败，已恢复原值')
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
      if (activeVideoIdRef.current === videoId) setMarkerError('打点保存失败，请稍后重试')
    } finally {
      if (activeVideoIdRef.current === videoId) setMarkerSaving(false)
    }
  }
  const removeMarker = async (marker: VideoMarker) => {
    if (!active) return
    const videoId = active.id
    try {
      await deleteVideoMarker(videoId, marker.id)
      if (activeVideoIdRef.current !== videoId) return
      setMarkers((current) => current.filter((item) => item.id !== marker.id))
    } catch {
      if (activeVideoIdRef.current === videoId) setMarkerError('打点删除失败，请稍后重试')
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
                aria-label="关闭播放"
                onClick={() => setActiveId(null)}
              >×</button>
              <b>{videoTitle(active)}</b>
              <span className={`video-status ${active.viewed_at == null ? 'pending' : 'reviewed'}`}>
                {statusLabel(active)}
              </span>
              <small>{detailMeta}</small>
              <span className={`video-rpe-calibration${coachRpe != null ? ' calibrated' : ''}`}>
                <span className="video-student-rpe">
                  学员自报 <b>{active.rpe == null ? '未填' : `@${Number(active.rpe)}`}</b>
                </span>
                {coachRpe != null && (
                  <span className="video-coach-rpe">
                    教练校准 <b>@{Number(coachRpe)}</b>
                  </span>
                )}
                {active.set_log_id != null && (
                  <>
                    <select
                      aria-label="教练校准 RPE"
                      value={coachRpe == null ? '' : String(Number(coachRpe))}
                      disabled={coachRpeSaving}
                      onChange={(event) => void saveCoachRpe(Number(event.target.value))}
                    >
                      <option value="" disabled>校准 RPE</option>
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
                      清除校准
                    </button>
                    {coachRpeSaving && <i className="video-rpe-saving">保存中…</i>}
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
                  aria-label="上一条视频"
                  disabled={activeIndex === 0}
                  onClick={() => move(-1)}
                >‹</button>
                <button
                  type="button"
                  aria-label="下一条视频"
                  disabled={activeIndex === visibleVideos.length - 1}
                  onClick={() => move(1)}
                >›</button>
              </span>
            </header>

            <div className="video-player" ref={playerBoxRef}>
              <div className="video-player-stage">
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
                      onPlay={() => setPlaying(true)}
                      onPause={() => setPlaying(false)}
                      onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
                      onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
                      onDurationChange={(event) => setDuration(event.currentTarget.duration)}
                      onEnded={() => setPlaying(false)}
                      onError={playbackFailed}
                    />
                  ) : (
                    <div className="video-loading">{playbackError || '正在获取播放链接…'}</div>
                  )}
                  {annotationOpen && annotationBaseRef.current && (
                    <div className="video-annotation-layer" aria-label="冻结帧标注编辑器">
                      <div
                        className="video-annotation-frame"
                      >
                        <canvas
                          ref={annotationCanvasRef}
                          width={annotationBaseRef.current.width}
                          height={annotationBaseRef.current.height}
                          onPointerDown={beginAnnotationStroke}
                          onPointerMove={moveAnnotationStroke}
                          onPointerUp={endAnnotationStroke}
                          onPointerCancel={endAnnotationStroke}
                          onLostPointerCapture={endAnnotationStroke}
                        />
                        <div className="video-annotation-tools">
                          <span className="video-annotation-toolset" aria-label="标注工具">
                            <button
                              type="button"
                              className={annotationTool === 'freehand' ? 'active' : ''}
                              aria-pressed={annotationTool === 'freehand'}
                              disabled={annotationSending}
                              onClick={() => setAnnotationTool('freehand')}
                            >画笔</button>
                            <button
                              type="button"
                              className={annotationTool === 'line' ? 'active' : ''}
                              aria-pressed={annotationTool === 'line'}
                              disabled={annotationSending}
                              onClick={() => setAnnotationTool('line')}
                            >直线</button>
                          </span>
                          <button
                            type="button"
                            disabled={annotationStrokes.length === 0 || annotationSending}
                            onClick={() => {
                              setAnnotationStrokes((strokes) => undoStroke(strokes))
                              invalidateAnnotationUpload()
                            }}
                          >撤销</button>
                          <button
                            type="button"
                            disabled={annotationStrokes.length === 0 || annotationSending}
                            onClick={() => {
                              setAnnotationStrokes(clearStrokes())
                              invalidateAnnotationUpload()
                            }}
                          >清空</button>
                          <span className="video-annotation-spacer" />
                          <button type="button" disabled={annotationSending} onClick={closeAnnotation}>取消</button>
                          <button
                            type="button"
                            className="video-annotation-send"
                            disabled={annotationSending}
                            onClick={() => void sendAnnotation()}
                          >{annotationSending ? '发送中…' : '发送到聊天'}</button>
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
                  aria-label={playing ? '暂停' : '播放'}
                  onClick={togglePlayback}
                >{playing ? 'Ⅱ' : '▶'}</button>
                <button
                  type="button"
                  className="video-frame-step"
                  aria-label="上一帧"
                  disabled={duration <= 0}
                  onClick={() => stepFrame(-1)}
                >⏮ᶠ</button>
                <button
                  type="button"
                  className="video-frame-step"
                  aria-label="下一帧"
                  disabled={duration <= 0}
                  onClick={() => stepFrame(1)}
                >⏭ᶠ</button>
                <span className="video-time">{timeLabel(currentTime)} / {timeLabel(duration)}</span>
                <button
                  type="button"
                  className="video-progress"
                  aria-label="视频进度"
                  onPointerDown={beginScrub}
                  onPointerMove={moveScrub}
                  onPointerUp={endScrub}
                  onPointerCancel={endScrub}
                  onLostPointerCapture={endScrub}
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
                  aria-label={fullscreen ? '退出全屏' : '全屏观看'}
                  title={fullscreen ? '退出全屏 (Esc)' : '全屏观看'}
                  onClick={toggleFullscreen}
                >{fullscreen ? '⤡' : '⤢'}</button>}
                <span className="video-speeds" aria-label="播放速度">
                  {VIDEO_SPEEDS.map((speed) => (
                    <button
                      type="button"
                      className={rate === speed ? 'active' : ''}
                      onClick={() => setRate(speed)}
                      key={speed}
                    >{speed}×</button>
                  ))}
                </span>
                {!annotateUnavailable && (
                  <button
                    type="button"
                    className="video-annotate"
                    disabled={duration <= 0 || annotationOpen || annotationSending}
                    onClick={openAnnotation}
                  >✏️ 标注</button>
                )}
                {markerServiceVisible && (
                  <button
                    type="button"
                    className="video-add-marker"
                    onClick={() => {
                      setMarkerOpen(true)
                      setMarkerError('')
                    }}
                  >＋ 在此处打点</button>
                )}
              </div>
              {markerServiceVisible && markerOpen && (
                <div className="video-marker-editor">
                  <span className="video-marker-editor-time">{timeLabel(currentTime)}</span>
                  <input
                    autoFocus
                    maxLength={500}
                    value={markerNote}
                    placeholder="写下这个时刻的动作反馈…"
                    aria-label="打点短评"
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
                  >{markerSaving ? '保存中…' : '保存打点'}</button>
                  <button
                    type="button"
                    className="video-marker-cancel"
                    onClick={() => setMarkerOpen(false)}
                  >取消</button>
                </div>
              )}
            </div>

            <div className="video-detail-bottom">
              <section className="video-feedback">
                <header>
                  <b>给学员的反馈</b>
                  <span>{videoAssociation(active)}</span>
                </header>
                <textarea
                  value={feedback}
                  maxLength={2000}
                  placeholder="指出动作问题、给出下一组建议…"
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
                    {feedbackState === 'sending' ? '发送中…' : feedbackState === 'sent' ? '已发送 ✓' : '发送反馈'}
                    <small>⌘↵</small>
                  </button>
                </footer>
              </section>

              <section className="video-data-card">
                <h2>本组数据</h2>
                <dl>
                  <div><dt>重量</dt><dd>{active.weight_kg == null ? '—' : `${kg(active.weight_kg)} kg`}</dd></div>
                  <div><dt>次数</dt><dd>{active.reps == null ? '—' : active.reps}</dd></div>
                  <div><dt>学员自报 RPE</dt><dd>{active.rpe == null ? '未填' : Number(active.rpe)}</dd></div>
                  <div><dt>文件大小</dt><dd>{size(active.size_bytes)}</dd></div>
                </dl>
              </section>

              {markerServiceVisible && (
                <section className="video-markers-card">
                  <h2>打点 · {markers.length} 处</h2>
                  <div>
                    {markerAvailability === 'error'
                      ? <span className="video-marker-service-error">打点服务异常</span>
                      : (
                        <>
                          {markers.length === 0 && <span className="video-markers-empty">还没有打点</span>}
                          {markers.map((marker) => (
                            <div className="video-marker-row" key={marker.id}>
                              <button
                                type="button"
                                className="video-marker-seek"
                                onClick={() => seekTo(marker.time_ms / 1000)}
                              >
                                <i />
                                <time>{timeLabel(marker.time_ms / 1000)}</time>
                                <span>{marker.note}</span>
                              </button>
                              <button
                                type="button"
                                className="video-marker-delete"
                                aria-label={`删除 ${timeLabel(marker.time_ms / 1000)} 打点`}
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
          <span>{videos.length} 条 · 近 {trainingDays} 个训练日</span>
          <button
            type="button"
            className="column-collapse-toggle"
            aria-label={masterCollapsed ? '展开视频片段列表' : '收起视频片段列表'}
            aria-expanded={!masterCollapsed}
            title={masterCollapsed ? '展开视频片段列表' : '收起视频片段列表'}
            onClick={toggleMaster}
          >
            {masterCollapsed ? '›' : '‹'}
          </button>
        </header>
        <div className="video-filter-tabs" role="tablist" aria-label="视频状态">
          {([
            ['all', '全部'],
            ['pending', '待审'],
            ['reviewed', '已反馈'],
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
          {grouped.length === 0 && <div className="video-list-empty">暂无符合条件的视频</div>}
          {grouped.map(([day, rows]) => (
            <section className="video-date-group" key={day}>
              <h2 className="video-date-heading">
                <span>{dayLabel(day)}</span>
                <small>· {rows.length} 条</small>
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
                        {day.slice(5)} · {setLabel(video.set_index) ?? '未关联组'} · RPE {video.rpe == null ? '—' : Number(video.rpe)}
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
