import { useEffect, useState } from 'react'
import { AuthRoleError, clearLoginNotice, login, peekLoginNotice } from '../../api/auth'
import { ApiException } from '../../api/client'
import type { AuthUser } from '../../api/types'

interface Props {
  onLogin: (user: AuthUser) => void
  onSampleMode: () => void
}

const errMsg: Record<string, string> = {
  AUTH_INVALID_CREDENTIALS: '手机号或密码不正确',
  VALIDATION_ERROR: '请填写正确的手机号和密码',
}

export function LoginScreen({ onLogin, onSampleMode }: Props) {
  const [phone, setPhone] = useState('')
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
    setErr(''); setBusy(true)
    try {
      const user = await login(toE164(phone), password, 'coach')
      onLogin(user)
    } catch (e2) {
      if (e2 instanceof AuthRoleError) {
        setErr('该账号不是教练，无法编写计划')
        setBusy(false)
        return
      }
      const code = e2 instanceof ApiException ? e2.code : 'NETWORK'
      setErr(errMsg[code] ?? (code === 'NETWORK' ? '无法连接后端，请稍后再试' : `登录失败（${code}）`))
      setBusy(false)
    }
  }

  const field: React.CSSProperties = {
    width: '100%', padding: '11px 13px', background: 'var(--card-bg)',
    border: '1px solid var(--bd)', borderRadius: 'var(--r-md)', color: 'var(--txt)',
    fontSize: 15, fontFamily: 'var(--font-sans)', outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--page-bg)' }}>
      <form onSubmit={submit} style={{ width: 360, padding: 32, background: 'var(--card-bg)', border: '1px solid var(--bd)', borderRadius: 'var(--r-lg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <span style={{ width: 28, height: 28, borderRadius: 'var(--r-sm)', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, color: 'var(--white)', background: 'var(--ink)' }}>M</span>
          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--txt)' }}>MeetPR</span>
          <span className="t-mono-label" style={{ color: 'var(--ink)' }}>COACH</span>
        </div>
        <div style={{ color: 'var(--fg-tertiary)', fontSize: 13, marginBottom: 24 }}>登录编写学员计划</div>

        {notice && (
          <div role="status" style={{
            marginBottom: 20, padding: '10px 12px', borderRadius: 'var(--r-md)',
            border: '1px solid var(--border-strong)', background: 'var(--surface-2)',
            color: 'var(--sec)', fontSize: 13, lineHeight: 1.6,
          }}>
            {notice}
          </div>
        )}

        <label style={{ display: 'block', fontSize: 12, color: 'var(--fg-secondary)', marginBottom: 6 }}>手机号</label>
        <div style={{ ...field, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, padding: 0 }}>
          <span style={{ padding: '11px 0 11px 13px', color: 'var(--fg-tertiary)', borderRight: '1px solid var(--border)', paddingRight: 10, fontFamily: 'var(--font-mono)' }}>+86</span>
          <input
            style={{ flex: 1, padding: '11px 13px 11px 0', background: 'transparent', border: 'none', color: 'var(--txt)', fontSize: 15, fontFamily: 'var(--font-mono)', outline: 'none' }}
            value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="username" placeholder="手机号"
          />
        </div>

        <label style={{ display: 'block', fontSize: 12, color: 'var(--fg-secondary)', marginBottom: 6 }}>密码</label>
        <input style={field} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="密码" />

        {err && <div style={{ color: 'var(--bad)', fontSize: 13, marginTop: 14 }}>{err}</div>}

        <button type="submit" disabled={busy || !phone || !password} style={{
          width: '100%', marginTop: 22, padding: '12px', background: busy ? 'var(--tint)' : 'var(--ink)',
          color: busy ? 'var(--mut)' : 'var(--white)', border: 'none', borderRadius: 'var(--r-md)', fontWeight: 600, fontSize: 13,
          cursor: busy ? 'default' : 'pointer', opacity: (!phone || !password) ? 0.5 : 1,
        }}>
          {busy ? '登录中…' : '登录'}
        </button>

        <div onClick={onSampleMode} style={{ marginTop: 16, textAlign: 'center', color: 'var(--fg-tertiary)', fontSize: 12, cursor: 'pointer' }}>
          用样例数据预览（不连后端）
        </div>
      </form>
    </div>
  )
}
