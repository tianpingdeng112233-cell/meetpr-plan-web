import { readFileSync } from 'node:fs'
import { setLocale } from '../../i18n/locale'
import { act, useCallback, useEffect, useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiException } from '../../api/client'
import type { StudentVideo, VideoMarker } from '../../api/types'
import { installLocalStorageMock } from '../../test/localStorageMock'

const api = vi.hoisted(() => ({
  getStudentVideos: vi.fn(),
  getUploadUrl: vi.fn(),
  postCoachFeedback: vi.fn(),
  patchCoachRpe: vi.fn(),
  getVideoMarkers: vi.fn(),
  createVideoMarker: vi.fn(),
  deleteVideoMarker: vi.fn(),
  markVideoViewed: vi.fn(),
  openConversation: vi.fn(),
  sendChatImage: vi.fn(),
  abortChatImage: vi.fn(),
  publishConfirmed: vi.fn(),
}))
vi.mock('../../api/coach', () => ({
  getStudentVideos: api.getStudentVideos,
  getUploadUrl: api.getUploadUrl,
  postCoachFeedback: api.postCoachFeedback,
  patchCoachRpe: api.patchCoachRpe,
}))
vi.mock('../../api/markers', () => ({
  getVideoMarkers: api.getVideoMarkers,
  createVideoMarker: api.createVideoMarker,
  deleteVideoMarker: api.deleteVideoMarker,
  markVideoViewed: api.markVideoViewed,
}))
vi.mock('../../api/chat', () => ({ openConversation: api.openConversation }))
vi.mock('../../api/uploads', () => ({
  sendChatImage: api.sendChatImage,
  abortChatImage: api.abortChatImage,
}))
vi.mock('../chat/chatOutbox', () => ({
  chatOutbox: { publishConfirmed: api.publishConfirmed },
}))

import { VideoWorkbench } from './VideoWorkbench'
import { BlockHistory } from '../plan-editor/components/BlockHistory'
import type { FeedbackSession } from '../plan-editor/feedbackSession'
import { createKeyedRequestVersions } from './requestVersions'
import { isReloadBlocked } from '../../reloadSafety'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const videos: StudentVideo[] = [
  {
    id: 'video-1',
    set_log_id: 'log-1',
    plan_exercise_id: 'exercise-1',
    content_type: 'video/mp4',
    size_bytes: 1024,
    filename: 'one.mp4',
    created_at: '2026-07-18T08:00:00Z',
    logged_at: '2026-07-18T07:00:00Z',
    exercise_name: '深蹲',
    set_index: 0,
    weight_kg: '125',
    reps: 4,
    rpe: '8.5',
    coach_rpe: null,
    viewed_at: null,
  },
  {
    id: 'video-2',
    set_log_id: 'log-2',
    plan_exercise_id: null,
    content_type: 'video/mp4',
    size_bytes: 2048,
    filename: 'two.mp4',
    created_at: '2026-07-18T06:00:00Z',
    logged_at: null,
    exercise_name: '卧推',
    set_index: 1,
    weight_kg: null,
    reps: 5,
    rpe: '7.5',
    coach_rpe: '9.0',
    viewed_at: '2026-07-18T09:00:00Z',
  },
  {
    id: 'video-3',
    set_log_id: null,
    plan_exercise_id: null,
    content_type: 'video/mp4',
    size_bytes: 4096,
    filename: 'three.mp4',
    created_at: '2026-07-16T08:00:00Z',
    logged_at: null,
    exercise_name: '硬拉',
    set_index: 2,
    weight_kg: '150',
    reps: 3,
    rpe: null,
    coach_rpe: null,
    viewed_at: null,
  },
]

const initialMarker: VideoMarker = {
  id: 'marker-1',
  video_id: 'video-1',
  coach_id: 'coach-1',
  time_ms: 4000,
  level: 'info',
  note: '起始位置',
  created_at: '2026-07-18T08:30:00Z',
}

async function settle(): Promise<void> {
  for (let index = 0; index < 8; index++) await Promise.resolve()
}
const click = (element: Element | null) =>
  act(() => element?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
const setInput = (element: HTMLInputElement, value: string) => act(() => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
})
const setTextarea = (element: HTMLTextAreaElement, value: string) => act(() => {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
  setter?.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
})
const setSelect = (element: HTMLSelectElement, value: string) => act(() => {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
  setter?.call(element, value)
  element.dispatchEvent(new Event('change', { bubbles: true }))
})
const buttonWithText = (host: HTMLElement, text: string) =>
  [...host.querySelectorAll('button')].find((button) => button.textContent?.includes(text)) ?? null

function VideosHarness({ studentId }: { studentId: string }) {
  const [feedback, setFeedback] = useState<FeedbackSession | null>({ videoId: null, playerOpen: false, includeViewed: true })
  const [rowsByStudent, setRowsByStudent] = useState<Record<string, StudentVideo[] | null | undefined>>({})
  const requestVersions = useRef(createKeyedRequestVersions())
  const refreshVideos = useCallback(async (id: string) => {
    const version = requestVersions.current.issue(id)
    setRowsByStudent((previous) => (
      Array.isArray(previous[id]) ? previous : { ...previous, [id]: undefined }
    ))
    try {
      const next = await api.getStudentVideos(id)
      if (!requestVersions.current.isLatest(id, version)) return
      setRowsByStudent((previous) => ({ ...previous, [id]: next }))
    } catch {
      if (!requestVersions.current.isLatest(id, version)) return
      setRowsByStudent((previous) => ({ ...previous, [id]: null }))
    }
  }, [])
  useEffect(() => { void refreshVideos(studentId) }, [studentId, refreshVideos])
  return <BlockHistory key={studentId} studentId={studentId} studentName="学员" row={null}
    videos={rowsByStudent[studentId]} entries={(rowsByStudent[studentId] ?? []).map(video => ({ video, inPlan: false }))}
    feedback={feedback} onFeedbackChange={setFeedback} onRefreshVideos={refreshVideos} />
}

