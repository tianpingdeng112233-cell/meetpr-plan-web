import { useEffect, useState, type CSSProperties } from 'react'
import { WeekdayDateSelector, calendarFieldLabel, calendarInputStyle, mmdd, planEndISO, todayISO, weekdayIndex } from '../plan-editor/components/PlanCalendarControls'
import { DOW_LABELS } from '../plan-editor/mapping'
import { S } from '../../i18n/strings'

const overlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 140,
  display: 'grid',
  placeItems: 'center',
  background: 'color-mix(in srgb, var(--bg) 68%, transparent)',
}

const panel: CSSProperties = {
  width: 430,
  maxWidth: 'calc(100vw - 32px)',
  boxSizing: 'border-box',
  borderRadius: 'var(--r-md)',
  border: '1px solid var(--border-strong)',
  background: 'var(--surface-2)',
  boxShadow: 'var(--elev-modal)',
  padding: 22,
  display: 'grid',
  gap: 'var(--sp-base)',
}

const secondaryButton: CSSProperties = {
  height: 36,
  padding: '0 14px',
  borderRadius: 'var(--r-md)',
  border: '1px solid var(--border-strong)',
  background: 'transparent',
  color: 'var(--fg-secondary)',
  font: 'inherit',
  fontWeight: 600,
  cursor: 'pointer',
}

const primaryButton: CSSProperties = {
  ...secondaryButton,
  borderColor: 'var(--ink)',
  background: 'var(--ink)',
  color: 'var(--white)',
}

