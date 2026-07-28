import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { ContextBar } from './ContextBar'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('selected context bar', () => {
  it('omits the duplicate copy/add actions while retaining the other selected-day controls', () => {
    const host = document.createElement('div')
    const root = createRoot(host)

    act(() => root.render(
      <ContextBar
        visible
        dayLabel="W02 · 周一"
        isRest={false}
        canCopyPrev
        hasLockedRows={false}
        copyLabel="⎘ 复制上周"
        copyDone={false}
        selectedRowLabel="当前行 · 深蹲"
        hasRowClipboard
        onCopyPrev={vi.fn()}
        onPasteRow={vi.fn()}
        onSetRest={vi.fn()}
        onUnsetRest={vi.fn()}
        onClearDay={vi.fn()}
        onClose={vi.fn()}
      />,
    ))

    expect(host.textContent).not.toContain('复制动作')
    expect(host.textContent).not.toContain('＋ 加动作')
    expect(host.textContent).toContain('复制上周')
    expect(host.textContent).toContain('粘贴动作')
    expect(host.textContent).toContain('设为休息')
    expect(host.textContent).toContain('清空本日')

    act(() => root.unmount())
  })
})
