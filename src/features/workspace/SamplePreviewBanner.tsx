import { useEffect, useState } from 'react'
import { getInviteCodes, createPermanentInviteCode, activePermanentCode } from '../../api/invite'

interface Props {
  /** Re-check the roster after the coach has bound a student in the app. */
  onRefresh: () => void
}

type CodeState =
  | { kind: 'loading' }
  | { kind: 'ready'; code: string | null } // null = coach has no permanent code yet
  | { kind: 'error' }

// A prominent, always-visible marker that this editor is a SAMPLE (the coach has no bound
// students), plus the one action that actually gets them a student: share the invite code.
export function SamplePreviewBanner({ onRefresh }: Props) {
  const [open, setOpen] = useState(true)
  const [state, setState] = useState<CodeState>({ kind: 'loading' })
  const [copied, setCopied] = useState(false)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    let alive = true
    getInviteCodes()
      .then((codes) => { if (alive) setState({ kind: 'ready', code: activePermanentCode(codes)?.code ?? null }) })
      .catch(() => { if (alive) setState({ kind: 'error' }) })
    return () => { alive = false }
  }, [])

  const copy = (code: string) => {
    navigator.clipboard?.writeText(code).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    }).catch(() => { /* clipboard blocked — the code is visible to type manually */ })
  }

  const generate = async () => {
    if (generating) return
    setGenerating(true)
    try { const c = await createPermanentInviteCode(); setState({ kind: 'ready', code: c.code }) }
    catch { setState({ kind: 'error' }) }
    finally { setGenerating(false) }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={chip} title="展开示例说明">
        <span style={dot} /> 示例预览 · 无绑定学员 <span style={{ color: 'var(--fg-tertiary)' }}>▾</span>
      </button>
    )
  }

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={dot} />
        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--fg-primary)' }}>示例预览 · 该教练账号暂无绑定学员</span>
        <span style={{ flex: 1 }} />
        <button onClick={() => setOpen(false)} style={xBtn} title="收起">✕</button>
      </div>
      <div style={{ color: 'var(--fg-secondary)', fontSize: 12, lineHeight: 1.6, marginBottom: 12 }}>
        下面是示例计划，仅用于预览编辑器界面。把你的邀请码发给学员，ta 在 MeetPR App 里输入即可绑定你；绑定后回来点刷新，就能为 ta 编写真实计划。
      </div>

      <div style={inviteBox}>
        <span style={label}>我的邀请码</span>
        {state.kind === 'loading' && <span style={{ color: 'var(--fg-tertiary)', fontSize: 12 }}>加载中…</span>}
        {state.kind === 'error' && <span style={{ color: 'var(--brand-red)', fontSize: 12 }}>邀请码加载失败</span>}
        {state.kind === 'ready' && state.code && (
          <>
            <span style={codeText}>{grouped(state.code)}</span>
            <button onClick={() => copy(state.code!)} style={smallBtn}>{copied ? '✓ 已复制' : '复制'}</button>
          </>
        )}
        {state.kind === 'ready' && !state.code && (
          <>
            <span style={{ color: 'var(--fg-tertiary)', fontSize: 12 }}>你还没有邀请码</span>
            <button onClick={generate} disabled={generating} style={smallBtn}>{generating ? '生成中…' : '生成邀请码'}</button>
          </>
        )}
      </div>

      <button onClick={onRefresh} style={refreshBtn}>我已绑定学员 · 刷新</button>
    </div>
  )
}

function grouped(code: string): string {
  return code.length === 10 ? `${code.slice(0, 5)} ${code.slice(5)}` : code
}

const dot: React.CSSProperties = { width: 7, height: 7, borderRadius: '50%', background: 'var(--ink)', flex: '0 0 auto' }
const card: React.CSSProperties = {
  position: 'absolute', top: 100, left: '50%', transform: 'translateX(-50%)', zIndex: 50,
  width: 'min(560px, calc(100% - 32px))', background: 'var(--surface-2)',
  border: '1px solid var(--border-strong)', borderRadius: 14, boxShadow: 'var(--elev-modal)',
  padding: '14px 16px',
}
const chip: React.CSSProperties = {
  position: 'absolute', top: 100, left: '50%', transform: 'translateX(-50%)', zIndex: 50,
  display: 'inline-flex', alignItems: 'center', gap: 7, background: 'var(--surface-2)',
  border: '1px solid var(--border-strong)', borderRadius: 999, padding: '7px 14px',
  color: 'var(--fg-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
  boxShadow: 'var(--elev-modal)',
}
const inviteBox: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', marginBottom: 12,
  background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 10,
}
const label: React.CSSProperties = { fontSize: 11, color: 'var(--fg-tertiary)', flex: '0 0 auto' }
const codeText: React.CSSProperties = {
  flex: 1, fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--fg-primary)',
}
const smallBtn: React.CSSProperties = {
  flex: '0 0 auto', background: 'var(--ink)', color: 'var(--white)', border: 'none', borderRadius: 8,
  padding: '6px 12px', fontWeight: 600, fontSize: 12, cursor: 'pointer',
}
const refreshBtn: React.CSSProperties = {
  width: '100%', background: 'transparent', color: 'var(--fg-secondary)',
  border: '1px solid var(--border-strong)', borderRadius: 10, padding: '9px 14px',
  fontWeight: 600, fontSize: 13, cursor: 'pointer',
}
const xBtn: React.CSSProperties = {
  background: 'transparent', color: 'var(--fg-tertiary)', border: 'none', fontSize: 13, cursor: 'pointer', padding: 2,
}
