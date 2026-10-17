import { useEffect, useState, type FormEvent } from 'react'
import { emailLogin } from '../../api/auth'
import { resendCoachApplication, setCoachPassword } from '../../api/onboarding'
import { OnboardingFrame } from './OnboardingPages'
import { text, errorText } from './text'
import { trackOnboarding } from './telemetry'

export function SetCoachPasswordPage({ navigate = (url: string) => window.location.assign(url) }: { navigate?: (url: string) => void }) {
  const [link] = useState(() => {
    const params = new URLSearchParams(location.hash.slice(1))
    return { email: params.get('email') ?? '', token: params.get('token') ?? '' }
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [expired, setExpired] = useState(false)
  const [saved, setSaved] = useState(false)
  const [resent, setResent] = useState(false)
  useEffect(() => { history.replaceState(history.state, '', location.pathname + location.search) }, [])
  const validLink = /^[a-f0-9]{64}$/i.test(link.token) && link.email.includes('@')
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError('')
    const fields = new FormData(e.currentTarget)
    const password = String(fields.get('password'))
    const bytes = new TextEncoder().encode(password).length
    if (password.length < 8 || bytes > 72) { setError(text('密码至少 8 个字符、最多 72 字节（中文等字符会占多个字节）。', 'Use at least 8 characters and at most 72 UTF-8 bytes.')); return }
    if (password !== fields.get('confirm')) { setError(text('两次输入的密码不一致。', 'The passwords do not match.')); return }
    setBusy(true)
    try {
      await setCoachPassword(link.email, link.token, password)
      setSaved(true); trackOnboarding('coach_password_set')
      await emailLogin(link.email, password, 'coach')
      navigate('/coach/welcome')
    } catch (err) {
      setError(errorText(err))
      if (err && typeof err === 'object' && 'code' in err && err.code === 'AUTH_INVALID_RESET_CODE') setExpired(true)
    } finally { setBusy(false) }
  }
  async function retrySignIn(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(''); setBusy(true)
    const password = String(new FormData(e.currentTarget).get('signInPassword'))
    try {
      // The setup token is already consumed. Authenticate its target email again;
      // never reuse an unrelated coach/admin session left in this browser.
      await emailLogin(link.email, password, 'coach')
      navigate('/coach/welcome')
    } catch (err) { setError(errorText(err)) } finally { setBusy(false) }
  }
  async function resend() {
    setBusy(true); setError('')
    try { await resendCoachApplication(link.email); setResent(true) } catch (err) { setError(errorText(err)) } finally { setBusy(false) }
  }
  return <OnboardingFrame title={text('设置你的登录密码', 'Set your password')}>
    {saved ? <><p role="status">{text('密码已设置。请使用邮箱和新密码登录。', 'Your password is set. Sign in with your email and new password.')}</p><p><strong>{link.email}</strong></p><form onSubmit={retrySignIn} className="onboarding-form"><label>{text('登录密码', 'Password')}<input name="signInPassword" type="password" autoComplete="current-password" required /></label><button className="onboarding-primary" disabled={busy}>{busy ? text('正在登录…', 'Signing in…') : text('继续登录', 'Continue to sign in')}</button></form></>
      : !validLink ? <p role="alert">{text('设密码链接不完整，请打开欢迎邮件中的完整链接。', 'This setup link is incomplete. Open the full link in your welcome email.')}</p>
        : <><p>{link.email}</p><p className="onboarding-footnote">{text('链接 7 天有效。此密码用于 App 和网页邮箱登录。', 'This link is valid for seven days. Use this password for email sign-in on the app and web.')}</p>{!expired && <form onSubmit={submit} className="onboarding-form"><label>{text('新密码', 'New password')}<input name="password" type="password" autoComplete="new-password" required /></label><label>{text('确认密码', 'Confirm password')}<input name="confirm" type="password" autoComplete="new-password" required /></label><p className="onboarding-footnote">{text('至少 8 个字符、最多 72 字节', 'At least 8 characters, at most 72 bytes')}</p><button className="onboarding-primary" disabled={busy}>{busy ? text('正在设置…', 'Setting password…') : text('设置密码并登录', 'Set password and sign in')}</button></form>}{expired && <button onClick={() => void resend()} disabled={busy || resent}>{text('重新发送', 'Resend')}</button>}{resent && <p role="status">{text('已请求重新发送，请查看邮箱及垃圾邮件。', 'Resend requested. Check your inbox and spam folder.')}</p>}</>}
    {error && <p role="alert" className="onboarding-error">{error}</p>}
  </OnboardingFrame>
}
