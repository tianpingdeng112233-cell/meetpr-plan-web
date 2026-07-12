import { useState } from 'react'

interface Props {
  weeksCount: number
  calendarLocked?: boolean
  calendarLockedHint?: string
  onChangeWeeks?: (weeks: number) => Promise<void>
  removalSummary?: (weeks: number) => { days: number; exercises: number }
  curWeekLabel: string
  zoomLabel: string
  /** Week numbers present in the plan; enables the 跳到周 dropdown. */
  weekNums?: number[]
  onJumpWeek?: (num: number) => void
}

export function Toolbar({ weeksCount, calendarLocked = false, calendarLockedHint, onChangeWeeks, removalSummary, curWeekLabel, zoomLabel, weekNums, onJumpWeek }: Props) {
  const [weeksOpen, setWeeksOpen] = useState(false)
  const [jumpOpen, setJumpOpen] = useState(false)
  const [draftWeeks, setDraftWeeks] = useState(weeksCount)
  const [applying, setApplying] = useState(false)
  const canJump = !!onJumpWeek && (weekNums?.length ?? 0) > 0
  const canResize = !!onChangeWeeks
  const lockedHint = calendarLocked ? calendarLockedHint ?? '已发布计划的周期与日期不可修改' : undefined
  const removal = draftWeeks < weeksCount ? removalSummary?.(draftWeeks) : undefined
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14, height: 38, padding: '0 16px',
      background: 'var(--surface-1)', borderBottom: '1px solid var(--border)',
      flex: '0 0 auto', zIndex: 19, fontSize: 12,
    }}>
      <span className="t-mono-label" style={{ fontSize: 10, letterSpacing: '.1em', color: 'var(--fg-tertiary)' }}>MESOCYCLE</span>
      <span style={{ position: 'relative' }}>
        <button
          type="button"
          disabled={!canResize || calendarLocked || applying}
          title={lockedHint}
          onClick={() => { setJumpOpen(false); setDraftWeeks(weeksCount); setWeeksOpen((value) => !value) }}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, padding: '4px 8px',
            border: '1px solid transparent', borderRadius: 'var(--r-md)', background: 'transparent',
            color: (!canResize || calendarLocked) ? 'var(--fg-disabled)' : 'var(--fg-primary)',
            fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 600,
            cursor: (!canResize || calendarLocked) ? 'default' : 'pointer',
          }}
        >
          {weeksCount} 周 · 周期化 <span style={{ color: 'var(--fg-tertiary)', fontSize: 9 }}>▼</span>
        </button>
        {weeksOpen && !calendarLocked && (
          <>
            <span onClick={() => setWeeksOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 70 }} />
            <span style={{
              position: 'absolute', top: '100%', left: 0, marginTop: 6, zIndex: 80, minWidth: 310,
              display: 'grid', gap: 'var(--sp-md)', padding: 'var(--sp-md)', background: 'var(--surface-2)',
              border: '1px solid var(--border-strong)', borderRadius: 'var(--r-md)', boxShadow: 'var(--elev-modal)',
            }}>
              <span style={{ display: 'flex', alignItems: 'center' }}>
                <span style={{ display: 'inline-flex', border: '1px solid var(--border-strong)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
                  <button type="button" aria-label="减少一周" disabled={draftWeeks <= 1} onClick={() => setDraftWeeks((value) => Math.max(1, value - 1))} style={stepButton}>－</button>
                  <span style={{ minWidth: 70, display: 'grid', placeItems: 'center', borderInline: '1px solid var(--border)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{draftWeeks} 周</span>
                  <button type="button" aria-label="增加一周" disabled={draftWeeks >= 52} onClick={() => setDraftWeeks((value) => Math.min(52, value + 1))} style={stepButton}>＋</button>
                </span>
                <span style={{ flex: 1 }} />
                <button
                  type="button"
                  disabled={applying || draftWeeks === weeksCount}
                  onClick={() => {
                    if (!onChangeWeeks) return
                    setApplying(true)
                    void onChangeWeeks(draftWeeks).then(() => setWeeksOpen(false)).catch(() => undefined).finally(() => setApplying(false))
                  }}
                  style={{ ...applyButton, opacity: (applying || draftWeeks === weeksCount) ? 0.5 : 1 }}
                >
                  {applying ? '应用中…' : '应用'}
                </button>
              </span>
              {removal && removal.days > 0 && (
                <span role="alert" style={{ padding: '9px 10px', border: '1px solid var(--amber)', borderRadius: 'var(--r-md)', background: 'var(--amber-soft)', color: 'var(--amber)', lineHeight: 1.5 }}>
                  减到 {draftWeeks} 周将删除 W{draftWeeks + 1}–W{weeksCount} 的 {removal.days} 个训练日（{removal.exercises} 个动作），保存后不可恢复。
                </span>
              )}
            </span>
          </>
        )}
      </span>
      <span style={{ width: 1, height: 16, background: 'var(--border)' }} />
      <span style={{ color: 'var(--fg-tertiary)' }}>可见</span>
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
          <span onClick={() => { setWeeksOpen(false); setJumpOpen((value) => !value) }} style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, padding: '4px 10px', position: 'relative',
            border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', color: 'var(--fg-secondary)',
          }}>
            跳到周 <span style={{ color: 'var(--fg-tertiary)', fontSize: 9 }}>▼</span>
            {jumpOpen && (
              <span style={{
                position: 'absolute', top: '100%', right: 0, marginTop: 6, zIndex: 80, padding: 4,
                display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 2, width: 176,
                background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 10,
                boxShadow: 'var(--elev-modal)',
              }}>
                {weekNums!.map((n) => (
                  <span key={n} className="popitem" onClick={(e) => { e.stopPropagation(); setJumpOpen(false); onJumpWeek!(n) }}
                    style={{ padding: '6px 0', textAlign: 'center', borderRadius: 6, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-secondary)' }}>
                    W{String(n).padStart(2, '0')}
                  </span>
                ))}
              </span>
            )}
          </span>
          {jumpOpen && <span onClick={() => setJumpOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 70 }} />}
        </>
      )}
    </div>
  )
}

const stepButton: React.CSSProperties = {
  width: 36,
  height: 32,
  padding: 0,
  border: 0,
  background: 'var(--surface-1)',
  color: 'var(--fg-secondary)',
  font: 'inherit',
  fontWeight: 700,
  cursor: 'pointer',
}

const applyButton: React.CSSProperties = {
  height: 32,
  padding: '0 13px',
  border: '1px solid var(--fg-primary)',
  borderRadius: 'var(--r-md)',
  background: 'var(--fg-primary)',
  color: 'var(--bg)',
  font: 'inherit',
  fontWeight: 700,
  cursor: 'pointer',
}
