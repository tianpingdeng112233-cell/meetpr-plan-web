import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChangePasswordDialog, PASSWORD_CHANGED_NOTICE } from './ChangePasswordDialog'
import { ApiException } from '../../api/client'
import { isReloadBlocked } from '../../reloadSafety'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const changePassword = vi.hoisted(() => vi.fn())
const logout = vi.hoisted(() => vi.fn())
const setLoginNotice = vi.hoisted(() => vi.fn())

vi.mock('../../api/auth', () => ({ changePassword, logout, setLoginNotice }))

const flush = () => act(async () => { await Promise.resolve() })

function fill(value: string, index: number) {
  const input = document.querySelectorAll<HTMLInputElement>('[role=dialog] input')[index]
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function click(label: string) {
  const button = [...document.querySelectorAll<HTMLButtonElement>('[role=dialog] button')]
    .find((b) => b.textContent?.trim() === label)
  act(() => { button!.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
}

function fillValidForm() {
  fill('old-pass-1', 0)
  fill('new-pass-12', 1)
  fill('new-pass-12', 2)
}

describe('ChangePasswordDialog', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    changePassword.mockReset()
    logout.mockReset()
    setLoginNotice.mockReset()
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  const render = (
    { onSessionInvalidated = vi.fn(), onClose = vi.fn(), onBeforeSubmit }: {
      onSessionInvalidated?: ReturnType<typeof vi.fn>
      onClose?: ReturnType<typeof vi.fn>
      onBeforeSubmit?: () => Promise<boolean>
    } = {},
  ) => {
    const draw = (open: boolean) => act(() => root.render(
      <ChangePasswordDialog
        open={open}
        onClose={onClose}
        onSessionInvalidated={onSessionInvalidated}
        onBeforeSubmit={onBeforeSubmit}
      />,
    ))
    draw(true)
    return { onSessionInvalidated, onClose, draw }
  }

  it('renders into document.body so the top bar cannot trap it in a stacking context', () => {
    render()
    expect(isReloadBlocked()).toBe(true)
    const dialog = document.querySelector('[role=dialog]')
    expect(dialog?.parentElement).toBe(document.body)
    expect(host.contains(dialog)).toBe(false)
  })

  it('rejects a too-short new password locally without calling the API', async () => {
    render()
    fill('old-pass-1', 0)
    fill('short', 1)
    fill('short', 2)
    click('确认修改')
    await flush()
    expect(changePassword).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('新密码至少 8 位')
  })

  it('settles unsaved work before sending, and aborts untouched if the coach backs out', async () => {
    const onBeforeSubmit = vi.fn().mockResolvedValue(false)
    const { onSessionInvalidated } = render({ onBeforeSubmit })
    fillValidForm()
    click('确认修改')
    await flush()

    expect(onBeforeSubmit).toHaveBeenCalled()
    // Backing out of the unsaved-changes guard must leave the password, the
    // session and the draft mirrors exactly as they were.
    expect(changePassword).not.toHaveBeenCalled()
    expect(logout).not.toHaveBeenCalled()
    expect(onSessionInvalidated).not.toHaveBeenCalled()
    expect(document.querySelector('[role=dialog]')).not.toBeNull()
  })

  it('runs the guard before the request, never after', async () => {
    const order: string[] = []
    const onBeforeSubmit = vi.fn(async () => { order.push('guard'); return true })
    changePassword.mockImplementation(async () => { order.push('put') })
    render({ onBeforeSubmit })
    fillValidForm()
    click('确认修改')
    await flush()
    expect(order).toEqual(['guard', 'put'])
  })

  it('tears the session down immediately on success and hands the notice to the login screen', async () => {
    changePassword.mockResolvedValue(undefined)
    const { onSessionInvalidated } = render()
    fillValidForm()
    click('确认修改')
    await flush()

    expect(changePassword).toHaveBeenCalledWith('old-pass-1', 'new-pass-12')
    // No dead refresh token and no live draft writer may outlive the request,
    // so teardown must not wait on an acknowledgement.
    expect(setLoginNotice).toHaveBeenCalledWith(PASSWORD_CHANGED_NOTICE)
    expect(logout).toHaveBeenCalled()
    expect(onSessionInvalidated).toHaveBeenCalled()
  })

  it('does not keep the typed secrets in state after the dialog closes', async () => {
    changePassword.mockResolvedValue(undefined)
    const { draw } = render()
    fillValidForm()
    click('确认修改')
    await flush()

    // Reopen the same mounted component: surviving state would repopulate the
    // fields, which querying the closed dialog's removed DOM would never catch.
    draw(false)
    draw(true)
    const values = [...document.querySelectorAll<HTMLInputElement>('[role=dialog] input')]
      .map((i) => i.value)
    expect(values).toEqual(['', '', ''])
  })

  it('reports a wrong current password as a form error and keeps the session', async () => {
    changePassword.mockRejectedValue(new ApiException(403, 'PASSWORD_MISMATCH'))
    const { onSessionInvalidated } = render()
    fill('wrong-pass', 0)
    fill('new-pass-12', 1)
    fill('new-pass-12', 2)
    click('确认修改')
    await flush()
    expect(document.body.textContent).toContain('当前密码不对，请重新输入')
    expect(onSessionInvalidated).not.toHaveBeenCalled()
    expect(logout).not.toHaveBeenCalled()
  })

  it('takes the session-invalidated exit on 401 instead of showing a form error', async () => {
    changePassword.mockRejectedValue(new ApiException(401, 'AUTH_INVALID_TOKEN'))
    const { onSessionInvalidated } = render()
    fillValidForm()
    click('确认修改')
    await flush()
    expect(onSessionInvalidated).toHaveBeenCalled()
    expect(document.body.textContent).not.toContain('修改失败')
  })

  it('stays retryable after a network failure', async () => {
    changePassword.mockRejectedValueOnce(new Error('network down'))
    const { onSessionInvalidated } = render()
    fillValidForm()
    click('确认修改')
    await flush()
    expect(document.body.textContent).toContain('修改失败，请检查网络后重试')
    expect(onSessionInvalidated).not.toHaveBeenCalled()

    // The form must still be usable: a second attempt goes through.
    changePassword.mockResolvedValueOnce(undefined)
    click('确认修改')
    await flush()
    expect(changePassword).toHaveBeenCalledTimes(2)
    expect(onSessionInvalidated).toHaveBeenCalled()
  })

  it('closes on Escape while editing', () => {
    const { onClose } = render()
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })) })
    expect(onClose).toHaveBeenCalled()
  })
})
