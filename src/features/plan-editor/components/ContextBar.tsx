interface Props {
  visible: boolean
  dayLabel: string
  canCopyPrev: boolean
  copyLabel: string
  copyDone: boolean
  onCopyPrev: () => void
  onAddRow: () => void
  onSetRest: () => void
  onClearDay: () => void
  onClose: () => void
}

const btn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px',
  border: '1px solid var(--border-strong)', borderRadius: 8,
}

export function ContextBar(p: Props) {
  return (
    <div style={{
      display: p.visible ? 'flex' : 'none', alignItems: 'center', gap: 10, height: 40,
      padding: '0 16px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)',
      boxShadow: 'inset 3px 0 0 var(--brand-red)', flex: '0 0 auto', zIndex: 18, fontSize: 12,
    }}>
      <span className="t-mono-label" style={{ fontSize: 10, letterSpacing: '.1em', color: 'var(--brand-red)' }}>SELECTED</span>
      <b style={{ color: '#fff' }}>{p.dayLabel}</b>
      <span style={{ width: 1, height: 16, background: 'var(--border-strong)' }} />
      <span
        className={`ctxbtn${p.canCopyPrev ? '' : ' disabled'}`}
        onClick={p.onCopyPrev}
        style={{ ...btn, color: p.copyDone ? 'var(--green)' : '#fff', borderColor: p.copyDone ? 'var(--green)' : 'var(--border-strong)' }}
      >
        {p.copyLabel}
      </span>
      <span className="ctxbtn" onClick={p.onAddRow} style={{ ...btn, color: '#fff' }}>＋ 加动作</span>
      <span className="ctxbtn" onClick={p.onSetRest} style={{ ...btn, color: 'var(--fg-secondary)' }}>设为休息</span>
      <span className="ctxbtn" onClick={p.onClearDay} style={{ ...btn, color: 'var(--fg-secondary)' }}>清空本日</span>
      <span style={{ flex: 1 }} />
      <span onClick={p.onClose} style={{ cursor: 'pointer', color: 'var(--fg-tertiary)', fontSize: 12, padding: '4px 8px' }}>✕ 取消选择</span>
    </div>
  )
}
