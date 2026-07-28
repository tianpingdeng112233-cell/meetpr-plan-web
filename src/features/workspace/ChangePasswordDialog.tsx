import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { ApiException } from '../../api/client'
import { isSessionExpired } from '../../api/errors'
import { changePassword, logout, setLoginNotice } from '../../api/auth'
import { useGlobalKeyboardHandler } from './globalKeyboard'

export const PASSWORD_CHANGED_NOTICE = '密码已修改，请用新密码登录。其他已登录的设备也需要重新登录。'

const overlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 140,
  display: 'grid',
  placeItems: 'center',
  background: 'color-mix(in srgb, var(--bg) 68%, transparent)',
}

const panel: CSSProperties = {
  width: 430,
  maxWidth: 'calc(100vw - 32px)',
  boxSizing: 'border-box',
  borderRadius: 'var(--r-md)',
  border: '1px solid var(--border-strong)',
  background: 'var(--surface-2)',
  boxShadow: 'var(--elev-modal)',
  padding: 22,
  display: 'grid',
  gap: 'var(--sp-base)',
}

const secondaryButton: CSSProperties = {
  height: 36,
  padding: '0 14px',
  borderRadius: 'var(--r-md)',
  border: '1px solid var(--border-strong)',
  background: 'transparent',
  color: 'var(--fg-secondary)',
  font: 'inherit',
  fontWeight: 600,
  cursor: 'pointer',
}

const primaryButton: CSSProperties = {
  ...secondaryButton,
  borderColor: 'var(--fg-primary)',
  background: 'var(--fg-primary)',
  color: 'var(--bg)',
}

const field: CSSProperties = {
  height: 36,
  padding: '0 10px',
  borderRadius: 'var(--r-md)',
  border: '1px solid var(--border-strong)',
  background: 'var(--surface-1)',
  color: 'var(--fg-primary)',
  font: 'inherit',
  boxSizing: 'border-box',
  width: '100%',
}

export const MIN_PASSWORD_LENGTH = 8

/**
 * Local validation, mirrored from the iOS student client so both ends reject
 * the same inputs with the same wording before spending a round trip.
 * Returns null when the input is good enough to submit.
 */
export function passwordFormError(
  oldPassword: string,
  newPassword: string,
  confirmPassword: string,
): string | null {
  if (!oldPassword) return '请输入当前密码'
  if (newPassword.length < MIN_PASSWORD_LENGTH) return `新密码至少 ${MIN_PASSWORD_LENGTH} 位`
  if (newPassword !== confirmPassword) return '两次输入的新密码不一致'
  if (newPassword === oldPassword) return '新密码不能和当前密码相同'
  return null
}

/** Maps the backend's error codes onto wording a coach can act on. */
export function changePasswordErrorText(error: unknown): string {
  if (error instanceof ApiException) {
    if (error.code === 'PASSWORD_MISMATCH') return '当前密码不对，请重新输入'
    if (error.code === 'VALIDATION_ERROR') return `新密码至少 ${MIN_PASSWORD_LENGTH} 位`
  }
  return '修改失败，请检查网络后重试'
}

/**
 * Change-password dialog for the coach web app.
 *
 * Session handling is the delicate part, and the ordering matters. A successful
 * change revokes every refresh token server-side, this tab's included, so the
 * session is dead the moment the request returns 204 and unsaved work can no
 * longer be persisted. So the unsaved-changes guard runs BEFORE the request —
 * `onBeforeSubmit` flushes pending edits and lets the coach back out while
 * saving still works — and only afterwards do we tear the session down through
 * `onSessionInvalidated`, which must NOT be guarded: asking someone to save
 * work at that point would strand them in a session that is already gone.
 *
 * Teardown is immediate rather than waiting on an acknowledgement, so no dead
 * refresh token and no live draft writer outlive the request. The confirmation
 * travels to the login screen instead (see `setLoginNotice`).
 *
 * A 401 mid-flight means the client already gave up on refreshing, so it takes
 * the same exit instead of being reported as a form error.
 */
