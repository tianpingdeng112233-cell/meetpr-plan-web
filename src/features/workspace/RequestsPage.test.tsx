// SPEC 019 moves the former request-page invitation controls into the overview.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RequestsPanel } from './RequestsPage'
import type { CoachBindRequest } from '../../api/types'
import { setLocale } from '../../i18n/strings'
import { OverviewInvite } from './OverviewInvite'
import { invitationMessage } from '../onboarding/CoachWelcomePage'
const boundary = vi.hoisted(() => ({ request: vi.fn(), getInviteCodes: vi.fn(), getPublicInvite: vi.fn() }))
vi.mock('../../api/client', async original => ({ ...await original<typeof import('../../api/client')>(), request: boundary.request }))
vi.mock('../../api/invite', async original => ({ ...await original<typeof import('../../api/invite')>(), getInviteCodes: boundary.getInviteCodes }))
vi.mock('../../api/onboarding', () => ({ getPublicInvite: boundary.getPublicInvite }))
;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('Overview invitation (moved from RequestsPage)', () => {
  let host: HTMLDivElement, root: Root
  beforeEach(() => {
    host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
    boundary.request.mockResolvedValue({ user: { email: 'coach@example.test', role: 'coach' } })
    boundary.getInviteCodes.mockResolvedValue([{ code: 'YLS72NJERE', type: 'personal_permanent', revoked_at: null }])
    boundary.getPublicInvite.mockResolvedValue({ valid: true, coach_display_name: '李教练' })
  })
  afterEach(() => { act(() => root.unmount()); host.remove(); setLocale('zh'); vi.restoreAllMocks(); Reflect.deleteProperty(navigator, 'clipboard') })
  async function render() { await act(async () => { root.render(<OverviewInvite />); for (let i = 0; i < 20; i++) await Promise.resolve() }) }
  function copy(label = '复制邀请消息') { return [...host.querySelectorAll('button')].find(button => button.textContent === label)! }
  it('copies the same complete invitation as welcome and also copies its link', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    await render()
    await act(async () => copy().click())
    const link = `${location.origin}/i/YLS72NJERE`
    expect(writeText).toHaveBeenCalledWith(invitationMessage(link, 'YLS72NJERE', '李教练'))
    expect(host.querySelector('[role="status"]')?.textContent).toContain('邀请消息已复制')
    await act(async () => copy('复制链接').click())
    expect(writeText).toHaveBeenLastCalledWith(link)
    expect(host.querySelector('img[alt="学员邀请二维码"]')?.getAttribute('src')).toMatch(/^data:image\/svg\+xml/)
    expect(host.querySelector('a[download]')?.getAttribute('download')).toBe('meetpr-invite.svg')
  })
  it.each([
    ['zh', '复制链接', '链接已复制'],
    ['en', 'Copy link', 'Link copied'],
    ['zh-Hant', '複製連結', '連結已複製'],
  ] as const)('019 R1 gives link-specific copy feedback in %s', async (locale, label, feedback) => {
    setLocale(locale)
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    await render()
    await act(async () => copy(label).click())
    expect(writeText).toHaveBeenCalledWith(`${location.origin}/i/YLS72NJERE`)
    expect(host.querySelector('[role="status"]')?.textContent).toBe(feedback)
  })
  it.each(['missing', 'rejected'] as const)('shows the manual-copy fallback when Clipboard API is %s', async mode => {
    const writeText = vi.fn().mockRejectedValue(new Error('clipboard blocked'))
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: mode === 'missing' ? undefined : { writeText } })
    Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn(() => false) })
    await render()
    await act(async () => copy().click())
    const message = invitationMessage(`${location.origin}/i/YLS72NJERE`, 'YLS72NJERE', '李教练')
    if (mode === 'rejected') expect(writeText).toHaveBeenCalledWith(message)
    else expect(writeText).not.toHaveBeenCalled()
    expect(host.querySelector('[role="status"]')?.textContent).toContain('无法自动复制')
    expect(host.querySelector('details')?.textContent).toContain(message)
  })
})


describe('RequestsPanel', () => {
  it('019 R1 hides the zero count and updates it as requests arrive and leave', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const request: CoachBindRequest = {
      id: 'request', student_id: 'student', display_name: '学员',
      submitted_at: '2026-10-22T10:00:00Z', expired_at: '2026-10-29T10:00:00Z',
      masked_phone: '139****0000', invite_code: 'INVITE',
      onboarding: { completed: true, upload_count: 0, deadlift_style: null },
    }
    const render = async (requests: CoachBindRequest[]) => {
      await act(async () => root.render(<RequestsPanel requests={requests} onRequestsChanged={() => {}} onAccepted={() => {}} />))
    }
    try {
      await render([])
      expect(host.querySelector('.requests-count')).toBeNull()
      expect(host.textContent).toContain('暂无新申请')
      await render([request])
      expect(host.querySelector('.requests-count')?.textContent).toBe('1 条')
      await render([])
      expect(host.querySelector('.requests-count')).toBeNull()
    } finally {
      act(() => root.unmount())
      host.remove()
    }
  })
})