describe('Feedback history rail and shared portrait workbench', () => {
  let host: HTMLDivElement
  let root: Root
  let mounted: boolean

  beforeEach(() => {
    installLocalStorageMock()
    window.localStorage.removeItem('meetpr:sidebar:videos')
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    mounted = false
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
    api.getStudentVideos.mockResolvedValue(videos)
    api.getUploadUrl.mockImplementation((id: string) =>
      Promise.resolve({ url: `https://example.test/${id}`, expires_in: 60 }))
    api.postCoachFeedback.mockResolvedValue({})
    api.patchCoachRpe.mockImplementation((setLogId: string, coachRpe: number | null) =>
      Promise.resolve({
        set_log_id: setLogId,
        coach_rpe: coachRpe == null ? null : coachRpe.toFixed(1),
      }))
    api.getVideoMarkers.mockResolvedValue([initialMarker])
    api.createVideoMarker.mockResolvedValue(initialMarker)
    api.deleteVideoMarker.mockResolvedValue(undefined)
    api.markVideoViewed.mockResolvedValue({ viewed_at: '2026-08-11T12:00:00Z' })
    api.openConversation.mockResolvedValue({
      id: 'conversation', other_party: { id: 'student-1', display_name: '学员' },
      last_message: null, last_message_at: null, unread_count: 0, my_last_read: null, other_last_read: null,
    })
    api.sendChatImage.mockImplementation((_conversationId: string, _image: Blob, session: { attachmentId?: string }) => {
      session.attachmentId = 'attachment'
      return Promise.resolve(sentImageMessage)
    })
    const sentImageMessage = {
      id: 'image-message', conversation_id: 'conversation', seq: 1, sender_id: 'coach', kind: 'image', body: null,
      attachment_id: 'attachment', image_url: 'https://example.test/image.jpg', image_expires_in: 900,
      set_ref: null, video_url: null, video_expires_in: null, client_id: 'image-client',
      created_at: '2026-08-01T12:00:00Z',
    }
  })

  afterEach(() => {
    if (mounted) act(() => root.unmount())
    host.remove()
    vi.clearAllMocks()
    vi.restoreAllMocks()
    setLocale(undefined)
  })

  const renderHarness = async (studentId = 'student-1') => {
    await act(async () => {
      root.render(<VideosHarness studentId={studentId} />)
      await settle()
    })
    mounted = true
    // Open the first clip through the feedback queue; business assertions exercise the real rail.
    const first = host.querySelector<HTMLButtonElement>('[data-feedback-video]')
    if (first) {
      await act(async () => { first.click(); await settle() })
    }
  }




  it('marks a pending video viewed at halfway and does not resend after success', async () => {
    api.getStudentVideos
      .mockResolvedValueOnce(videos)
      .mockResolvedValue(videos.map((video) => video.id === 'video-1'
        ? { ...video, viewed_at: '2026-08-11T12:00:00Z' }
        : video))
    await renderHarness()
    const video = host.querySelector<HTMLVideoElement>('video')!
    Object.defineProperties(video, {
      duration: { configurable: true, value: 20 },
      currentTime: { configurable: true, value: 9.99, writable: true },
    })

    act(() => video.dispatchEvent(new Event('timeupdate')))
    expect(api.markVideoViewed).not.toHaveBeenCalled()

    video.currentTime = 10
    await act(async () => {
      video.dispatchEvent(new Event('timeupdate'))
      await settle()
    })
    expect(api.markVideoViewed).toHaveBeenCalledTimes(1)
    expect(api.markVideoViewed).toHaveBeenCalledWith('video-1')
    expect(host.querySelector('[data-feedback-video="video-1"]')?.classList.contains('viewed')).toBe(true)

    video.currentTime = 15
    act(() => video.dispatchEvent(new Event('timeupdate')))
    expect(api.markVideoViewed).toHaveBeenCalledTimes(1)
  })

  it('ignores invalid duration and retries silently on a later over-half update after failure', async () => {
    api.markVideoViewed
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ viewed_at: '2026-08-11T12:00:00Z' })
    await renderHarness()
    const video = host.querySelector<HTMLVideoElement>('video')!
    Object.defineProperties(video, {
      duration: { configurable: true, value: Number.NaN, writable: true },
      currentTime: { configurable: true, value: 10, writable: true },
    })

    act(() => video.dispatchEvent(new Event('timeupdate')))
    expect(api.markVideoViewed).not.toHaveBeenCalled()

    Object.defineProperty(video, 'duration', { configurable: true, value: 20 })
    await act(async () => {
      video.dispatchEvent(new Event('timeupdate'))
      await settle()
    })
    expect(api.markVideoViewed).toHaveBeenCalledTimes(1)

    await act(async () => {
      video.dispatchEvent(new Event('timeupdate'))
      await settle()
    })
    expect(api.markVideoViewed).toHaveBeenCalledTimes(2)
    expect(host.querySelector('[role="alert"]')).toBeNull()
  })



  it('annotated markers carry a badge and open the drawn frame overlay', async () => {
    api.getVideoMarkers.mockResolvedValue([{
      ...initialMarker,
      attachment_id: 'attachment',
      annotation_url: 'https://oss.test/annotation.jpg',
      annotation_expires_in: 900,
    }])
    await renderHarness()
    expect(host.querySelector('.video-marker-annotated')).not.toBeNull()

    click(host.querySelector('.video-marker-seek'))
    await act(settle)
    const viewer = host.querySelector<HTMLButtonElement>('.video-annotation-view')
    expect(viewer).not.toBeNull()
    expect(viewer?.querySelector('img')?.src).toBe('https://oss.test/annotation.jpg')

    click(viewer)
    await act(settle)
    expect(host.querySelector('.video-annotation-view')).toBeNull()
  })



  it('renders the student-reported RPE and uses 未填 when it is absent', async () => {
    await renderHarness()
    expect(host.querySelector('.video-student-rpe')?.textContent).toContain('学员 RPE @8.5')

    click(host.querySelectorAll('[data-feedback-video]')[2]!)
    await act(settle)
    expect(host.querySelector('.video-student-rpe')?.textContent).toContain('学员 RPE 未填')
  })

  it('locks the calibration select to the full 5-10 half-step range', async () => {
    await renderHarness()
    const control = host.querySelector<HTMLSelectElement>('[aria-label="教练校准 RPE"]')!
    const values = Array.from(control.querySelectorAll('option'))
      .filter((option) => !option.disabled)
      .map((option) => option.value)
    expect(values).toEqual(['5', '5.5', '6', '6.5', '7', '7.5', '8', '8.5', '9', '9.5', '10'])
  })

  it('keeps a second same-video save alive when the first save\'s refresh lands mid-flight', async () => {
    let releaseRefresh: (value: StudentVideo[]) => void = () => {}
    let releasePatch: (value: { set_log_id: string; coach_rpe: string | null }) => void = () => {}
    await renderHarness()

    // First save resolves instantly, but its refreshVideos is held open.
    api.getStudentVideos.mockImplementation(() =>
      new Promise((resolve) => { releaseRefresh = resolve }))
    const control = host.querySelector<HTMLSelectElement>('[aria-label="教练校准 RPE"]')!
    setSelect(control, '8')
    await act(settle)
    expect(host.querySelector('.video-coach-rpe')?.textContent).toContain('教练 RPE @8')

    // Second save on the SAME video goes in-flight before the refresh returns.
    api.patchCoachRpe.mockImplementation(() =>
      new Promise((resolve) => { releasePatch = resolve }))
    setSelect(host.querySelector<HTMLSelectElement>('[aria-label="教练校准 RPE"]')!, '9')
    expect(host.querySelector('.video-coach-rpe')?.textContent).toContain('教练 RPE @9')

    // First save's refresh lands: same video id, coach_rpe now '8.0'. It must
    // NOT cancel the in-flight second save or clobber its optimistic value.
    await act(async () => {
      releaseRefresh(videos.map((video) => video.set_log_id === 'log-1'
        ? { ...video, coach_rpe: '8.0' }
        : video))
      await settle()
    })
    expect(host.querySelector('.video-coach-rpe')?.textContent).toContain('教练 RPE @9')
    expect(host.querySelector<HTMLSelectElement>('[aria-label="教练校准 RPE"]')?.disabled).toBe(true)

    // Second save resolves and wins.
    api.getStudentVideos.mockResolvedValue(videos)
    await act(async () => {
      releasePatch({ set_log_id: 'log-1', coach_rpe: '9.0' })
      await settle()
    })
    expect(host.querySelector('.video-coach-rpe')?.textContent).toContain('教练 RPE @9')
    expect(host.querySelector<HTMLSelectElement>('[aria-label="教练校准 RPE"]')?.disabled).toBe(false)
  })

  it('optimistically saves a coach RPE calibration and keeps the confirmed state', async () => {
    let release = (_value: { set_log_id: string; coach_rpe: string | null }) => {}
    api.patchCoachRpe.mockImplementation(() =>
      new Promise((resolve) => { release = resolve }))
    await renderHarness()

    const control = host.querySelector<HTMLSelectElement>('[aria-label="教练校准 RPE"]')!
    setSelect(control, '9')
    expect(api.patchCoachRpe).toHaveBeenCalledWith('log-1', 9)
    expect(host.querySelector('.video-coach-rpe')?.textContent).toContain('教练 RPE @9')
    expect(host.querySelector('.video-rpe-calibration')?.classList.contains('calibrated')).toBe(true)
    expect(control.disabled).toBe(true)

    await act(async () => {
      release({ set_log_id: 'log-1', coach_rpe: '9.0' })
      await settle()
    })
    expect(host.querySelector('.video-coach-rpe')?.textContent).toContain('教练 RPE @9')
    expect(host.querySelector<HTMLSelectElement>('[aria-label="教练校准 RPE"]')?.disabled).toBe(false)
  })

  it('clears an existing coach calibration optimistically', async () => {
    await renderHarness()
    click(host.querySelector('[data-feedback-video="video-2"]'))
    await act(settle)
    expect(host.querySelector('.video-coach-rpe')?.textContent).toContain('教练 RPE @9')

    click(buttonWithText(host, '清除'))
    expect(api.patchCoachRpe).toHaveBeenCalledWith('log-2', null)
    expect(host.querySelector('.video-coach-rpe')).toBeNull()
    await act(settle)
    expect(host.querySelector('.video-coach-rpe')).toBeNull()
  })

  it('rolls a failed calibration back and shows an error', async () => {
    let reject = (_error: Error) => {}
    api.patchCoachRpe.mockImplementation(() =>
      new Promise((_resolve, rejectPromise) => { reject = rejectPromise }))
    await renderHarness()
    click(host.querySelector('[data-feedback-video="video-2"]'))
    await act(settle)

    setSelect(host.querySelector<HTMLSelectElement>('[aria-label="教练校准 RPE"]')!, '8')
    expect(host.querySelector('.video-coach-rpe')?.textContent).toContain('教练 RPE @8')
    await act(async () => {
      reject(new Error('backend unavailable'))
      await settle()
    })

    expect(host.querySelector('.video-coach-rpe')?.textContent).toContain('教练 RPE @9')
    expect(host.querySelector('.video-rpe-error')?.textContent).toBe('RPE 校准失败，已恢复原值')
    expect(host.querySelector<HTMLSelectElement>('[aria-label="教练校准 RPE"]')?.value).toBe('9')
  })

  it('hides calibration controls when the video has no set log', async () => {
    await renderHarness()
    click(host.querySelectorAll('[data-feedback-video]')[2]!)
    await act(settle)

    expect(host.querySelector('.video-student-rpe')?.textContent).toContain('学员 RPE 未填')
    expect(host.querySelector('[aria-label="教练校准 RPE"]')).toBeNull()
    expect(buttonWithText(host, '清除')).toBeNull()
  })

  it('resets calibration state on switch and ignores the previous video response', async () => {
    let release = (_value: { set_log_id: string; coach_rpe: string | null }) => {}
    api.patchCoachRpe.mockImplementation(() =>
      new Promise((resolve) => { release = resolve }))
    await renderHarness()

    setSelect(host.querySelector<HTMLSelectElement>('[aria-label="教练校准 RPE"]')!, '6.5')
    expect(host.querySelector('.video-coach-rpe')?.textContent).toContain('教练 RPE @6.5')
    click(host.querySelector('[data-feedback-video="video-2"]'))
    await act(settle)
    expect(host.querySelector('.video-coach-rpe')?.textContent).toContain('教练 RPE @9')
    expect(host.querySelector<HTMLSelectElement>('[aria-label="教练校准 RPE"]')?.value).toBe('9')

    await act(async () => {
      release({ set_log_id: 'log-1', coach_rpe: '6.5' })
      await settle()
    })
    expect(host.querySelector('.history-player header')?.textContent).toContain('卧推')
    expect(host.querySelector('.video-coach-rpe')?.textContent).toContain('教练 RPE @9')
    expect(host.querySelector<HTMLSelectElement>('[aria-label="教练校准 RPE"]')?.value).toBe('9')
  })


  it('leaves arrow keys to the video element so scrubbing is not hijacked', async () => {
    await renderHarness()
    const video = host.querySelector('video')!
    act(() => video.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })))
    await act(settle)
    expect(host.querySelector('.history-player header')?.textContent).toContain('深蹲')
  })

  it('toggles playback with Space while exempting inputs and the focused video element', async () => {
    await renderHarness()
    const video = host.querySelector<HTMLVideoElement>('video')!
    Object.defineProperty(video, 'paused', { value: true, configurable: true })

    act(() => host.querySelector('.history-player')!.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })))
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1)

    const feedback = host.querySelector<HTMLTextAreaElement>('.video-feedback textarea')!
    feedback.focus()
    act(() => feedback.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })))
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1)

    act(() => video.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })))
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1)
  })

  it('offers 0.25× and pauses before button or keyboard frame stepping', async () => {
    await renderHarness()
    expect([...host.querySelectorAll('.video-speeds button')].map((button) => button.textContent))
      .toEqual(['0.25×', '0.5×', '1×', '2×'])
    const video = host.querySelector<HTMLVideoElement>('video')!
    Object.defineProperties(video, {
      duration: { configurable: true, value: 2 },
      currentTime: { configurable: true, value: 1, writable: true },
    })
    act(() => video.dispatchEvent(new Event('loadedmetadata')))
    vi.mocked(HTMLMediaElement.prototype.pause).mockClear()

    click(host.querySelector('[aria-label="下一帧"]'))
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledTimes(1)
    expect(video.currentTime).toBeCloseTo(1 + 1 / 30)

    act(() => host.querySelector('.history-player')!.dispatchEvent(new KeyboardEvent('keydown', { key: ',', bubbles: true })))
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledTimes(2)
    expect(video.currentTime).toBeCloseTo(1)
  })

  it('releases the old media source synchronously on switch and again on unmount', async () => {
    await renderHarness()
    const firstVideo = host.querySelector<HTMLVideoElement>('video')!
    expect(firstVideo.getAttribute('src')).toBe('https://example.test/video-1')

    click(host.querySelector('[data-feedback-video="video-2"]'))

    expect(firstVideo.getAttribute('src')).toBeNull()
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledTimes(1)
    expect(HTMLMediaElement.prototype.load).toHaveBeenCalledTimes(1)

    await act(settle)
    const secondVideo = host.querySelector<HTMLVideoElement>('video')!
    expect(secondVideo.getAttribute('src')).toBe('https://example.test/video-2')
    vi.mocked(HTMLMediaElement.prototype.pause).mockClear()
    vi.mocked(HTMLMediaElement.prototype.load).mockClear()

    act(() => root.unmount())
    mounted = false

    expect(secondVideo.getAttribute('src')).toBeNull()
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledTimes(1)
    expect(HTMLMediaElement.prototype.load).toHaveBeenCalledTimes(1)
  })

  it('drops crossOrigin once before renewing a failed URL, without sharing retry budgets', async () => {
    await renderHarness()
    const video = host.querySelector<HTMLVideoElement>('video')!
    expect(video.getAttribute('src')).toBe('https://example.test/video-1')
    expect(video.getAttribute('crossorigin')).toBe('anonymous')

    api.getUploadUrl.mockImplementation((id: string) =>
      Promise.resolve({ url: `https://example.test/${id}-renewed`, expires_in: 60 }))
    await act(async () => {
      video.dispatchEvent(new Event('error', { bubbles: false }))
      await settle()
    })

    const direct = host.querySelector<HTMLVideoElement>('video')!
    expect(direct.getAttribute('crossorigin')).toBeNull()
    expect(direct.getAttribute('src')).toBe('https://example.test/video-1')
    expect(host.querySelector('.video-annotate')).toBeNull()
    expect(api.getUploadUrl).toHaveBeenCalledTimes(1)

    await act(async () => {
      direct.dispatchEvent(new Event('error', { bubbles: false }))
      await settle()
    })

    const renewed = host.querySelector<HTMLVideoElement>('video')!
    expect(renewed.getAttribute('src')).toBe('https://example.test/video-1-renewed')
    expect(renewed).toBe(direct)
  })

  it('a failed URL renewal unmounts the dead player and surfaces the error text', async () => {
    await renderHarness()
    const video = host.querySelector<HTMLVideoElement>('video')!
    api.getUploadUrl.mockRejectedValue(new Error('expired'))
    await act(async () => {
      video.dispatchEvent(new Event('error', { bubbles: false }))
      await settle()
      host.querySelector<HTMLVideoElement>('video')?.dispatchEvent(new Event('error', { bubbles: false }))
      await settle()
    })

    expect(host.querySelector('video')).toBeNull()
    expect(host.querySelector('.video-loading')?.textContent).toContain('续签失败')
  })

  it('does not wipe a draft rewritten while the previous send is in flight', async () => {
    let release = () => {}
    api.postCoachFeedback.mockImplementation(() =>
      new Promise<void>((resolve) => { release = () => resolve() }))
    await renderHarness()
    const feedback = host.querySelector<HTMLTextAreaElement>('.video-feedback textarea')!
    setTextarea(feedback, '第一段')
    expect(isReloadBlocked()).toBe(true)
    click(buttonWithText(host, '发送反馈'))
    setTextarea(feedback, '第二段')
    await act(async () => {
      release()
      await settle()
    })
    expect(host.querySelector<HTMLTextAreaElement>('.video-feedback textarea')?.value).toBe('第二段')
    expect(buttonWithText(host, '发送反馈')?.textContent).toContain('发送反馈')
  })

  it('ignores a stale video list that resolves after the coach switched students', async () => {
    let releaseStale = () => {}
    const stale: StudentVideo[] = [{ ...videos[0]!, id: 'stale-1', exercise_name: '上一个学员的深蹲' }]
    api.getStudentVideos.mockImplementationOnce(() =>
      new Promise((resolve) => { releaseStale = () => resolve(stale) }))
    await renderHarness('student-2')
    await act(async () => {
      root.render(<VideosHarness studentId="student-3" />)
      await settle()
    })
    await act(async () => {
      releaseStale()
      await settle()
    })
    expect(host.textContent).not.toContain('上一个学员的深蹲')
  })

  it('posts video-scoped feedback and resets draft, state, and speed when switching', async () => {
    api.postCoachFeedback.mockImplementation(() => new Promise(() => {}))
    await renderHarness()
    click(buttonWithText(host.querySelector('.video-speeds') as HTMLElement, '2×'))
    const feedback = host.querySelector<HTMLTextAreaElement>('.video-feedback textarea')!
    setTextarea(feedback, '  膝盖继续向外推  ')
    click(buttonWithText(host, '发送反馈'))
    expect(api.postCoachFeedback).toHaveBeenCalledWith({
      student_id: 'student-1',
      day_date: '2026-07-18',
      plan_exercise_id: 'exercise-1',
      video_id: 'video-1',
      text: '膝盖继续向外推',
    })
    expect(buttonWithText(host, '发送中')?.textContent).toContain('发送中…')

    click(host.querySelector('[data-feedback-video="video-2"]'))
    await act(settle)
    expect(host.querySelector<HTMLTextAreaElement>('.video-feedback textarea')?.value).toBe('')
    expect(buttonWithText(host, '发送反馈')?.textContent).toContain('发送反馈')
    expect(buttonWithText(host.querySelector('.video-speeds') as HTMLElement, '1×')?.classList.contains('active')).toBe(true)
  })

  it('keeps written feedback when sending fails', async () => {
    api.postCoachFeedback.mockRejectedValue(new Error('backend unavailable'))
    await renderHarness()
    const feedback = host.querySelector<HTMLTextAreaElement>('.video-feedback textarea')!
    setTextarea(feedback, '不要丢掉这段反馈')
    await act(async () => {
      feedback.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }))
      await settle()
    })
    expect(feedback.value).toBe('不要丢掉这段反馈')
    expect(host.querySelector('.video-feedback footer span')?.textContent).toBe('反馈发送失败，请稍后重试')
  })

  it.each(['en', 'zh'] as const)('013 repair 2 keeps compact accessible portrait controls in %s', async locale => {
    setLocale(locale)
    const style = document.createElement('style')
    style.textContent = readFileSync('src/index.css', 'utf8') + readFileSync('src/features/plan-editor/components/block-history.css', 'utf8')
    document.head.append(style)
    try {
      vi.spyOn(host, 'getBoundingClientRect').mockReturnValue({ left: 1144, top: 56 } as DOMRect)
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 })
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 })
      await act(async () => {
        root.render(<VideoWorkbench studentId="student-1" videos={videos} onRefreshVideos={async () => {}}
          embedded={{ video: videos[0], title: 'W1 · D1', anchor: { current: host }, onClose: () => {} }} />)
        mounted = true; await settle()
      })
      expect(host.querySelector<HTMLElement>('.history-player')?.style.width).toBe('405px')
      const transport = host.querySelector<HTMLElement>('.history-transport')!
      const draw = transport.querySelector<HTMLButtonElement>('.video-annotate')!
      const marker = transport.querySelector<HTMLButtonElement>('.video-add-marker')!
      expect(draw.textContent).toBe(locale === 'en' ? '✎' : '画线')
      expect(draw.getAttribute('aria-label')).toBe(locale === 'en' ? 'Draw' : '画线')
      expect(draw.title).toBe(locale === 'en' ? 'Draw' : '画线')
      expect(marker.textContent).toBe(locale === 'en' ? '＋Mark' : '＋打点')
      expect(marker.getAttribute('aria-label')).toBe(locale === 'en' ? 'Add marker here' : '在此处打点')
      expect([...transport.querySelectorAll('.video-frame-step')].map(button => button.textContent)).toEqual(locale === 'en' ? ['‹', '›'] : ['‹ 帧', '帧 ›'])
      expect(getComputedStyle(transport).flexWrap).toBe(locale === 'en' ? 'nowrap' : 'wrap')
      if (locale === 'en') {
        expect(getComputedStyle(transport.querySelector('.video-frame-step')!).width).toBe('24px')
        expect(getComputedStyle(transport.querySelector('.video-speeds button')!).paddingLeft).toBe('4px')
      }
      click(marker)
      expect(host.querySelector('.video-marker-editor')).not.toBeNull()
    } finally { style.remove() }
  })

  it.each([false, true])('013 repair 1 marks portrait playback halfway, retries failure and deduplicates (feedback=%s)', async feedback => {
    const sidebar = feedback ? document.createElement('div') : null
    await act(async () => {
      root.render(<VideoWorkbench studentId="student-1" videos={videos} onRefreshVideos={async () => {}}
        embedded={{ video: videos[0], title: 'W1 · D1', anchor: { current: host }, sidebar, onClose: () => {} }} />)
      mounted = true; await settle()
    })
    expect(api.markVideoViewed).not.toHaveBeenCalled()
    const media = host.querySelector('video')!
    const update = async (time: number, duration = 20) => act(async () => {
      Object.defineProperty(media, 'duration', { configurable: true, value: duration })
      media.currentTime = time
      media.dispatchEvent(new Event('timeupdate'))
      await settle()
    })
    await update(10, NaN)
    await update(9.99)
    expect(api.markVideoViewed).not.toHaveBeenCalled()
    api.markVideoViewed.mockRejectedValueOnce(new Error('offline'))
    await update(10)
    expect(api.markVideoViewed).toHaveBeenCalledTimes(1)
    await update(11)
    expect(api.markVideoViewed).toHaveBeenCalledTimes(2)
    expect(api.markVideoViewed).toHaveBeenLastCalledWith('video-1')
    await update(15)
    expect(api.markVideoViewed).toHaveBeenCalledTimes(2)
  })

  it('013 repair 1 exposes the existing RPE calibration in the feedback rail only', async () => {
    const sidebar = document.createElement('div')
    const render = async (video = videos[0], feedback = true) => act(async () => {
      root.render(<VideoWorkbench studentId="student-1" videos={videos} onRefreshVideos={async () => {}}
        embedded={{ video, title: 'W1 · D1', anchor: { current: host }, sidebar: feedback ? sidebar : null, onClose: () => {} }} />)
      mounted = true; await settle()
    })
    await render()
    const calibration = sidebar.querySelector('.video-rpe-calibration')!
    expect(calibration).not.toBeNull()
    expect(calibration.compareDocumentPosition(sidebar.querySelector('.video-markers-card')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(calibration.textContent).toContain('学员 RPE')
    let release = (_value: { set_log_id: string; coach_rpe: string | null }) => {}
    api.patchCoachRpe.mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
    setSelect(sidebar.querySelector<HTMLSelectElement>('select')!, '9')
    expect(api.patchCoachRpe).toHaveBeenLastCalledWith('log-1', 9)
    expect(sidebar.querySelector('.video-rpe-saving')).not.toBeNull()
    expect(sidebar.querySelector<HTMLSelectElement>('select')?.disabled).toBe(true)
    await act(async () => { release({ set_log_id: 'log-1', coach_rpe: '9' }); await settle() })
    expect(sidebar.querySelector('.video-coach-rpe')?.textContent).toContain('@9')
    api.patchCoachRpe.mockRejectedValueOnce(new Error('unavailable'))
    setSelect(sidebar.querySelector<HTMLSelectElement>('select')!, '8')
    await act(settle)
    expect(sidebar.querySelector('.video-rpe-error')?.textContent).toBe('RPE 校准失败，已恢复原值')
    expect(sidebar.querySelector('.video-coach-rpe')?.textContent).toContain('@9')
    click(buttonWithText(sidebar, '清除'))
    await act(settle)
    expect(api.patchCoachRpe).toHaveBeenLastCalledWith('log-1', null)
    expect(sidebar.querySelector('.video-coach-rpe')).toBeNull()
    await render(videos[2])
    expect(sidebar.querySelector('select')).toBeNull()
    expect(buttonWithText(sidebar, '清除')).toBeNull()
    await render(videos[0], false)
    expect(host.querySelector('.video-rpe-calibration')).toBeNull()
    expect(sidebar.querySelector('.video-rpe-calibration')).toBeNull()
  })

  it('013 portrait annotations use the approved yellow and keep the original frame aspect ratio', async () => {
    const context = { clearRect: vi.fn(), save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), strokeStyle: '', lineWidth: 0 }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D)
    await act(async () => {
      root.render(<VideoWorkbench studentId="student-1" videos={videos} onRefreshVideos={async () => {}}
        embedded={{ video: videos[0], title: 'W1 · D1', anchor: { current: host }, onClose: () => {} }} />)
      mounted = true; await settle()
    })
    const media = host.querySelector('video')!
    Object.defineProperties(media, { videoWidth: { value: 1920 }, videoHeight: { value: 1080 }, duration: { value: 6 } })
    act(() => media.dispatchEvent(new Event('loadedmetadata')))
    click(host.querySelector('.video-annotate'))
    expect(context.strokeStyle).toBe('#FACC15')
    const frame = host.querySelector<HTMLElement>('.video-annotation-frame')!
    expect(frame.style.aspectRatio).toBe('1920 / 1080')
  })

  it('013 shared portrait workbench preserves reply and speed when the same video window reopens', async () => {
    const sidebar = document.createElement('div'); host.append(sidebar)
    const render = async (playerOpen: boolean) => act(async () => {
      root.render(<VideoWorkbench studentId="student-1" videos={videos} onRefreshVideos={async () => {}}
        embedded={{ video: videos[0], title: 'W1 · D1', anchor: { current: sidebar }, sidebar, playerOpen, onClose: () => {} }} />)
      mounted = true; await settle()
    })
    await render(true)
    click(buttonWithText(host, '2×'))
    setTextarea(sidebar.querySelector<HTMLTextAreaElement>('textarea')!, '保留反馈')
    await render(false)
    expect(host.querySelector('video')).toBeNull()
    expect(sidebar.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe('保留反馈')
    await render(true)
    const media = host.querySelector('video')!
    act(() => { Object.defineProperty(media, 'duration', { value: 6 }); media.dispatchEvent(new Event('loadedmetadata')) })
    expect(media.playbackRate).toBe(2)
    expect(sidebar.querySelector('.feedback-quick-replies')).toBeNull()
    const reply = sidebar.querySelector<HTMLTextAreaElement>('textarea')!
    setTextarea(reply, '下放再控一点')
    await act(async () => { reply.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true, cancelable: true })); await settle() })
    expect(api.postCoachFeedback).toHaveBeenCalledWith(expect.objectContaining({ video_id: 'video-1', plan_exercise_id: 'exercise-1', student_id: 'student-1', text: expect.stringContaining('下放再控一点') }))
    click(host.querySelector('.video-add-marker'))
    setInput(host.querySelector<HTMLInputElement>('.video-marker-editor input')!, '控制下放')
    click(host.querySelector('.video-marker-save'))
    await act(settle)
    expect(api.createVideoMarker).toHaveBeenCalledWith('video-1', { time_ms: 0, note: '控制下放' })
  })

  it('captures a native frame, blocks global shortcuts, opens a conversation, and publishes the image', async () => {
    const context = {
      clearRect: vi.fn(), drawImage: vi.fn(), save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(),
      moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(),
      arcTo: vi.fn(), closePath: vi.fn(), fill: vi.fn(), fillText: vi.fn(),
      measureText: vi.fn(() => ({ width: 60 })),
    }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(context as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => {
      callback(new Blob(['jpeg'], { type: 'image/jpeg' }))
    })
    let releaseConversation = (_value: unknown) => {}
    api.openConversation.mockImplementation(() => new Promise((resolve) => { releaseConversation = resolve }))
    await renderHarness()
    const video = host.querySelector<HTMLVideoElement>('video')!
    Object.defineProperties(video, {
      videoWidth: { configurable: true, value: 1080 },
      videoHeight: { configurable: true, value: 1920 },
      duration: { configurable: true, value: 40 },
    })
    act(() => video.dispatchEvent(new Event('durationchange')))
    vi.mocked(HTMLMediaElement.prototype.pause).mockClear()
    vi.mocked(HTMLMediaElement.prototype.play).mockClear()

    click(host.querySelector('.video-annotate'))
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledTimes(1)
    // Live layer: no frame grab on open — the frame is captured at SEND time.
    expect(context.drawImage).not.toHaveBeenCalled()
    expect(host.querySelector('.video-annotation-layer.live')).not.toBeNull()

    // The live layer keeps playback shortcuts working: space toggles play.
    act(() => host.querySelector('.history-player')!.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })))
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled()
    expect(host.querySelector('.history-player header')?.textContent).toContain('深蹲')

    click(buttonWithText(host, '发送到聊天'))
    await act(settle)
    // Send freezes NOW: current frame + strokes + badge composited.
    expect(context.drawImage).toHaveBeenCalledWith(video, 0, 0, 1080, 1920)
    expect(buttonWithText(host, '发送中')?.textContent).toBe('发送中…')
    expect(api.openConversation).toHaveBeenCalledWith('student-1')
    expect(api.sendChatImage).not.toHaveBeenCalled()

    await act(async () => {
      releaseConversation({
        id: 'conversation', other_party: { id: 'student-1', display_name: '学员' },
        last_message: null, last_message_at: null, unread_count: 0, my_last_read: null, other_last_read: null,
      })
      await settle()
    })
    expect(api.sendChatImage).toHaveBeenCalledWith(
      'conversation',
      expect.objectContaining({ type: 'image/jpeg' }),
      expect.objectContaining({ clientId: expect.stringMatching(/^web-/) }),
    )
    expect(api.publishConfirmed).toHaveBeenCalledWith(expect.objectContaining({ id: 'image-message' }))
    // A sent annotation drops a marker on the frozen moment so the student
    // can tap straight to it from the player's marker list.
    expect(api.createVideoMarker).toHaveBeenCalledWith('video-1', {
      time_ms: 0,
      note: '✏️ 标注',
      attachment_id: 'attachment',
    })
    expect(host.querySelector('.video-annotation-layer')).toBeNull()
  })

  it('a media error mid-annotation degrades the layer and abandons the session', async () => {
    // 复审轮3 BLOCKER:CORS 降级关闭标注层的路径必须走统一 abandon 清理,
    // 否则残留 session 无法通过 UI 取消。删掉 playbackFailed 里的 abandon 时这条必须挂。
    const context = {
      clearRect: vi.fn(), drawImage: vi.fn(), save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(),
      moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(),
      arcTo: vi.fn(), closePath: vi.fn(), fill: vi.fn(), fillText: vi.fn(),
      measureText: vi.fn(() => ({ width: 60 })),
    }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(context as unknown as CanvasRenderingContext2D)
    await renderHarness()
    const video = host.querySelector<HTMLVideoElement>('video')!
    Object.defineProperties(video, {
      videoWidth: { configurable: true, value: 1080 },
      videoHeight: { configurable: true, value: 1920 },
      duration: { configurable: true, value: 40 },
    })
    act(() => video.dispatchEvent(new Event('durationchange')))
    click(host.querySelector('.video-annotate'))
    expect(host.querySelector('.video-annotation-layer')).not.toBeNull()

    await act(async () => {
      video.dispatchEvent(new Event('error'))
      await settle()
    })
    expect(host.querySelector('.video-annotation-layer')).toBeNull()
    expect(host.querySelector('.video-annotate')).toBeNull()
  })

  it('an orphaned send finishing late must not unlock or abort a newer annotation', async () => {
    // 复审轮3 BLOCKER:发送标记必须绑定 session——旧视频的发送在切换后结束,
    // 不得把新标注当作非发送态清理掉。
    const context = {
      clearRect: vi.fn(), drawImage: vi.fn(), save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(),
      moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(),
      arcTo: vi.fn(), closePath: vi.fn(), fill: vi.fn(), fillText: vi.fn(),
      measureText: vi.fn(() => ({ width: 60 })),
    }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(context as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => {
      callback(new Blob(['jpeg'], { type: 'image/jpeg' }))
    })
    let rejectFirst = (_error: unknown) => {}
    api.sendChatImage.mockImplementationOnce(() =>
      new Promise((_resolve, reject) => { rejectFirst = reject }))
    api.openConversation.mockResolvedValue({
      id: 'conversation', other_party: { id: 'student-1', display_name: '学员' },
      last_message: null, last_message_at: null, unread_count: 0, my_last_read: null, other_last_read: null,
    })
    await renderHarness()
    const prepare = () => {
      const video = host.querySelector<HTMLVideoElement>('video')!
      Object.defineProperties(video, {
        videoWidth: { configurable: true, value: 1080 },
        videoHeight: { configurable: true, value: 1920 },
        duration: { configurable: true, value: 40 },
      })
      act(() => video.dispatchEvent(new Event('durationchange')))
    }
    prepare()
    click(host.querySelector('.video-annotate'))
    await act(async () => {
      buttonWithText(host, '发送到聊天')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await settle()
    })

    // Switch clips while the first send is still in flight, open a new layer.
    click(host.querySelectorAll('[data-feedback-video]')[1]!)
    await act(settle)
    prepare()
    click(host.querySelector('.video-annotate'))
    expect(host.querySelector('.video-annotation-layer')).not.toBeNull()

    api.abortChatImage.mockClear()
    await act(async () => {
      rejectFirst(new Error('offline'))
      await settle()
    })
    // The orphan aborts only its own session; the new layer stays editable.
    expect(api.abortChatImage).toHaveBeenCalledTimes(1)
    expect(host.querySelector('.video-annotation-layer')).not.toBeNull()
    expect(buttonWithText(host, '发送到聊天')?.disabled).toBe(false)
  })

  it('keeps the annotation layer available for retry when sending fails', async () => {
    const context = {
      clearRect: vi.fn(), drawImage: vi.fn(), save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(),
      moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(),
      arcTo: vi.fn(), closePath: vi.fn(), fill: vi.fn(), fillText: vi.fn(),
      measureText: vi.fn(() => ({ width: 60 })),
    }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(context as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => {
      callback(new Blob(['jpeg'], { type: 'image/jpeg' }))
    })
    api.sendChatImage.mockRejectedValue(new Error('offline'))
    const toast = vi.fn()
    window.addEventListener('meetpr:toast', toast)
    try {
      await renderHarness()
      const video = host.querySelector<HTMLVideoElement>('video')!
      Object.defineProperties(video, {
        videoWidth: { configurable: true, value: 1080 },
        videoHeight: { configurable: true, value: 1920 },
        duration: { configurable: true, value: 40 },
      })
      act(() => video.dispatchEvent(new Event('durationchange')))
      click(host.querySelector('.video-annotate'))
      await act(async () => {
        buttonWithText(host, '发送到聊天')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        await settle()
      })
      expect(host.querySelector('.video-annotation-layer')).not.toBeNull()
      expect(buttonWithText(host, '发送到聊天')).not.toBeNull()
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ detail: '发送失败' }))
    } finally {
      window.removeEventListener('meetpr:toast', toast)
    }
  })

  it('degrades safely when a tainted canvas throws SecurityError on export', async () => {
    const context = {
      clearRect: vi.fn(), drawImage: vi.fn(), save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(),
      moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(),
      arcTo: vi.fn(), closePath: vi.fn(), fill: vi.fn(), fillText: vi.fn(),
      measureText: vi.fn(() => ({ width: 60 })),
    }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(context as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(() => {
      throw new DOMException('Tainted canvas', 'SecurityError')
    })
    const toast = vi.fn()
    window.addEventListener('meetpr:toast', toast)
    try {
      await renderHarness()
      const video = host.querySelector<HTMLVideoElement>('video')!
      Object.defineProperties(video, {
        videoWidth: { configurable: true, value: 1080 },
        videoHeight: { configurable: true, value: 1920 },
        duration: { configurable: true, value: 40 },
      })
      act(() => video.dispatchEvent(new Event('durationchange')))
      click(host.querySelector('.video-annotate'))
      await act(async () => {
        buttonWithText(host, '发送到聊天')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        await settle()
      })
      expect(host.querySelector('.video-annotation-layer')).toBeNull()
      expect(host.querySelector('.video-annotate')).toBeNull()
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({
        detail: '当前视频无法安全捕获画面，标注已停用',
      }))
      expect(api.openConversation).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener('meetpr:toast', toast)
    }
  })

  it('hides the marker card and add action when marker GET has a network error', async () => {
    api.getVideoMarkers.mockRejectedValue(new Error('staging route unavailable'))
    await renderHarness()
    expect(host.querySelector('.video-add-marker')).toBeNull()
    expect(host.querySelector('.video-markers-card')).toBeNull()
  })

  it('degrades a marker GET 404 because the endpoint may not be deployed', async () => {
    api.getVideoMarkers.mockRejectedValue(new ApiException(404, 'MARKERS_NOT_FOUND'))
    await renderHarness()
    expect(host.querySelector('.video-add-marker')).toBeNull()
    expect(host.querySelector('.video-markers-card')).toBeNull()
  })

  it('keeps the marker entry visible and shows a service error for marker GET 409', async () => {
    api.getVideoMarkers.mockRejectedValue(new ApiException(409, 'MARKER_CONFLICT'))
    await renderHarness()
    expect(host.querySelector('.video-add-marker')).not.toBeNull()
    expect(host.querySelector('.video-markers-card')?.textContent).toContain('打点服务异常')
  })

  it('keeps the marker draft visible when marker POST returns 422', async () => {
    api.createVideoMarker.mockRejectedValue(new ApiException(422, 'MARKER_VALIDATION_FAILED'))
    await renderHarness()
    click(host.querySelector('.video-add-marker'))
    const note = host.querySelector<HTMLInputElement>('[aria-label="打点短评"]')!
    setInput(note, '这条短评需要保留')
    await act(async () => {
      buttonWithText(host, '保存打点')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await settle()
    })

    expect(host.querySelector<HTMLInputElement>('[aria-label="打点短评"]')?.value).toBe('这条短评需要保留')
    expect(host.querySelector('.video-marker-error')?.textContent).toBe('打点保存失败，请稍后重试')
  })

  it('updates the marker list immediately after a successful POST and Cancel discards the inline editor', async () => {
    const created: VideoMarker = {
      ...initialMarker,
      id: 'marker-2',
      time_ms: 12000,
      level: 'warn',
      note: '膝盖继续向外推',
    }
    api.createVideoMarker.mockResolvedValue(created)
    await renderHarness()
    const video = host.querySelector<HTMLVideoElement>('video')!
    Object.defineProperty(video, 'currentTime', { configurable: true, value: 12, writable: true })
    act(() => video.dispatchEvent(new Event('timeupdate', { bubbles: true })))

    click(host.querySelector('.video-add-marker'))
    expect(host.querySelector('.video-marker-editor')).not.toBeNull()
    click(buttonWithText(host, '取消'))
    expect(host.querySelector('.video-marker-editor')).toBeNull()

    click(host.querySelector('.video-add-marker'))
    setInput(host.querySelector<HTMLInputElement>('[aria-label="打点短评"]')!, '膝盖继续向外推')
    await act(async () => {
      buttonWithText(host, '保存打点')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await settle()
    })

    expect(api.createVideoMarker).toHaveBeenCalledWith('video-1', {
      time_ms: 12000,
      note: '膝盖继续向外推',
    })
    expect(host.querySelector('.video-markers-card h2')?.textContent).toBe('打点 · 2 处')
    expect(host.querySelector('.video-markers-card')?.textContent).toContain('膝盖继续向外推')
  })

  it('does not write an out-of-order marker POST response into the newly selected video', async () => {
    let release = (_marker: VideoMarker) => {}
    api.getVideoMarkers.mockImplementation((videoId: string) =>
      Promise.resolve(videoId === 'video-1' ? [initialMarker] : []))
    api.createVideoMarker.mockImplementation(() =>
      new Promise<VideoMarker>((resolve) => { release = resolve }))
    await renderHarness()
    click(host.querySelector('.video-add-marker'))
    setInput(host.querySelector<HTMLInputElement>('[aria-label="打点短评"]')!, '只属于 A 视频')
    click(buttonWithText(host, '保存打点'))
    click(host.querySelector('[data-feedback-video="video-2"]'))
    await act(settle)
    expect(host.querySelector('.history-player header')?.textContent).toContain('卧推')
    expect(host.querySelector('.video-markers-card h2')?.textContent).toBe('打点 · 0 处')

    await act(async () => {
      release({
        ...initialMarker,
        id: 'marker-from-video-1',
        note: '只属于 A 视频',
      })
      await settle()
    })

    expect(host.querySelector('.video-markers-card h2')?.textContent).toBe('打点 · 0 处')
    expect(host.querySelector('.video-markers-card')?.textContent).not.toContain('只属于 A 视频')
    expect(host.querySelector('[data-time-ms]')).toBeNull()
  })

  it('double-clicking delete fires one request and a late 404 still reads as deleted', async () => {
    // 走查实况:慢网络下连点删除,第二个 DELETE 到达时标记已被删,后端 404,
    // 旧实现把它当失败报「删除失败」——但其实删成功了。
    let releaseDelete = () => {}
    api.deleteVideoMarker.mockImplementationOnce(() =>
      new Promise<void>((resolve) => { releaseDelete = resolve }))
    await renderHarness()
    const trash = host.querySelector<HTMLButtonElement>('[aria-label="删除 0:04 打点"]')!
    click(trash)
    await act(settle)
    // In-flight: the button is disabled and a second click is a no-op.
    expect(trash.disabled).toBe(true)
    click(trash)
    await act(async () => { releaseDelete(); await settle() })
    expect(api.deleteVideoMarker).toHaveBeenCalledTimes(1)
    expect(host.textContent).not.toContain('打点删除失败')
    expect(host.querySelector('.video-marker-row')).toBeNull()

    // And a 404 from another surface having deleted it first is success too.
    api.getVideoMarkers.mockResolvedValue([initialMarker])
    api.deleteVideoMarker.mockRejectedValueOnce(new ApiException(404, 'VIDEO_MARKER_NOT_FOUND'))
    click(host.querySelectorAll('[data-feedback-video]')[1]!)
    await act(settle)
    click(host.querySelectorAll('[data-feedback-video]')[0]!)
    await act(settle)
    click(host.querySelector('[aria-label="删除 0:04 打点"]'))
    await act(settle)
    expect(host.textContent).not.toContain('打点删除失败')
    expect(host.querySelector('.video-marker-row')).toBeNull()
  })

  it('renders marker seek and delete as sibling native buttons', async () => {
    await renderHarness()
    const row = host.querySelector('.video-marker-row')!
    const buttons = row.querySelectorAll(':scope > button')
    expect(buttons).toHaveLength(2)
    expect(row.querySelector('button button')).toBeNull()

    click(host.querySelector('[aria-label="删除 0:04 打点"]'))
    await act(settle)
    expect(api.deleteVideoMarker).toHaveBeenCalledWith('video-1', 'marker-1')
  })
})