export function ChangePasswordDialog({ open, onClose, onSessionInvalidated, onBeforeSubmit }: {
  open: boolean
  onClose: () => void
  onSessionInvalidated: () => void | Promise<void>
  /** Unsaved-changes preflight; returning false aborts before anything is sent. */
  onBeforeSubmit?: () => Promise<boolean>
}) {
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const firstFieldRef = useRef<HTMLInputElement>(null)

  const forgetPasswords = () => {
    setOldPassword('')
    setNewPassword('')
    setConfirmPassword('')
  }

  useEffect(() => {
    if (!open) {
      // Do not keep the typed secrets in component state once the dialog is
      // dismissed — it stays mounted for the lifetime of the top bar.
      forgetPasswords()
      return
    }
    setSaving(false)
    setError('')
    firstFieldRef.current?.focus()
  }, [open])

  useGlobalKeyboardHandler(({ event }) => {
    if (!open || saving || event.key !== 'Escape') return false
    event.preventDefault()
    onClose()
    return true
  }, 200)

  if (!open) return null

  const leaveDeadSession = () => {
    forgetPasswords()
    void onSessionInvalidated()
  }

  const submit = async () => {
    const localError = passwordFormError(oldPassword, newPassword, confirmPassword)
    if (localError) { setError(localError); return }
    setSaving(true)
    setError('')
    // Settle unsaved work first: after the change lands, the session is gone
    // and nothing can be saved. Backing out here must leave everything intact.
    if (onBeforeSubmit && !(await onBeforeSubmit())) { setSaving(false); return }
    try {
      await changePassword(oldPassword, newPassword)
      // Every refresh token, ours included, is now revoked. Tear the session
      // down immediately — no dead token, no live draft writer left behind —
      // and let the login screen deliver the confirmation.
      setLoginNotice(PASSWORD_CHANGED_NOTICE)
      logout()
      leaveDeadSession()
    } catch (e) {
      if (isSessionExpired(e)) { leaveDeadSession(); return }
      setError(changePasswordErrorText(e))
      setSaving(false)
    }
  }

  // Portalled to <body>: the trigger lives inside the TopBar, which sets its own
  // z-index and therefore its own stacking context — rendering in place would
  // trap this overlay under anything layered above the bar (e.g. the sample
  // preview banner at z-index 50).
  return createPortal(
    <div style={overlay} role="dialog" aria-modal="true" aria-label="修改密码">
      <div style={panel}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>修改密码</div>

        <label style={{ display: 'grid', gap: 6, fontSize: 13, color: 'var(--fg-secondary)' }}>
          当前密码
          <input
            ref={firstFieldRef}
            type="password"
            autoComplete="current-password"
            value={oldPassword}
            disabled={saving}
            onChange={(e) => setOldPassword(e.target.value)}
            style={field}
          />
        </label>

        <label style={{ display: 'grid', gap: 6, fontSize: 13, color: 'var(--fg-secondary)' }}>
          新密码（至少 {MIN_PASSWORD_LENGTH} 位）
          <input
            type="password"
            autoComplete="new-password"
            value={newPassword}
            disabled={saving}
            onChange={(e) => setNewPassword(e.target.value)}
            style={field}
          />
        </label>

        <label style={{ display: 'grid', gap: 6, fontSize: 13, color: 'var(--fg-secondary)' }}>
          再输一次新密码
          <input
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            disabled={saving}
            onChange={(e) => setConfirmPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !saving) void submit() }}
            style={field}
          />
        </label>

        {error && <div style={{ color: 'var(--brand-red)', fontSize: 13 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" style={secondaryButton} disabled={saving} onClick={onClose}>取消</button>
          <button type="button" style={primaryButton} disabled={saving} onClick={() => { void submit() }}>
            {saving ? '提交中…' : '确认修改'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
