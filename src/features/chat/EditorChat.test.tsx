import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it } from 'vitest'
import type { AuthUser } from '../../api/types'
import { EditorChat } from './EditorChat'
import type { CommunicationDrafts } from './CommunicationComposer'
;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const me: AuthUser = { id: 'coach', phone: '', role: 'coach', createdAt: '2026-01-01' }
const noop = () => {}
it.each([false, true])('shows legacy feedback and composer without an inbox (loading=%s)', async loading => {
  function Harness() {
    const [drafts, setDrafts] = useState<CommunicationDrafts>({})
    return <EditorChat entries={[]} me={me} students={[{ id: 's', display_name: '甲', status: 'active', evaluation: null }]} selectedStudentId="s"
      conversations={loading ? null : []} bindLostIds={new Set()} sessionDead={false} activeId={null} drafts={{}}
      communicationDrafts={drafts} setCommunicationDrafts={setDrafts} readOnly={false}
      feedbackItems={[{ id: 'f1', student_id: 's', coach_id: 'coach', day_date: '2026-11-09', video_id: null, plan_exercise_id: null, text: '下周继续', posted_at: '2026-11-10T12:00:00Z', read_at: null }]}
      onCancelVideo={noop} onFeedbackSent={noop} onOpenEntry={noop}
      onActiveIdChange={noop} onStudentChange={noop} onOpenPlan={noop} onDraftChange={noop}
      onConversationsChanged={noop} onReadStateApplied={noop} onBindLost={noop} onSessionExpired={noop} />
  }
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host)
  try {
    await act(async () => root.render(<Harness />))
    expect(host.textContent).toContain('整日反馈 · 历史记录')
    expect(host.textContent).toContain('下周继续')
    expect(host.querySelectorAll('textarea')).toHaveLength(1)
    expect(host.querySelector('.editor-chat-window')).toBeNull()
  } finally { act(() => root.unmount()); host.remove() }
})
