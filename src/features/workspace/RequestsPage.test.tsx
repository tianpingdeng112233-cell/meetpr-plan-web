import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { InviteCode } from '../../api/types'
import { RequestsPage } from './RequestsPage'

const api = vi.hoisted(() => ({
  acceptBindRequest: vi.fn(),
  getInviteCodes: vi.fn(),
  rejectBindRequest: vi.fn(),
}))

vi.mock('../../api/coach', () => api)

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const inviteCode: InviteCode = {
  id: 'invite',
  code: 'YLS72NJERE',
  type: 'personal_permanent',
  revoked_at: null,
  expires_at: null,
  max_uses: null,
  used_count: 0,
}

describe('RequestsPage', () => {
  let host: HTMLDivElement
  let root: Root
  let clipboardDescriptor: PropertyDescriptor | undefined

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    api.getInviteCodes.mockResolvedValue([inviteCode])
    clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.restoreAllMocks()
    if (clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', clipboardDescriptor)
    else Reflect.deleteProperty(navigator, 'clipboard')
  })

  it('copies the personal invite code through Clipboard API and emits a toast', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    const toast = vi.fn()
    window.addEventListener('meetpr:toast', toast)

    await act(async () => {
      root.render(<RequestsPage requests={[]} onRequestsChanged={vi.fn()} onAccepted={vi.fn()} />)
      await Promise.resolve()
    })
    const copy = [...host.querySelectorAll('button')].find((button) => button.textContent === '复制')
    await act(async () => {
      copy?.click()
      await Promise.resolve()
    })

    expect(writeText).toHaveBeenCalledWith('YLS72NJERE')
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ detail: '邀请码已复制' }))
    expect(copy?.textContent).toBe('已复制')
    window.removeEventListener('meetpr:toast', toast)
  })

  it.each(['missing', 'rejected'] as const)(
    'emits the fallback toast when Clipboard API is %s',
    async (mode) => {
      const writeText = vi.fn().mockRejectedValue(new Error('clipboard blocked'))
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: mode === 'missing' ? undefined : { writeText },
      })
      const toast = vi.fn()
      window.addEventListener('meetpr:toast', toast)

      await act(async () => {
        root.render(<RequestsPage requests={[]} onRequestsChanged={vi.fn()} onAccepted={vi.fn()} />)
        await Promise.resolve()
      })
      const copy = [...host.querySelectorAll('button')].find((button) => button.textContent === '复制')
      await act(async () => {
        copy?.click()
        await Promise.resolve()
      })

      if (mode === 'rejected') expect(writeText).toHaveBeenCalledWith('YLS72NJERE')
      else expect(writeText).not.toHaveBeenCalled()
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ detail: '复制失败，请手动复制邀请码' }))
      expect(copy?.textContent).toBe('复制')
      window.removeEventListener('meetpr:toast', toast)
    },
  )
})
