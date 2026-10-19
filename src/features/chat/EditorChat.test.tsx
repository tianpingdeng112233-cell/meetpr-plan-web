import { act, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import type { AuthUser } from '../../api/types'
import { EditorChat } from './EditorChat'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const me: AuthUser = { id: 'coach', phone: '', role: 'coach', createdAt: '2026-01-01' }
const noop = () => {}

function Harness({ playerOpen }: { playerOpen: boolean }) {
  const editor = useRef<HTMLDivElement>(null)
  // The chat is a child of the element its ref points at, as in PlanWorkspace.
  return <div ref={editor}>
    <aside data-block-history="" />
    {playerOpen && <div className="history-player" />}
    <EditorChat entries={[]} editor={editor} open={false} onOpenChange={noop} me={me}
      students={[{ id: 's', display_name: '甲', status: 'active', evaluation: null }]} selectedStudentId="s"
      conversations={[]} bindLostIds={new Set()} sessionDead={false} activeId={null} drafts={{}}
      onActiveIdChange={noop} onStudentChange={noop} onOpenPlan={noop} onDraftChange={noop}
      onConversationsChanged={noop} onReadStateApplied={noop} onBindLost={noop} onSessionExpired={noop} />
  </div>
}

describe('EditorChat placement', () => {
  let root: Root | null = null
  let host: HTMLDivElement | null = null
  const original = Element.prototype.getBoundingClientRect
  afterEach(() => {
    act(() => root?.unmount()); host?.remove(); root = null; host = null
    Element.prototype.getBoundingClientRect = original
  })

  it('sits left of the history rail on first mount, then left of the portrait player once it opens', async () => {
    Element.prototype.getBoundingClientRect = function (this: Element) {
      const left = this.classList.contains('history-player') ? 600 : this.hasAttribute('data-block-history') ? 1000 : 0
      return { left, right: left, top: 0, bottom: 0, width: 0, height: 0, x: left, y: 0, toJSON: () => ({}) } as DOMRect
    }
    host = document.createElement('div'); document.body.append(host)
    root = createRoot(host)
    await act(async () => { root!.render(<Harness playerOpen={false} />) })
    const chat = () => host!.querySelector<HTMLElement>('.editor-chat')!
    expect(chat().style.right).toBe(`${window.innerWidth - 1000 + 20}px`)
    await act(async () => { root!.render(<Harness playerOpen />) })
    expect(chat().style.right).toBe(`${window.innerWidth - 600 + 20}px`)
  })
})