function Stepper({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <div style={{ display: 'inline-flex', width: 'fit-content', border: '1px solid var(--border-strong)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
      <button type="button" aria-label={S.editor.decreaseWeek} disabled={value <= 1} onClick={() => onChange(Math.max(1, value - 1))} style={{ ...secondaryButton, width: 38, padding: 0, border: 0, borderRadius: 0 }}>－</button>
      <span style={{ minWidth: 72, display: 'grid', placeItems: 'center', borderInline: '1px solid var(--border)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{S.common.countWeeks(value)}</span>
      <button type="button" aria-label={S.editor.increaseWeek} disabled={value >= 52} onClick={() => onChange(Math.min(52, value + 1))} style={{ ...secondaryButton, width: 38, padding: 0, border: 0, borderRadius: 0 }}>＋</button>
    </div>
  )
}

export function NewPlanDialog({ open, studentName, onClose, onCreate }: {
  open: boolean
  studentName: string
  onClose: () => void
  onCreate: (name: string, weeks: number, startDate: string, anchorWeekday: number) => Promise<void>
}) {
  const [name, setName] = useState(S.workspace.dialogs.newPlan)
  const [weeks, setWeeks] = useState(12)
  const [startDate, setStartDate] = useState(todayISO())
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setName(S.workspace.dialogs.newPlan)
    setWeeks(12)
    setStartDate(todayISO())
    setCreating(false)
    setError('')
  }, [open])

  if (!open) return null
  const endDate = planEndISO(startDate, weeks)
  const validName = name.trim().length > 0

  return (
    <div onMouseDown={() => { if (!creating) onClose() }} style={overlay}>
      <form
        aria-label={S.workspace.dialogs.newPlanTitle}
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault()
          if (!validName || creating) return
          setCreating(true)
          setError('')
          void onCreate(name.trim(), weeks, startDate, weekdayIndex(startDate) + 1).catch(() => {
            setError(S.workspace.dialogs.createFailed)
            setCreating(false)
          })
        }}
        style={panel}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: 18 }}>{S.workspace.dialogs.newPlanTitle}</h3>
          <div style={{ color: 'var(--fg-tertiary)', marginTop: 5, fontSize: 12 }}>{S.workspace.dialogs.studentPrefix}{studentName}</div>
        </div>

        <label style={{ display: 'grid', gap: 7 }}>
          <span style={calendarFieldLabel}>{S.workspace.dialogs.planName}</span>
          <input autoFocus value={name} onChange={(event) => setName(event.target.value)} style={calendarInputStyle} />
        </label>

        <div style={{ display: 'grid', gap: 7 }}>
          <span style={calendarFieldLabel}>{S.workspace.dialogs.cycleLength}</span>
          <Stepper value={weeks} onChange={setWeeks} />
        </div>

        <div style={{ display: 'grid', gap: 7 }}>
          <span style={calendarFieldLabel}>{S.workspace.dialogs.dayOneWeekday}</span>
          <WeekdayDateSelector value={startDate} onChange={setStartDate} dateLabel={S.editor.startDate} />
        </div>

        <div style={{ padding: '11px 12px', border: '1px dashed var(--border-strong)', borderRadius: 'var(--r-md)', color: 'var(--fg-secondary)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
          {S.workspace.dialogs.rangeSummary(DOW_LABELS[weekdayIndex(startDate)], mmdd(startDate), weeks, mmdd(endDate))}
        </div>

        {error && <div role="alert" style={{ color: 'var(--brand-red)', fontSize: 12 }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-sm)' }}>
          <button type="button" disabled={creating} onClick={onClose} style={secondaryButton}>{S.common.cancel}</button>
          <button type="submit" disabled={!validName || creating} style={{ ...primaryButton, opacity: (!validName || creating) ? 0.55 : 1 }}>
            {creating ? S.workspace.dialogs.creating : S.workspace.dialogs.createPlan}
          </button>
        </div>
      </form>
    </div>
  )
}

export function DeletePlanDialog({ open, name, weeks, trainingDays, deleting, error, onClose, onDelete }: {
  open: boolean
  name: string
  weeks: number
  trainingDays: number
  deleting: boolean
  error: string
  onClose: () => void
  onDelete: () => void
}) {
  if (!open) return null
  return (
    <div onMouseDown={() => { if (!deleting) onClose() }} style={overlay}>
      <div role="dialog" aria-modal="true" aria-labelledby="delete-plan-title" onMouseDown={(event) => event.stopPropagation()} style={{ ...panel, width: 390 }}>
        <div>
          <h3 id="delete-plan-title" style={{ margin: 0, fontSize: 18 }}>{S.workspace.dialogs.deleteDraftTitle}</h3>
          <div style={{ marginTop: 8, color: 'var(--fg-secondary)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
            {name} · {S.workspace.dialogs.draftSummary(weeks, trainingDays)}
          </div>
        </div>
        <p style={{ margin: 0, color: 'var(--fg-secondary)', lineHeight: 1.6 }}>
          {S.workspace.dialogs.deleteDraftWarning}
        </p>
        {error && <div role="alert" style={{ color: 'var(--brand-red)', fontSize: 12 }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-sm)' }}>
          <button type="button" disabled={deleting} onClick={onClose} style={secondaryButton}>{S.common.cancel}</button>
          <button type="button" disabled={deleting} onClick={onDelete} style={{ ...primaryButton, background: 'var(--bad)', borderColor: 'var(--bad)', color: 'var(--white)', opacity: deleting ? 0.55 : 1 }}>
            {deleting ? S.workspace.dialogs.deleting : S.workspace.dialogs.deletePlan}
          </button>
        </div>
      </div>
    </div>
  )
}

export function CompletePlanDialog({ open, name, weeks, completing, error, onClose, onComplete }: {
  open: boolean
  name: string
  weeks: number
  completing: boolean
  error: string
  onClose: () => void
  onComplete: () => void
}) {
  if (!open) return null
  return (
    <div onMouseDown={() => { if (!completing) onClose() }} style={overlay}>
      <div role="dialog" aria-modal="true" aria-labelledby="complete-plan-title" onMouseDown={(event) => event.stopPropagation()} style={{ ...panel, width: 390 }}>
        <div>
          <h3 id="complete-plan-title" style={{ margin: 0, fontSize: 18 }}>{S.workspace.dialogs.completeTitle}</h3>
          <div style={{ marginTop: 8, color: 'var(--fg-secondary)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
            {name} · {S.common.countWeeks(weeks)}
          </div>
        </div>
        <p style={{ margin: 0, color: 'var(--fg-secondary)', lineHeight: 1.6 }}>
          {S.workspace.dialogs.completeWarning}
        </p>
        {error && <div role="alert" style={{ color: 'var(--brand-red)', fontSize: 12 }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-sm)' }}>
          <button type="button" disabled={completing} onClick={onClose} style={secondaryButton}>{S.common.cancel}</button>
          <button type="button" disabled={completing} onClick={onComplete} style={{ ...primaryButton, background: 'var(--green)', borderColor: 'var(--green)', color: 'var(--white)', opacity: completing ? 0.55 : 1 }}>
            {completing ? S.workspace.dialogs.processing : S.workspace.dialogs.markCompleted}
          </button>
        </div>
      </div>
    </div>
  )
}

export function BackfillHistoryDialog({ open, name, weeks, busy, error, onClose, onConfirm }: {
  open: boolean
  name: string
  weeks: number
  busy: boolean
  error: string
  onClose: () => void
  onConfirm: () => void
}) {
  if (!open) return null
  return (
    <div onMouseDown={() => { if (!busy) onClose() }} style={overlay}>
      <div role="dialog" aria-modal="true" aria-labelledby="backfill-history-title" onMouseDown={(event) => event.stopPropagation()} style={{ ...panel, width: 400 }}>
        <div>
          <h3 id="backfill-history-title" style={{ margin: 0, fontSize: 18 }}>{S.workspace.dialogs.backfillTitle}</h3>
          <div style={{ marginTop: 8, color: 'var(--fg-secondary)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
            {name} · {S.common.countWeeks(weeks)}
          </div>
        </div>
        <p style={{ margin: 0, color: 'var(--fg-secondary)', lineHeight: 1.6 }}>
          {S.workspace.dialogs.backfillWarning}
        </p>
        {error && <div role="alert" style={{ color: 'var(--brand-red)', fontSize: 12 }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-sm)' }}>
          <button type="button" disabled={busy} onClick={onClose} style={secondaryButton}>{S.common.cancel}</button>
          <button type="button" disabled={busy} onClick={onConfirm} style={{ ...primaryButton, opacity: busy ? 0.55 : 1 }}>
            {busy ? S.workspace.dialogs.backfilling : S.workspace.dialogs.backfill}
          </button>
        </div>
      </div>
    </div>
  )
}
