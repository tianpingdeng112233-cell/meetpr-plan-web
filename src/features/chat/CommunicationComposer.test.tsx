import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, expect, it, vi } from 'vitest'
import { CommunicationComposer, type CommunicationDrafts } from './CommunicationComposer'
import { sendChatImage } from '../../api/uploads'
import { postCoachFeedback } from '../../api/coach'
import type { FeedbackEntry } from '../plan-editor/feedbackModel'
vi.mock('../../api/coach', () => ({ postCoachFeedback: vi.fn(async (payload) => ({ ...payload, id: 'f1', posted_at: '2026-11-12', read_at: null })) }))
vi.mock('../../api/uploads', () => ({ sendChatImage: vi.fn(), abortChatImage: vi.fn() }))
beforeEach(() => { vi.clearAllMocks() })
;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const entry: FeedbackEntry = { inPlan: true, week: 3, day: 1, video: { id: 'v1', filename: '', created_at: '2026-11-09', logged_at: null, set_log_id: null, plan_exercise_id: 'pe1', content_type: 'video/mp4', size_bytes: 1 } }
it('sends video text with Enter but preserves IME confirmation and Shift+Enter', async () => {
  function Harness() {
    const [drafts, setDrafts] = useState<CommunicationDrafts>({ 's:v1': { text: '膝盖方向', images: [] } })
    return <CommunicationComposer studentId="s" active={entry} drafts={drafts} setDrafts={setDrafts} disabled={false} conversationId="c" onConversationOpened={vi.fn()} onCancelVideo={vi.fn()} onFeedbackSent={vi.fn()} />
  }
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host)
  try {
    await act(async () => root.render(<Harness />))
    const input = host.querySelector('textarea')!
    for (const extra of [{ isComposing: true }, { keyCode: 229 }, { shiftKey: true }]) {
      await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, ...extra })))
    }
    expect(postCoachFeedback).not.toHaveBeenCalled()
    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    expect(postCoachFeedback).toHaveBeenCalledWith({ student_id: 's', video_id: 'v1', plan_exercise_id: 'pe1', day_date: '2026-11-09', text: '膝盖方向' })
    expect(input.value).toBe('')
    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    expect(postCoachFeedback).toHaveBeenCalledTimes(1)
  } finally { act(() => root.unmount()); host.remove() }
})


it('keeps drafts by student and video and retries only an image after text succeeded', async () => {
  const onSent = vi.fn(async () => {})
  const image = { blob: new Blob(['image'], { type: 'image/jpeg' }), session: { clientId: 'image-client' }, onSent }
  const create = URL.createObjectURL; const revoke = URL.revokeObjectURL
  URL.createObjectURL = vi.fn(() => 'blob:preview'); URL.revokeObjectURL = vi.fn()
  vi.mocked(sendChatImage).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ id: 'image', conversation_id: 'c', seq: 1, sender_id: 'coach', kind: 'image', body: null, attachment_id: 'a', client_id: 'image-client', image_url: '/image', image_expires_in: 60, set_ref: null, video_url: null, video_expires_in: null, created_at: '2026-11-12' })
  function Harness() {
    const [target, setTarget] = useState('v1')
    const [student, setStudent] = useState('s')
    const [drafts, setDrafts] = useState<CommunicationDrafts>({ 's:v1': { text: '视频一草稿', images: [image] }, 's:v2': { text: '视频二草稿', images: [] } })
    return <><button onClick={() => setTarget(target === 'v1' ? 'v2' : 'v1')}>switch video</button><button onClick={() => setStudent(student === 's' ? 'other' : 's')}>switch student</button>
      <CommunicationComposer studentId={student} active={{ ...entry, video: { ...entry.video, id: target } }} drafts={drafts} setDrafts={setDrafts} disabled={false} conversationId="c" onConversationOpened={vi.fn()} onCancelVideo={vi.fn()} onFeedbackSent={vi.fn()} /></>
  }
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host)
  try {
    await act(async () => root.render(<Harness />))
    const input = () => host.querySelector('textarea')!
    await act(async () => host.querySelector<HTMLButtonElement>('button')!.click())
    expect(input().value).toBe('视频二草稿'); expect(host.querySelector('img')).toBeNull()
    await act(async () => host.querySelector<HTMLButtonElement>('button')!.click())
    expect(input().value).toBe('视频一草稿'); expect(host.querySelector('img')).not.toBeNull()
    await act(async () => host.querySelectorAll<HTMLButtonElement>('button')[1].click())
    expect(input().value).toBe('')
    await act(async () => host.querySelectorAll<HTMLButtonElement>('button')[1].click())
    await act(async () => input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    expect(postCoachFeedback).toHaveBeenCalledTimes(1)
    expect(input().value).toBe(''); expect(host.querySelector('img')).not.toBeNull(); expect(host.querySelector('[role=alert]')).not.toBeNull()
    await act(async () => input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    expect(postCoachFeedback).toHaveBeenCalledTimes(1); expect(sendChatImage).toHaveBeenCalledTimes(2)
    expect(vi.mocked(sendChatImage).mock.calls[0][2]).toBe(vi.mocked(sendChatImage).mock.calls[1][2])
    expect(onSent).toHaveBeenCalledTimes(1); expect(host.querySelector('img')).toBeNull()
  } finally { act(() => root.unmount()); host.remove(); URL.createObjectURL = create; URL.revokeObjectURL = revoke }
})
