import { useState } from 'react'
import { AuthRoleError, login } from '../../api/auth'
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
    width: '100%', padding: '11px 13px', background: 'var(--surface-2)',
    border: '1px solid var(--border)', borderRadius: 'var(--r-md)', color: '#fff',
    fontSize: 15, fontFamily: 'var(--font-sans)', outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <form onSubmit={submit} style={{ width: 360, padding: 32, background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <span style={{ fontWeight: 900, fontSize: 22, letterSpacing: '-0.01em', color: '#fff' }}>MeetPR</span>
          <span className="t-mono-label" style={{ color: 'var(--brand-red)' }}>COACH</span>
        </div>
        <div style={{ color: 'var(--fg-tertiary)', fontSize: 13, marginBottom: 24 }}>登录编写学员计划</div>

        <label style={{ display: 'block', fontSize: 12, color: 'var(--fg-secondary)', marginBottom: 6 }}>手机号</label>
        <div style={{ ...field, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, padding: 0 }}>
          <span style={{ padding: '11px 0 11px 13px', color: 'var(--fg-tertiary)', borderRight: '1px solid var(--border)', paddingRight: 10 }}>+86</span>
          <input
            style={{ flex: 1, padding: '11px 13px 11px 0', background: 'transparent', border: 'none', color: '#fff', fontSize: 15, fontFamily: 'var(--font-sans)', outline: 'none' }}
            value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="username" placeholder="手机号"
          />
        </div>

        <label style={{ display: 'block', fontSize: 12, color: 'var(--fg-secondary)', marginBottom: 6 }}>密码</label>
        <input style={field} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="密码" />

        {err && <div style={{ color: 'var(--brand-red)', fontSize: 13, marginTop: 14 }}>{err}</div>}

        <button type="submit" disabled={busy || !phone || !password} style={{
          width: '100%', marginTop: 22, padding: '12px', background: busy ? 'var(--surface-3)' : '#fff',
          color: '#000', border: 'none', borderRadius: 'var(--r-md)', fontWeight: 600, fontSize: 15,
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
