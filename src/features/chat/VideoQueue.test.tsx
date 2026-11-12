import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { VideoQueue } from './VideoQueue'
import type { FeedbackEntry } from '../plan-editor/feedbackModel'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
it('shows two clips, expands on hover, retains viewed clips, and pages by date', async () => {
  const entries: FeedbackEntry[] = Array.from({ length: 9 }, (_, i) => ({ inPlan: true, week: 3, day: 1, video: {
    id: `v${i}`, filename: '', set_log_id: null, plan_exercise_id: null, content_type: 'video/mp4', size_bytes: 1,
    created_at: i === 8 ? '2026-11-08' : '2026-11-09', logged_at: null, exercise_name: '深蹲', set_index: i,
    viewed_at: i === 0 ? '2026-11-10' : null,
  } }))
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host)
  const open = vi.fn()
  try {
    await act(async () => root.render(<VideoQueue entries={entries} activeId="v0" onOpen={open} />))
    expect(host.querySelectorAll('[data-feedback-video]')).toHaveLength(2)
    expect(host.querySelector('[data-feedback-video="v0"]')?.textContent).toContain('已看')
    const expand = host.querySelector('.video-queue-expand')!
    await act(async () => expand.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })))
    expect(host.querySelectorAll('[data-feedback-video]')).toHaveLength(8)
    await act(async () => host.querySelector<HTMLButtonElement>('[data-feedback-video="v3"]')!.click())
    expect(open).toHaveBeenCalledWith(entries[3])
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="前一天"]')!.click())
    expect(host.querySelectorAll('[data-feedback-video]')).toHaveLength(1)
    expect(host.querySelector('[data-feedback-video="v8"]')).not.toBeNull()
  } finally { act(() => root.unmount()); host.remove() }
})
