import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { calendarFieldLabel, calendarInputStyle, mmdd, planEndISO, weekdayIndex } from '../plan-editor/components/PlanCalendarControls'
import { defaultFirstDate, orderedWeekdays } from './blockPlanSettings'
import { S } from '../../i18n/strings'
import { registerReloadBlocker } from '../../reloadSafety'

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

export interface BlockPlanSettings { name: string; weeks: number; startDate: string; weekdays: number[] }

export function NewPlanDialog({ open, studentName, onClose, onCreate, settings, initialStartDate, calendarLocked = false, calendarLockedHint, weeksLocked = false }: {
  open: boolean
  studentName: string
  onClose: () => void
  onCreate: (name: string, weeks: number, startDate: string, anchorWeekday: number, weekdays: number[]) => Promise<void>
  initialStartDate?: string
  settings?: BlockPlanSettings
  calendarLockedHint?: string
  calendarLocked?: boolean
  weeksLocked?: boolean
}) {
  const [name, setName] = useState(S.workspace.dialogs.newPlan)
  const [weeks, setWeeks] = useState(4)
  const [days, setDays] = useState<number[]>([0, 2, 4, 5])
  const [first, setFirst] = useState(0)
  const [startDate, setStartDate] = useState(defaultFirstDate(0))
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const reloadBlockedRef = useRef(false)
  reloadBlockedRef.current = open || creating
  useEffect(() => registerReloadBlocker(() => reloadBlockedRef.current), [])
  useEffect(() => {
    if (!open) return
    setName(settings?.name ?? S.workspace.dialogs.newPlan)
    setWeeks(settings?.weeks ?? 4)
    const firstDay = initialStartDate ? weekdayIndex(initialStartDate) : 0
    setDays(settings?.weekdays ?? [0, 2, 4, 5].map(day => (day + firstDay) % 7))
    setFirst(settings?.weekdays[0] ?? firstDay)
    setStartDate(settings?.startDate ?? initialStartDate ?? defaultFirstDate(0))
    setCreating(false); setError('')
  }, [open])
  if (!open) return null
  const ordered = orderedWeekdays(days, first)
  const valid = name.trim().length > 0 && days.length > 0 && !!startDate
    && (calendarLocked || weekdayIndex(startDate) === first || (settings?.startDate === startDate && settings.weekdays[0] === first))
  const title = settings ? S.block.settings : S.workspace.dialogs.newPlanTitle
  const chooseFirst = (value: number) => { setFirst(value); if (!calendarLocked) setStartDate(defaultFirstDate(value)) }
  return <div onMouseDown={() => { if (!creating) onClose() }} style={overlay}>
    <form role="dialog" aria-modal="true" aria-label={title} className="block-plan-dialog" onMouseDown={event => event.stopPropagation()}
      onKeyDown={event => { if (event.key === 'Escape' && !creating) onClose() }}
      onSubmit={event => {
        event.preventDefault()
        if (!valid || creating) return
        setCreating(true); setError('')
        void onCreate(name.trim(), weeks, startDate, weekdayIndex(startDate) + 1, ordered).catch((reason: unknown) => {
          setError(reason instanceof Error && reason.message === 'PATTERN_CONFLICT' ? S.block.patternConflict : reason instanceof Error && reason.message === 'PATTERN_STORAGE_FAILED' ? S.block.patternFailed : settings ? S.block.settingsFailed : S.workspace.dialogs.createFailed)
        }).finally(() => setCreating(false))
      }} style={{ ...panel, width: 540, borderRadius: 14 }}>
      <h3 style={{ margin: 0, fontSize: 20 }}>{title}</h3>
      <div style={{ color: 'var(--fg-tertiary)', fontSize: 12 }}>{S.workspace.dialogs.studentPrefix}{studentName}</div>
      <div className="block-plan-name-weeks">
        <label><span style={calendarFieldLabel}>{S.workspace.dialogs.planName}</span>
          <input autoFocus value={name} disabled={!!settings || creating} onChange={event => setName(event.target.value)} style={calendarInputStyle} /></label>
        <fieldset disabled={creating || weeksLocked}><legend>{S.block.weeks}</legend>
          {settings ? <input aria-label={S.block.weeks} type="number" min={1} max={52} value={weeks} onChange={event => setWeeks(Math.max(1, Math.min(52, Number(event.target.value) || 1)))} />
            : <div className="block-week-options">{[3, 4, 5, 6].map(value => <button type="button" key={value} aria-pressed={weeks === value} onClick={() => setWeeks(value)}>{value}</button>)}</div>}
        </fieldset>
      </div>
      <fieldset disabled={creating}><legend>{S.block.trainingDays}</legend><div className="block-training-days">
        {S.common.weekdaysMondayFirst.map((label, day) => <button key={day} type="button" data-training-weekday={day}
          aria-pressed={days.includes(day)} className={day === first && days.includes(day) ? 'first' : ''}
          onClick={() => {
            const next = days.includes(day) ? days.filter(value => value !== day) : [...days, day]
            setDays(next)
            if (next.length && !next.includes(first)) chooseFirst(next[0])
          }}>{label}<small>{days.includes(day) ? `D${ordered.indexOf(day) + 1}` : '—'}</small></button>)}
      </div></fieldset>
      <fieldset disabled={creating}><legend>{S.block.firstDay}</legend><div className="block-first-days">
        {[...days].sort((a,b) => a-b).map(day => <button key={day} type="button" data-d1={day} aria-pressed={day === first} onClick={() => chooseFirst(day)}>{S.common.weekdaysMondayFirst[day]}</button>)}
      </div></fieldset>
      <label className="block-first-date"><span style={calendarFieldLabel}>{S.block.firstDate}</span>
        <input type="date" aria-label={S.block.firstDate} value={startDate} title={calendarLocked ? calendarLockedHint : undefined} disabled={calendarLocked || creating}
          onChange={event => { setStartDate(event.target.value); setError('') }} style={calendarInputStyle} />
      </label>
      {startDate && !calendarLocked && !valid && weekdayIndex(startDate) !== first && <p role="alert">{S.block.invalidDate}</p>}
      <p className="block-schedule-hint">{S.block.dateHint}<br />{S.block.ends(mmdd(planEndISO(startDate, weeks)), weeks, weeks * days.length)}</p>
      <div className="block-pattern-preview">{ordered.map((day, index) => <span key={day}>D{index + 1} {S.common.weekdaysMondayFirst[day]}</span>)}</div>
      {error && <div role="alert" style={{ color: 'var(--brand-red)', fontSize: 12 }}>{error}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" disabled={creating} onClick={onClose} style={secondaryButton}>{S.common.cancel}</button>
        <button type="submit" disabled={!valid || creating} style={{ ...primaryButton, opacity: !valid || creating ? 0.55 : 1 }}>{creating ? S.editor.saving : settings ? S.editor.apply : S.workspace.dialogs.createPlan}</button>
      </div>
    </form>
  </div>
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
