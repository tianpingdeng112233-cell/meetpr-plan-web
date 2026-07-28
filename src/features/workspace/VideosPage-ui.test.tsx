import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StudentVideo } from '../../api/types'

const api = vi.hoisted(() => ({ getStudentVideos: vi.fn(), getUploadUrl: vi.fn(), postCoachFeedback: vi.fn() }))
vi.mock('../../api/coach', () => ({ getStudentVideos: api.getStudentVideos, getUploadUrl: api.getUploadUrl, postCoachFeedback: api.postCoachFeedback }))

import { VideosPage } from './VideosPage'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const videos: StudentVideo[] = [
  { id: 'video-1', set_log_id: 'log-1', plan_exercise_id: 'exercise-1', content_type: 'video/mp4', size_bytes: 1024, filename: 'one.mp4', created_at: '2026-07-18T08:00:00Z', logged_at: '2026-07-18T07:00:00Z', exercise_name: '深蹲', set_index: 1, weight_kg: '125', reps: 4 },
  { id: 'video-2', set_log_id: 'log-2', plan_exercise_id: null, content_type: 'video/mp4', size_bytes: 2048, filename: 'two.mp4', created_at: '2026-07-17T08:00:00Z', logged_at: null, exercise_name: '卧推', set_index: 2, weight_kg: null, reps: 5 },
  { id: 'video-3', set_log_id: null, plan_exercise_id: null, content_type: 'video/mp4', size_bytes: 4096, filename: 'three.mp4', created_at: '2026-07-16T08:00:00Z', logged_at: null, exercise_name: null, set_index: null },
]

