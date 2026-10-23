import { WeekdayPicker } from '../plan-editor/import/WeekdayPicker'
import { getImportStatus, type ImportStatus } from '../../api/planImports'
import { ImportPlanDialog, type ImportedPlan } from '../plan-editor/import/ImportPlanDialog'
import type { ExerciseIndex } from '../plan-editor/exerciseIndex'
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

export function NewPlanDialog({ open, studentName, onClose, onCreate, settings, traineeId, exerciseIndex, onImported, calendarLocked = false, calendarLockedHint, weeksLocked = false }: {
  open: boolean
  studentName: string
  onClose: () => void
  onCreate: (name: string, weeks: number, startDate: string, anchorWeekday: number, weekdays: number[]) => Promise<void>
  traineeId?: string
  exerciseIndex?: ExerciseIndex | null
  onImported?: (result: ImportedPlan) => void | Promise<void>
  settings?: BlockPlanSettings
  calendarLockedHint?: string
  calendarLocked?: boolean
  weeksLocked?: boolean
}) {
  const [importStatus, setImportStatus] = useState<ImportStatus | null>(null)
  const [method, setMethod] = useState<'manual' | 'import'>('manual')
  useEffect(() => {
    setMethod('manual'); setImportStatus(null)
    if (!open || settings || !traineeId) return
    let alive = true
    void getImportStatus(traineeId).then(status => { if (alive) setImportStatus(status) }).catch(() => {})
    return () => { alive = false }
  }, [open, traineeId, !!settings])
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
    setDays(settings?.weekdays ?? [0, 2, 4, 5])
    setFirst(settings?.weekdays[0] ?? 0)
    setStartDate(settings?.startDate ?? defaultFirstDate(0))
    setCreating(false); setError('')
  }, [open])
  if (!open) return null
  const tabs = importStatus?.enabled && <div className="import-tabs" role="group" aria-label={S.workspace.dialogs.newPlanTitle}>
    <button type="button" aria-pressed={method === 'manual'} onClick={() => setMethod('manual')}>{S.sheetImport.manual}</button>
    <button type="button" aria-pressed={method === 'import'} onClick={() => setMethod('import')}>{S.sheetImport.title}</button>
  </div>
  if (method === 'import' && importStatus && traineeId && exerciseIndex && onImported) return <ImportPlanDialog
    traineeId={traineeId} studentName={studentName} status={importStatus} exerciseIndex={exerciseIndex}
    onCreated={onImported} onClose={onClose} tabs={tabs} onRemainingChange={remaining => setImportStatus(prev => prev ? { ...prev, remaining_today: remaining } : prev)} />
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
      }} style={{ ...panel, width: importStatus?.enabled ? 620 : 540, borderRadius: 14 }}>
      <div className="import-title"><h3 style={{ margin: 0, fontSize: 20 }}>{title}</h3>{tabs}</div>
      <div style={{ color: 'var(--fg-tertiary)', fontSize: 12 }}>{S.workspace.dialogs.studentPrefix}{studentName}</div>
      <div className="block-plan-name-weeks" style={{ display: 'grid', gridTemplateColumns: '1fr' }}>
        <label><span style={calendarFieldLabel}>{S.workspace.dialogs.planName}</span>
          <input autoFocus value={name} disabled={!!settings || creating} onChange={event => setName(event.target.value)} style={calendarInputStyle} /></label>
        <fieldset disabled={creating || weeksLocked}><legend>{S.block.weeks}</legend>
          <div className="block-week-options">{Array.from({ length: 10 }, (_, i) => i + 3).map(value => <button type="button" key={value} aria-pressed={weeks === value} onClick={() => setWeeks(value)}>{value}</button>)}</div>
          {settings && (weeks < 3 || weeks > 12) && <small>{S.common.countWeeks(weeks)}</small>}
        </fieldset>
      </div>
      <WeekdayPicker days={days} first={first} disabled={creating} onDaysChange={setDays} onFirstChange={chooseFirst} />
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
