import { useEffect, useState } from 'react'
import { AuthRoleError, clearLoginNotice, emailLogin, login, peekLoginNotice } from '../../api/auth'
import { ApiException } from '../../api/client'
import type { AuthUser } from '../../api/types'
import { ForgotPasswordScreen } from './ForgotPasswordScreen'
import { isValidLoginEmail } from './validation'
import { S } from '../../i18n/strings'
import { text } from '../onboarding/text'

interface Props {
  onLogin: (user: AuthUser) => void
  onSampleMode?: () => void
  coachOnboarding?: boolean
}

const errMsg: Record<string, string> = {
  AUTH_INVALID_CREDENTIALS: S.auth.invalidPhoneCredentials,
  VALIDATION_ERROR: S.auth.enterValidPhoneCredentials,
}

const EMAIL_VALIDATION_ERROR = S.auth.enterValidEmailCredentials
const EMAIL_CREDENTIALS_ERROR = S.auth.invalidEmailCredentials
export { isValidLoginEmail } from './validation'

export function LoginScreen({ onLogin, onSampleMode, coachOnboarding = false }: Props) {
  const [recovering, setRecovering] = useState(false)
  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  // Handed over by a forced sign-out (e.g. a password change) that had nowhere
  // left to report success. Read (peek) and clear are split so StrictMode's
  // double-invoked effect is safe: a destructive read would blank the notice
  // on the second pass. We only clear once it is captured in state, and never
  // overwrite a captured notice with an empty second read.
  const [notice, setNotice] = useState('')
  useEffect(() => {
    const pending = peekLoginNotice()
    if (!pending) return
    setNotice(pending)
    clearLoginNotice()
  }, [])

  // Coach types the local number; we default the +86 country code.
  // A full international number (starting with +) is respected as-is.
  const toE164 = (input: string): string => {
    const t = input.trim()
    if (t.startsWith('+')) return t
    const digits = t.replace(/\D/g, '').replace(/^0+/, '')
    return `+86${digits}`
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const emailMode = account.includes('@')
    const email = account.trim()
    if (emailMode && !isValidLoginEmail(email)) {
      setErr(EMAIL_VALIDATION_ERROR)
      return
    }
    setErr(''); setBusy(true)
    try {
      const user = emailMode
        ? await emailLogin(email, password, 'coach')
        : await login(toE164(account), password, 'coach')
      onLogin(user)
    } catch (e2) {
      if (e2 instanceof AuthRoleError) {
        setErr(S.auth.coachOnly)
        setBusy(false)
        return
      }
      const code = e2 instanceof ApiException ? e2.code : 'NETWORK'
      const emailError = emailMode && e2 instanceof ApiException
        ? (e2.status === 401 ? EMAIL_CREDENTIALS_ERROR : code === 'VALIDATION_ERROR' ? EMAIL_VALIDATION_ERROR : null)
        : null
      setErr(emailError ?? errMsg[code] ?? (code === 'NETWORK' ? S.auth.backendUnavailable : S.auth.loginFailed(code)))
      setBusy(false)
    }
  }

  const field: React.CSSProperties = {
    width: '100%', padding: '11px 13px', background: 'var(--card-bg)',
    border: '1px solid var(--bd)', borderRadius: 'var(--r-md)', color: 'var(--txt)',
    fontSize: 15, fontFamily: 'var(--font-sans)', outline: 'none', boxSizing: 'border-box',
  }

  if (recovering) return <ForgotPasswordScreen initialEmail={account} onBack={() => setRecovering(false)} onSuccess={email => {
    setAccount(email); setPassword(''); setErr(''); setNotice(S.auth.passwordUpdated); setRecovering(false)
  }} />

  return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--page-bg)' }}>
      <form onSubmit={submit} style={{ width: 360, padding: 32, background: 'var(--card-bg)', border: '1px solid var(--bd)', borderRadius: 'var(--r-lg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <span style={{ width: 28, height: 28, borderRadius: 'var(--r-sm)', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, color: 'var(--white)', background: 'var(--ink)' }}>M</span>
          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--txt)' }}>MeetPR</span>
          <span className="t-mono-label" style={{ color: 'var(--ink)' }}>COACH</span>
        </div>
        <div style={{ color: 'var(--fg-tertiary)', fontSize: 13, marginBottom: 24 }}>{S.auth.title}</div>

        {coachOnboarding && <p style={{ color: 'var(--fg-secondary)', fontSize: 13, lineHeight: 1.6, marginBottom: 20 }}>{text('请使用申请内测时的邮箱和已设置的密码登录。登录后即可管理学员、编辑和发布计划。', 'Sign in with the email you used to apply for the beta and the password you set. Then manage students, edit and publish plans.')}</p>}

        {notice && (
          <div role="status" style={{
            marginBottom: 20, padding: '10px 12px', borderRadius: 'var(--r-md)',
            border: '1px solid var(--border-strong)', background: 'var(--surface-2)',
            color: 'var(--sec)', fontSize: 13, lineHeight: 1.6,
          }}>
            {notice}
          </div>
        )}

        <label htmlFor="login-account" style={{ display: 'block', fontSize: 12, color: 'var(--fg-secondary)', marginBottom: 6 }}>{S.auth.accountLabel}</label>
        <div style={{ ...field, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, padding: 0 }}>
          <input
            id="login-account"
            style={{ flex: 1, minWidth: 0, padding: '11px 13px', background: 'transparent', border: 'none', color: 'var(--txt)', fontSize: 15, fontFamily: 'var(--font-mono)', outline: 'none' }}
            value={account} onChange={(e) => setAccount(e.target.value)} inputMode="email" autoComplete="username" placeholder={S.auth.accountPlaceholder} autoCapitalize="none" spellCheck={false}
          />
        </div>

        <label style={{ display: 'block', fontSize: 12, color: 'var(--fg-secondary)', marginBottom: 6 }}>{S.common.password}</label>
        <input style={field} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder={S.common.password} />

        {err && <div style={{ color: 'var(--bad)', fontSize: 13, marginTop: 14 }}>{err}</div>}

        <button type="submit" disabled={busy || !account || !password} style={{
          width: '100%', marginTop: 22, padding: '12px', background: busy ? 'var(--tint)' : 'var(--ink)',
          color: busy ? 'var(--mut)' : 'var(--white)', border: 'none', borderRadius: 'var(--r-md)', fontWeight: 600, fontSize: 13,
          cursor: busy ? 'default' : 'pointer', opacity: (!account || !password) ? 0.5 : 1,
        }}>
          {busy ? S.common.signingIn : S.common.signIn}
        </button>

        <button type="button" className="auth-recovery-link" onClick={() => setRecovering(true)}>{S.auth.forgotLink}</button>

        {onSampleMode && <div onClick={onSampleMode} style={{ marginTop: 16, textAlign: 'center', color: 'var(--fg-tertiary)', fontSize: 12, cursor: 'pointer' }}>
          {S.auth.previewSample}
        </div>}
      </form>
    </div>
  )
}
