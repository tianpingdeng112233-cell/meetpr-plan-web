import { act, useCallback, useRef, useState } from 'react'
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
}))

import { VideosPage, type VideoTarget } from './VideosPage'
import { createKeyedRequestVersions } from './requestVersions'

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

function VideosHarness({ studentId, target }: { studentId: string; target?: VideoTarget | null }) {
  const [rowsByStudent, setRowsByStudent] = useState<Record<string, StudentVideo[]>>({})
  const requestVersions = useRef(createKeyedRequestVersions())
  const refreshVideos = useCallback(async (id: string) => {
    const version = requestVersions.current.issue(id)
    const next = await api.getStudentVideos(id)
    if (!requestVersions.current.isLatest(id, version)) return
    setRowsByStudent((previous) => ({ ...previous, [id]: next }))
  }, [])
  return (
    <VideosPage
      studentId={studentId}
      videos={rowsByStudent[studentId] ?? []}
      onRefreshVideos={refreshVideos}
      target={target}
    />
  )
}

describe('VideosPage master-detail interactions', () => {
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
  })

  afterEach(() => {
    if (mounted) act(() => root.unmount())
    host.remove()
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  const renderHarness = async (studentId = 'student-1') => {
    await act(async () => {
      root.render(<VideosHarness studentId={studentId} />)
      await settle()
    })
    mounted = true
    // The player is on-demand since the student hub: open the first clip so
    // the detail-pane assertions keep their historical precondition.
    const first = host.querySelector<HTMLButtonElement>('.video-master-row')
    if (first) {
      await act(async () => { first.click(); await settle() })
    }
  }

  it('collapses the clip list and restores the saved state', async () => {
    await renderHarness()
    const toggle = host.querySelector<HTMLButtonElement>('[aria-label="收起视频片段列表"]')!

    click(toggle)
    expect(host.querySelector('.videos-master')?.classList.contains('collapsed')).toBe(true)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(window.localStorage.getItem('meetpr:sidebar:videos')).toBe('true')

    act(() => root.unmount())
    mounted = false
    root = createRoot(host)
    await renderHarness()
    expect(host.querySelector('.videos-master')?.classList.contains('collapsed')).toBe(true)
    expect(host.querySelector('[aria-label="展开视频片段列表"]')).not.toBeNull()
  })

  it('renders true pending/reviewed counts and filters the master list', async () => {
    await renderHarness()
    const tabs = [...host.querySelectorAll<HTMLButtonElement>('.video-filter-tabs button')]
    expect(tabs.map((tab) => tab.textContent)).toEqual(['全部3', '待审2', '已反馈1'])
    expect(host.querySelectorAll('.video-master-row')).toHaveLength(3)

    click(tabs[1]!)
    await act(settle)
    expect(host.querySelectorAll('.video-master-row')).toHaveLength(2)
    expect([...host.querySelectorAll('.video-master-row .video-status')].map((tag) => tag.textContent))
      .toEqual(['待审', '待审'])

    click(tabs[2]!)
    await act(settle)
    expect(host.querySelectorAll('.video-master-row')).toHaveLength(1)
    expect(host.querySelector('.video-master-row .video-status')?.textContent).toBe('已反馈')
  })

  it('switches to all and locates a group-card target hidden by the current filter', async () => {
    await renderHarness()
    click([...host.querySelectorAll<HTMLButtonElement>('.video-filter-tabs button')][1]!)
    await act(settle)
    expect(host.textContent).not.toContain('卧推')

    await act(async () => {
      root.render(<VideosHarness
        studentId="student-1"
        target={{
          requestId: 1,
          setLogId: 'log-2',
          dayDate: '2026-07-18',
          exerciseName: '卧推',
          setIndex: 1,
        }}
      />)
      await settle()
    })

    expect(host.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')?.textContent).toBe('全部3')
    expect(host.querySelector('.video-detail-head')?.textContent).toContain('卧推')
    expect(host.querySelector('.video-master-row.selected')?.textContent).toContain('卧推')
  })

  it('keeps the player closed until a clip is picked and closes it via the × button', async () => {
    await act(async () => {
      root.render(<VideosHarness studentId="student-1" />)
      await settle()
    })
    mounted = true
    expect(host.querySelector('.videos-detail')).toBeNull()
    expect(host.querySelector('.videos-master')).not.toBeNull()

    const first = host.querySelector<HTMLButtonElement>('.video-master-row')!
    await act(async () => { first.click(); await settle() })
    expect(host.querySelector('.videos-detail')).not.toBeNull()

    click(host.querySelector<HTMLButtonElement>('.video-detail-close')!)
    await act(settle)
    expect(host.querySelector('.videos-detail')).toBeNull()
    expect(host.querySelector('.video-master-row.selected')).toBeNull()
  })

  it('never falls back to day/exercise/set matching when the target has a set_log_id', async () => {
    await renderHarness()
    const before = host.querySelector('.video-detail-head')?.textContent
    await act(async () => {
      root.render(<VideosHarness
        studentId="student-1"
        target={{
          requestId: 9,
          // A real id that matches no video: the same set may have another
          // upload whose day/exercise/index triple would collide.
          setLogId: 'log-vanished',
          dayDate: '2026-07-18',
          exerciseName: '卧推',
          setIndex: 1,
        }}
      />)
      await settle()
    })
    expect(host.querySelector('.video-detail-head')?.textContent).toBe(before)
  })

  it('uses sticky date-group heading structure and displays source 0-based set indexes as 1-based', async () => {
    await renderHarness()
    const groups = [...host.querySelectorAll('.video-date-group')]
    expect(groups).toHaveLength(2)
    expect(groups.every((group) => group.firstElementChild?.classList.contains('video-date-heading'))).toBe(true)
    expect(groups[0]?.querySelector('.video-date-heading')?.textContent).toContain('07-18 周六')
    expect(groups[0]?.querySelector('.video-date-heading')?.textContent).toContain('2 条')
    expect(host.querySelector('.video-master-row')?.textContent).toContain('第 1 组')
    expect(host.querySelector('.video-detail-head')?.textContent).toContain('第 1 组')
  })

  it('renders the student-reported RPE and uses 未填 when it is absent', async () => {
    await renderHarness()
    expect(host.querySelector('.video-student-rpe')?.textContent).toContain('学员自报 @8.5')

    click(host.querySelectorAll('.video-master-row')[2]!)
    await act(settle)
    expect(host.querySelector('.video-student-rpe')?.textContent).toContain('学员自报 未填')
    expect(host.querySelector('.video-data-card')?.textContent).toContain('学员自报 RPE未填')
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
    expect(host.querySelector('.video-coach-rpe')?.textContent).toContain('教练校准 @8')

    // Second save on the SAME video goes in-flight before the refresh returns.
    api.patchCoachRpe.mockImplementation(() =>
      new Promise((resolve) => { releasePatch = resolve }))
    setSelect(host.querySelector<HTMLSelectElement>('[aria-label="教练校准 RPE"]')!, '9')
    expect(host.querySelector('.video-coach-rpe')?.textContent).toContain('教练校准 @9')

    // First save's refresh lands: same video id, coach_rpe now '8.0'. It must
    // NOT cancel the in-flight second save or clobber its optimistic value.
    await act(async () => {
      releaseRefresh(videos.map((video) => video.set_log_id === 'log-1'
        ? { ...video, coach_rpe: '8.0' }
        : video))
      await settle()
    })
    expect(host.querySelector('.video-coach-rpe')?.textContent).toContain('教练校准 @9')
    expect(host.querySelector<HTMLSelectElement>('[aria-label="教练校准 RPE"]')?.disabled).toBe(true)

    // Second save resolves and wins.
    api.getStudentVideos.mockResolvedValue(videos)
    await act(async () => {
      releasePatch({ set_log_id: 'log-1', coach_rpe: '9.0' })
      await settle()
    })
    expect(host.querySelector('.video-coach-rpe')?.textContent).toContain('教练校准 @9')
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
    expect(host.querySelector('.video-coach-rpe')?.textContent).toContain('教练校准 @9')
    expect(host.querySelector('.video-rpe-calibration')?.classList.contains('calibrated')).toBe(true)
    expect(control.disabled).toBe(true)

    await act(async () => {
      release({ set_log_id: 'log-1', coach_rpe: '9.0' })
      await settle()
    })
    expect(host.querySelector('.video-coach-rpe')?.textContent).toContain('教练校准 @9')
    expect(host.querySelector<HTMLSelectElement>('[aria-label="教练校准 RPE"]')?.disabled).toBe(false)
  })

  it('clears an existing coach calibration optimistically', async () => {
    await renderHarness()
    click(host.querySelector('[aria-label="下一条视频"]'))
    await act(settle)
    expect(host.querySelector('.video-coach-rpe')?.textContent).toContain('教练校准 @9')

    click(buttonWithText(host, '清除校准'))
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
    click(host.querySelector('[aria-label="下一条视频"]'))
    await act(settle)

    setSelect(host.querySelector<HTMLSelectElement>('[aria-label="教练校准 RPE"]')!, '8')
    expect(host.querySelector('.video-coach-rpe')?.textContent).toContain('教练校准 @8')
    await act(async () => {
      reject(new Error('backend unavailable'))
      await settle()
    })

    expect(host.querySelector('.video-coach-rpe')?.textContent).toContain('教练校准 @9')
    expect(host.querySelector('.video-rpe-error')?.textContent).toBe('RPE 校准失败，已恢复原值')
    expect(host.querySelector<HTMLSelectElement>('[aria-label="教练校准 RPE"]')?.value).toBe('9')
  })

  it('hides calibration controls when the video has no set log', async () => {
    await renderHarness()
    click(host.querySelectorAll('.video-master-row')[2]!)
    await act(settle)

    expect(host.querySelector('.video-student-rpe')?.textContent).toContain('学员自报 未填')
    expect(host.querySelector('[aria-label="教练校准 RPE"]')).toBeNull()
    expect(buttonWithText(host, '清除校准')).toBeNull()
  })

  it('resets calibration state on switch and ignores the previous video response', async () => {
    let release = (_value: { set_log_id: string; coach_rpe: string | null }) => {}
    api.patchCoachRpe.mockImplementation(() =>
      new Promise((resolve) => { release = resolve }))
    await renderHarness()

    setSelect(host.querySelector<HTMLSelectElement>('[aria-label="教练校准 RPE"]')!, '6.5')
    expect(host.querySelector('.video-coach-rpe')?.textContent).toContain('教练校准 @6.5')
    click(host.querySelector('[aria-label="下一条视频"]'))
    await act(settle)
    expect(host.querySelector('.video-coach-rpe')?.textContent).toContain('教练校准 @9')
    expect(host.querySelector<HTMLSelectElement>('[aria-label="教练校准 RPE"]')?.value).toBe('9')

    await act(async () => {
      release({ set_log_id: 'log-1', coach_rpe: '6.5' })
      await settle()
    })
    expect(host.querySelector('.video-detail-head')?.textContent).toContain('卧推')
    expect(host.querySelector('.video-coach-rpe')?.textContent).toContain('教练校准 @9')
    expect(host.querySelector<HTMLSelectElement>('[aria-label="教练校准 RPE"]')?.value).toBe('9')
  })

  it('keeps boundary controls in place and isolates navigation keys from feedback', async () => {
    await renderHarness()
    const previous = host.querySelector<HTMLButtonElement>('[aria-label="上一条视频"]')
    const next = host.querySelector<HTMLButtonElement>('[aria-label="下一条视频"]')
    expect(previous?.disabled).toBe(true)
    expect(next?.disabled).toBe(false)
    expect(host.querySelector('.video-detail-head')?.textContent).toContain('深蹲')

    const feedback = host.querySelector<HTMLTextAreaElement>('.video-feedback textarea')!
    feedback.focus()
    act(() => feedback.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })))
    expect(host.querySelector('.video-detail-head')?.textContent).toContain('深蹲')

    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })))
    await act(settle)
    expect(host.querySelector('.video-detail-head')?.textContent).toContain('卧推')
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })))
    await act(settle)
    expect(host.querySelector<HTMLButtonElement>('[aria-label="下一条视频"]')?.disabled).toBe(true)
  })

  it('leaves arrow keys to the video element so scrubbing is not hijacked', async () => {
    await renderHarness()
    const video = host.querySelector('video')!
    act(() => video.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })))
    await act(settle)
    expect(host.querySelector('.video-detail-head')?.textContent).toContain('深蹲')
  })

  it('toggles playback with Space while exempting inputs and the focused video element', async () => {
    await renderHarness()
    const video = host.querySelector<HTMLVideoElement>('video')!
    Object.defineProperty(video, 'paused', { value: true, configurable: true })

    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })))
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1)

    const feedback = host.querySelector<HTMLTextAreaElement>('.video-feedback textarea')!
    feedback.focus()
    act(() => feedback.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })))
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1)

    act(() => video.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })))
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1)
  })

  it('releases the old media source synchronously on switch and again on unmount', async () => {
    await renderHarness()
    const firstVideo = host.querySelector<HTMLVideoElement>('video')!
    expect(firstVideo.getAttribute('src')).toBe('https://example.test/video-1')

    click(host.querySelector('[aria-label="下一条视频"]'))

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

  it('a successful URL renewal keeps the freshly signed src on the same element', async () => {
    await renderHarness()
    const video = host.querySelector<HTMLVideoElement>('video')!
    expect(video.getAttribute('src')).toBe('https://example.test/video-1')

    api.getUploadUrl.mockImplementation((id: string) =>
      Promise.resolve({ url: `https://example.test/${id}-renewed`, expires_in: 60 }))
    await act(async () => {
      video.dispatchEvent(new Event('error', { bubbles: false }))
      await settle()
    })

    const renewed = host.querySelector<HTMLVideoElement>('video')!
    expect(renewed.getAttribute('src')).toBe('https://example.test/video-1-renewed')
  })

  it('a failed URL renewal unmounts the dead player and surfaces the error text', async () => {
    await renderHarness()
    const video = host.querySelector<HTMLVideoElement>('video')!
    api.getUploadUrl.mockRejectedValue(new Error('expired'))
    await act(async () => {
      video.dispatchEvent(new Event('error', { bubbles: false }))
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

    click(host.querySelector('[aria-label="下一条视频"]'))
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

  it('updates the marker list immediately after a successful POST and Esc cancels the inline editor', async () => {
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
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
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
    click(host.querySelector('[aria-label="下一条视频"]'))
    await act(settle)
    expect(host.querySelector('.video-detail-head')?.textContent).toContain('卧推')
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
