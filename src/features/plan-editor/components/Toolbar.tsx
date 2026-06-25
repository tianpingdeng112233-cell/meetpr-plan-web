interface Props {
  weeksCount: number
  curWeekLabel: string
  zoomLabel: string
}

export function Toolbar({ weeksCount, curWeekLabel, zoomLabel }: Props) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14, height: 38, padding: '0 16px',
      background: 'var(--surface-1)', borderBottom: '1px solid var(--border)',
      flex: '0 0 auto', zIndex: 19, fontSize: 12,
    }}>
      <span className="t-mono-label" style={{ fontSize: 10, letterSpacing: '.1em', color: 'var(--fg-tertiary)' }}>MESOCYCLE</span>
      <span style={{ fontWeight: 600 }}>{weeksCount} 周 · 周期化</span>
      <span style={{ width: 1, height: 16, background: 'var(--border)' }} />
      <span style={{ color: 'var(--fg-tertiary)' }}>当前</span>
      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--brand-red)', fontWeight: 600, letterSpacing: '.04em' }}>
        {curWeekLabel}
      </span>
      <span style={{ flex: 1 }} />
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--fg-tertiary)' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase' }}>缩放</span>
        <b style={{ color: 'var(--fg-secondary)', fontFamily: 'var(--font-mono)', minWidth: 34, display: 'inline-block' }}>{zoomLabel}</b>
      </span>
      <span style={{ color: 'var(--fg-tertiary)', fontSize: 11 }}>Ctrl+滚轮缩放 · 中键拖动平移</span>
      <span style={{ width: 1, height: 16, background: 'var(--border)' }} />
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 7, padding: '4px 10px',
        border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', color: 'var(--fg-secondary)',
      }}>
        跳到周 <span style={{ color: 'var(--fg-tertiary)', fontSize: 9 }}>▼</span>
      </span>
    </div>
  )
}
