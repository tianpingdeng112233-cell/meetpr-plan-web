import { useRef, useState } from 'react'
import { requestPasswordReset, resetPassword } from '../../api/password-reset'
import { ApiException } from '../../api/client'
import { S } from '../../i18n/strings'
import { isValidLoginEmail } from './validation'
import './auth-recovery.css'

interface Props {
  initialEmail: string
  onBack: () => void
  onSuccess: (email: string) => void
}

export function ForgotPasswordScreen({ initialEmail, onBack, onSuccess }: Props) {
  const [email, setEmail] = useState(initialEmail)
  const [sent, setSent] = useState(false)
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (submitting.current) return
    if (!isValidLoginEmail(email)) { setError(S.auth.recoveryEmail); return }
    if (sent) {
      if (!/^\d{6}$/.test(code)) { setError(S.auth.invalidResetInput); return }
      if (Array.from(password).length < 8 || new TextEncoder().encode(password).length > 72) {
        setError(S.auth.invalidPassword); return
      }
      if (password !== confirmation) { setError(S.auth.passwordMismatch); return }
    }
    submitting.current = true; setBusy(true); setError('')
    try {
      if (sent) {
        await resetPassword(email.trim(), code, password)
        onSuccess(email.trim())
      } else {
        await requestPasswordReset(email.trim())
        setSent(true)
      }
    } catch (failure) {
      setError(failure instanceof ApiException
        ? failure.code === 'AUTH_INVALID_RESET_CODE' ? S.auth.invalidResetCode
          : failure.status === 429 ? S.auth.rateLimited
            : failure.code === 'VALIDATION_ERROR' ? S.auth.resetValidationError : S.auth.backendUnavailable
        : S.auth.backendUnavailable)
    }
    finally { submitting.current = false; setBusy(false) }
  }
  return <main className="auth-recovery-page">
    <form className="auth-recovery-form" onSubmit={submit} noValidate>
      <h1>{sent ? S.auth.resetTitle : S.auth.forgotTitle}</h1>
      <p role={sent ? 'status' : undefined}>{sent ? S.auth.resetSent : S.auth.forgotSubtitle}</p>
      {sent ? <div key="code-step">
        <label htmlFor="reset-code">{S.auth.resetCode}</label>
        <input id="reset-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder={S.auth.resetCodePlaceholder}
          value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} disabled={busy} />
        <label htmlFor="reset-password">{S.auth.newPassword}</label>
        <input id="reset-password" type="password" autoComplete="new-password" placeholder={S.auth.newPasswordPlaceholder}
          value={password} onChange={event => setPassword(event.target.value)} disabled={busy} aria-describedby="reset-password-hint" />
        <p id="reset-password-hint">{S.auth.passwordHelper}</p>
        <label htmlFor="reset-confirm">{S.auth.confirmPassword}</label>
        <input id="reset-confirm" type="password" autoComplete="new-password" placeholder={S.auth.confirmPlaceholder}
          value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={busy} />
      </div> : <div key="email-step">
        <label htmlFor="reset-email">{S.auth.accountLabel}</label>
        <input id="reset-email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false}
          value={email} onChange={event => setEmail(event.target.value)} disabled={busy} />
      </div>}
      {error && <p className="auth-recovery-error" role="alert">{error}</p>}
      <button className="auth-recovery-primary" type="submit" disabled={busy}>{busy ? S.auth.recoveryBusy : sent ? S.auth.resetButton : S.auth.sendCode}</button>
      {sent && <button className="auth-recovery-link" type="button" disabled={busy} onClick={() => {
        setSent(false); setCode(''); setPassword(''); setConfirmation(''); setError('')
      }}>{S.auth.resendCode}</button>}
      <button className="auth-recovery-link" type="button" disabled={busy} onClick={onBack}>{S.auth.backToLogin}</button>
    </form>
  </main>
}
