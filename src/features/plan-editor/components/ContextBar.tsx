interface Props {
  visible: boolean
  dayLabel: string
  isRest: boolean
  canCopyPrev: boolean
  copyDisabledHint?: string
  hasLockedRows: boolean
  copyLabel: string
  copyDone: boolean
  selectedRowLabel: string
  hasRowClipboard: boolean
  onCopyPrev: () => void
  onPasteRow: () => void
  onSetRest: () => void
  onUnsetRest: () => void
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
      boxShadow: 'inset 3px 0 0 var(--ink)', flex: '0 0 auto', zIndex: 18, fontSize: 12,
    }}>
      <span className="t-mono-label" style={{ fontSize: 10, letterSpacing: '.1em', color: 'var(--ink)' }}>SELECTED</span>
      <b style={{ color: 'var(--fg-primary)' }}>{p.dayLabel}</b>
      <span style={{ width: 1, height: 16, background: 'var(--border-strong)' }} />
      <span
        className={`ctxbtn${p.canCopyPrev ? '' : ' disabled'}`}
        onClick={p.onCopyPrev}
        title={!p.canCopyPrev ? p.copyDisabledHint : undefined}
        style={{ ...btn, color: p.copyDone ? 'var(--green)' : 'var(--fg-primary)', borderColor: p.copyDone ? 'var(--green)' : 'var(--border-strong)' }}
      >
        {p.copyLabel}
      </span>
      {p.selectedRowLabel && (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-tertiary)' }}>{p.selectedRowLabel}</span>
      )}
      {p.hasRowClipboard && (
        <span className="ctxbtn" onClick={p.onPasteRow} style={{ ...btn, color: 'var(--fg-primary)' }}>粘贴动作</span>
      )}
      {p.isRest ? (
        <span className="ctxbtn" onClick={p.onUnsetRest} style={{ ...btn, color: 'var(--green)', borderColor: 'var(--green)' }}>改为训练日</span>
      ) : (
        <>
          <span className={`ctxbtn${p.hasLockedRows ? ' disabled' : ''}`} onClick={p.onSetRest}
            title={p.hasLockedRows ? '该日含学员已打卡动作,不能转为休息日' : undefined}
            style={{ ...btn, color: 'var(--fg-secondary)' }}>设为休息</span>
          <span className="ctxbtn" onClick={p.onClearDay} style={{ ...btn, color: 'var(--fg-secondary)' }}>清空本日</span>
        </>
      )}
      <span style={{ flex: 1 }} />
      <span onClick={p.onClose} style={{ cursor: 'pointer', color: 'var(--fg-tertiary)', fontSize: 12, padding: '4px 8px' }}>✕ 取消选择</span>
    </div>
  )
}