async function settle(): Promise<void> { for (let index = 0; index < 4; index++) await Promise.resolve() }
const click = (element: Element | null) => act(() => element?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
const input = (element: HTMLInputElement, value: string) => act(() => { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set; setter?.call(element, value); element.dispatchEvent(new Event('input', { bubbles: true })) })

describe('VideosPage modal interactions', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(async () => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    api.getStudentVideos.mockResolvedValue(videos)
    api.getUploadUrl.mockImplementation((id: string) => Promise.resolve({ url: `https://example.test/${id}`, expires_in: 60 }))
    api.postCoachFeedback.mockResolvedValue({})
    await act(async () => { root.render(<VideosPage students={[]} studentId="student-1" onStudent={vi.fn()} />); await settle() })
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.clearAllMocks()
  })

  it('keeps boundary controls in place and isolates navigation keys from the feedback input', async () => {
    click(host.querySelector('.video-tiles button'))
    await act(settle)
    const prev = host.querySelector<HTMLButtonElement>('.video-nav.prev'), next = host.querySelector<HTMLButtonElement>('.video-nav.next')
    expect(prev?.disabled).toBe(true)
    expect(next?.disabled).toBe(false)
    expect(host.querySelector('.video-modal header')?.textContent).toContain('深蹲 · 第 1 组')

    const feedback = host.querySelector<HTMLInputElement>('.video-feedback input')!
    feedback.focus()
    act(() => feedback.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })))
    expect(host.querySelector('.video-modal header')?.textContent).toContain('深蹲 · 第 1 组')

    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })))
    await act(settle)
    expect(host.querySelector('.video-modal header')?.textContent).toContain('卧推 · 第 2 组')
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })))
    await act(settle)
    expect(host.querySelector<HTMLButtonElement>('.video-nav.next')?.disabled).toBe(true)

    act(() => feedback.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(host.querySelector('.video-modal')).not.toBeNull()
    expect(document.activeElement).not.toBe(feedback)

    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(host.querySelector('.video-modal')).toBeNull()
  })

  it('leaves arrow keys to the video element so scrubbing is not hijacked', async () => {
    click(host.querySelector('.video-tiles button'))
    await act(settle)
    const video = host.querySelector('.video-modal video')!
    act(() => video.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })))
    await act(settle)
    expect(host.querySelector('.video-modal header')?.textContent).toContain('深蹲 · 第 1 组')
  })

  it('renews the signed URL once after a playback error and replaces the video URL', async () => {
    api.getUploadUrl
      .mockResolvedValueOnce({ url: 'https://example.test/old', expires_in: 60 })
      .mockResolvedValueOnce({ url: 'https://example.test/renewed', expires_in: 60 })
    click(host.querySelector('.video-tiles button'))
    await act(settle)
    const video = host.querySelector<HTMLVideoElement>('.video-modal video')!
    expect(video.src).toBe('https://example.test/old')

    await act(async () => { video.dispatchEvent(new Event('error')); await settle() })

    expect(api.getUploadUrl).toHaveBeenCalledTimes(2)
    expect(api.getUploadUrl).toHaveBeenNthCalledWith(2, 'video-1')
    expect(host.querySelector<HTMLVideoElement>('.video-modal video')?.src)
      .toBe('https://example.test/renewed')
  })

  it('shows the renewal failure copy when signing after a playback error fails', async () => {
    api.getUploadUrl
      .mockResolvedValueOnce({ url: 'https://example.test/old', expires_in: 60 })
      .mockRejectedValueOnce(new Error('signing failed'))
    click(host.querySelector('.video-tiles button'))
    await act(settle)
    const video = host.querySelector<HTMLVideoElement>('.video-modal video')!

    await act(async () => { video.dispatchEvent(new Event('error')); await settle() })

    expect(api.getUploadUrl).toHaveBeenCalledTimes(2)
    expect(api.getUploadUrl).toHaveBeenNthCalledWith(2, 'video-1')
    expect(host.querySelector('.video-loading')?.textContent)
      .toBe('视频链接已过期，续签失败')
  })

  it('does not wipe a draft rewritten while the previous send was still in flight', async () => {
    let release = () => {}
    api.postCoachFeedback.mockImplementation(() => new Promise<void>((resolve) => { release = () => resolve() }))
    click(host.querySelector('.video-tiles button'))
    await act(settle)
    const feedback = host.querySelector<HTMLInputElement>('.video-feedback input')!
    input(feedback, '第一段')
    click([...host.querySelectorAll('.video-feedback button')].find((button) => button.textContent === '发送') ?? null)
    input(feedback, '第二段')
    await act(async () => { release(); await settle() })
    expect(host.querySelector<HTMLInputElement>('.video-feedback input')?.value).toBe('第二段')
    // 草稿已被改写 → 按钮必须回到「发送」,不能谎报「已发送 ✓」害教练以为第二段发出去了。
    expect(host.querySelector('.video-feedback button')?.textContent).toBe('发送')
  })

  it('ignores a stale video list that resolves after the coach switched students', async () => {
    let releaseStale = () => {}
    const stale: StudentVideo[] = [{ ...videos[0]!, id: 'stale-1', exercise_name: '上一个学员的深蹲' }]
    api.getStudentVideos.mockImplementationOnce(() => new Promise((resolve) => { releaseStale = () => resolve(stale) }))
    await act(async () => { root.render(<VideosPage students={[]} studentId="student-2" onStudent={vi.fn()} />); await settle() })
    await act(async () => { root.render(<VideosPage students={[]} studentId="student-3" onStudent={vi.fn()} />); await settle() })
    await act(async () => { releaseStale(); await settle() })
    expect(host.textContent).not.toContain('上一个学员的深蹲')
  })

  it('posts the video-scoped payload and resets draft, send state, and speed when switching', async () => {
    api.postCoachFeedback.mockImplementation(() => new Promise(() => {}))
    click(host.querySelector('.video-tiles button'))
    await act(settle)
    click([...host.querySelectorAll('.video-modal footer button')].find((button) => button.textContent === '2×') ?? null)
    const feedback = host.querySelector<HTMLInputElement>('.video-feedback input')!
    input(feedback, '  膝盖继续向外推  ')
    click([...host.querySelectorAll('.video-feedback button')].find((button) => button.textContent === '发送') ?? null)
    expect(api.postCoachFeedback).toHaveBeenCalledWith({ student_id: 'student-1', day_date: '2026-07-18', plan_exercise_id: 'exercise-1', video_id: 'video-1', text: '膝盖继续向外推' })
    expect(host.querySelector('.video-feedback button')?.textContent).toBe('发送中…')

    click(host.querySelector('.video-nav.next'))
    await act(settle)
    expect(host.querySelector<HTMLInputElement>('.video-feedback input')?.value).toBe('')
    expect(host.querySelector('.video-feedback button')?.textContent).toBe('发送')
    expect([...host.querySelectorAll('.video-modal footer button')].find((button) => button.textContent === '1×')?.classList.contains('active')).toBe(true)
  })

  it('keeps the written feedback when sending fails', async () => {
    api.postCoachFeedback.mockRejectedValue(new Error('backend unavailable'))
    click(host.querySelector('.video-tiles button'))
    await act(settle)
    const feedback = host.querySelector<HTMLInputElement>('.video-feedback input')!
    input(feedback, '不要丢掉这段反馈')
    await act(async () => { feedback.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true })); await settle() })
    expect(feedback.value).toBe('不要丢掉这段反馈')
    expect(host.querySelector('.video-feedback em')?.textContent).toBe('反馈发送失败，请稍后重试')
  })
})
