import { useState } from 'react'
import { S } from '../../../i18n/strings'

interface Props {
  weeksCount: number
  calendarLocked?: boolean
  calendarLockedHint?: string
  onChangeWeeks?: (weeks: number) => Promise<void>
  removalSummary?: (weeks: number) => { days: number; exercises: number }
  curWeekLabel: string
  previousWeekDisabled: boolean
  nextWeekDisabled: boolean
  onPreviousWeek: () => void
  onNextWeek: () => void
}

export function Toolbar({
  weeksCount,
  calendarLocked = false,
  calendarLockedHint,
  onChangeWeeks,
  removalSummary,
  curWeekLabel,
  previousWeekDisabled,
  nextWeekDisabled,
  onPreviousWeek,
  onNextWeek,
}: Props) {
  const [weeksOpen, setWeeksOpen] = useState(false)
  const [draftWeeks, setDraftWeeks] = useState(weeksCount)
  const [applying, setApplying] = useState(false)
  const canResize = !!onChangeWeeks
  const lockedHint = calendarLocked ? calendarLockedHint ?? S.editor.calendarLocked : undefined
  const removal = draftWeeks < weeksCount ? removalSummary?.(draftWeeks) : undefined
  return (
    <div className="plan-toolbar" style={{
      display: 'flex', flexWrap: 'nowrap', whiteSpace: 'nowrap', alignItems: 'center', gap: 14, height: 38, padding: '0 16px',
      background: 'var(--card-bg)', borderBottom: '1px solid var(--line)',
      flex: '0 0 auto', zIndex: 19, fontSize: 12,
    }}>
      <span className="t-mono-label" style={{ fontSize: 10, letterSpacing: '.1em', color: 'var(--mut)' }}>MESOCYCLE</span>
      <span style={{ position: 'relative' }}>
        <button
          type="button"
          disabled={!canResize || calendarLocked || applying}
          title={lockedHint}
          onClick={() => { setDraftWeeks(weeksCount); setWeeksOpen((value) => !value) }}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, padding: '4px 8px',
            border: '1px solid transparent', borderRadius: 'var(--r-md)', background: 'transparent',
            color: (!canResize || calendarLocked) ? 'var(--faint)' : 'var(--txt)',
            fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 600,
            cursor: (!canResize || calendarLocked) ? 'default' : 'pointer',
          }}
        >
          {S.editor.mesocycle(weeksCount)} <span style={{ color: 'var(--mut)', fontSize: 9 }}>▼</span>
        </button>
        {weeksOpen && !calendarLocked && (
          <>
            <span onClick={() => setWeeksOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 70 }} />
            <span style={{
              position: 'absolute', top: '100%', left: 0, marginTop: 6, zIndex: 80, minWidth: 310,
              display: 'grid', gap: 'var(--sp-md)', padding: 'var(--sp-md)', background: 'var(--panel-bg)',
              border: '1px solid var(--bd)', borderRadius: 'var(--r-md)', boxShadow: 'var(--elev-modal)',
            }}>
              <span style={{ display: 'flex', alignItems: 'center' }}>
                <span style={{ display: 'inline-flex', border: '1px solid var(--bd)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
                  <button type="button" aria-label={S.editor.decreaseWeek} disabled={draftWeeks <= 1} onClick={() => setDraftWeeks((value) => Math.max(1, value - 1))} style={stepButton}>－</button>
                  <span style={{ minWidth: 70, display: 'grid', placeItems: 'center', borderInline: '1px solid var(--line)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{S.common.countWeeks(draftWeeks)}</span>
                  <button type="button" aria-label={S.editor.increaseWeek} disabled={draftWeeks >= 52} onClick={() => setDraftWeeks((value) => Math.min(52, value + 1))} style={stepButton}>＋</button>
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
                  {applying ? S.editor.applying : S.editor.apply}
                </button>
              </span>
              {removal && removal.days > 0 && (
                <span role="alert" style={{ padding: '9px 10px', border: '1px solid var(--warn)', borderRadius: 'var(--r-md)', background: 'var(--warn-soft)', color: 'var(--warn)', lineHeight: 1.5 }}>
                  {S.editor.removalWarning(draftWeeks, weeksCount, removal.days, removal.exercises)}
                </span>
              )}
            </span>
          </>
        )}
      </span>
      <span style={{ width: 1, height: 16, background: 'var(--line)' }} />
      <span style={{ color: 'var(--mut)' }}>{S.editor.visible}</span>
      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink)', fontWeight: 500, letterSpacing: '.04em' }}>
        {curWeekLabel}
      </span>
      <span className="plan-toolbar-week-jumps" data-week-jump-controls="">
        <button
          type="button"
          aria-label={S.editor.previousWeek}
          disabled={previousWeekDisabled}
          onClick={onPreviousWeek}
        >
          <span aria-hidden="true">‹</span>
        </button>
        <button
          type="button"
          aria-label={S.editor.nextWeek}
          disabled={nextWeekDisabled}
          onClick={onNextWeek}
        >
          <span aria-hidden="true">›</span>
        </button>
      </span>
      <span style={{ flex: 1 }} />
      <span className="t-hint" style={{ color: 'var(--mut)', fontSize: 11 }}>{S.editor.scrollHint}</span>
    </div>
  )
}

const stepButton: React.CSSProperties = {
  width: 36,
  height: 32,
  padding: 0,
  border: 0,
  background: 'var(--card-bg)',
  color: 'var(--sec)',
  font: 'inherit',
  fontWeight: 700,
  cursor: 'pointer',
}

const applyButton: React.CSSProperties = {
  height: 32,
  padding: '0 13px',
  border: '1px solid var(--txt)',
  borderRadius: 'var(--r-md)',
  background: 'var(--txt)',
  color: 'var(--page-bg)',
  font: 'inherit',
  fontWeight: 700,
  cursor: 'pointer',
}
