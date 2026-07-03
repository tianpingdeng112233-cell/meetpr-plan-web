import { useState } from 'react'

interface Props {
  weeksCount: number
  curWeekLabel: string
  zoomLabel: string
  /** Week numbers present in the plan; enables the 跳到周 dropdown. */
  weekNums?: number[]
  onJumpWeek?: (num: number) => void
}

export function Toolbar({ weeksCount, curWeekLabel, zoomLabel, weekNums, onJumpWeek }: Props) {
  const [open, setOpen] = useState(false)
  const canJump = !!onJumpWeek && (weekNums?.length ?? 0) > 0
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
      {canJump && (
        <>
          <span style={{ width: 1, height: 16, background: 'var(--border)' }} />
          <span onClick={() => setOpen((o) => !o)} style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, padding: '4px 10px', position: 'relative',
            border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', color: 'var(--fg-secondary)',
          }}>
            跳到周 <span style={{ color: 'var(--fg-tertiary)', fontSize: 9 }}>▼</span>
            {open && (
              <span style={{
                position: 'absolute', top: '100%', right: 0, marginTop: 6, zIndex: 80, padding: 4,
                display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 2, width: 176,
                background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 10,
                boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              }}>
                {weekNums!.map((n) => (
                  <span key={n} className="popitem" onClick={(e) => { e.stopPropagation(); setOpen(false); onJumpWeek!(n) }}
                    style={{ padding: '6px 0', textAlign: 'center', borderRadius: 6, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-secondary)' }}>
                    W{String(n).padStart(2, '0')}
                  </span>
                ))}
              </span>
            )}
          </span>
          {open && <span onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 70 }} />}
        </>
      )}
    </div>
  )
}
