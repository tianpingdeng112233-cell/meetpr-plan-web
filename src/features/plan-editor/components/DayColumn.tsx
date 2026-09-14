import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { DayCol, ColWidths, ColKey, ExerciseRow } from '../types'
import { COLS, hasOpaqueSetSettings, isRestDay } from '../types'
import {
  filterRepsInput,
  filterStrengthInput,
  getBoundRowInputIssue,
  INPUT_GUARD_REASONS,
  intensityReason,
} from '../inputGuard'
import {
  clearPctAnchor,
  displayedRowIntensity,
  displayedWeightMode,
  inferredIntensityMode,
  isSingleValueIntensity,
  materializeIntensityRow,
  rowIntensity,
  rowIntensityBoxes,
  rowPctAnchor,
  rowWeightBoxes,
} from '../intensityModel'
import { actualIntensityChip, actualWeightTone, formatActualWeight, type ActualSet } from '../actuals'
import type { LoadMode, RowIntensity } from '../types'
import { compactTonnage, summarizeDaySection, type DaySectionSummary } from '../weeklySummary'
import {
  orderRowsForDisplay,
  planCellKey,
  samePlanCell,
  type PlanCellField,
  type PlanCellSelection,
} from '../selectionModel'
import { fmt, S } from '../../../i18n/strings'
import { STABLE_ZH } from '../../../i18n/stable-zh'
import { addDays, dowLabel, mdLabel } from '../mapping'

export interface WeekBandBadge {
  label: string
  tone: 'squat' | 'bench' | 'deadlift' | 'muscle' | 'neutral'
}

export interface WeekBandDayView {
  badgeFor: (row: ExerciseRow) => WeekBandBadge | null
  /** Display-only ordinal among this week's non-empty training days. */
  trainingDayOrdinal: number | null
  weekdayLabel: string | null
}

interface Props {
  weekNumber?: number
  columnLetter?: string
  day: DayCol
  colW: ColWidths
  selected: boolean
  selectedRowId?: string | null
  selectedRowIds?: ReadonlySet<string>
  cellSelection?: PlanCellSelection | null
  /** v1.3 experiment: selected-day context rendered in the dark day header. */
  headerContext?: React.ReactNode
  onSelect: () => void
  onSelectRow?: (rowId: string, modifiers?: { toggle: boolean; range: boolean }) => void
  onSelectCell?: (rowId: string, field: PlanCellField, setIndex?: number) => void
  onSetsDraftChange?: (rowId: string, draft: string | null) => void
  readOnly?: boolean
  dayMoveState?: 'source' | 'target' | 'invalid'
  dayMoveDisabledHint?: string | null
  onDayMoveStart?: (e: React.MouseEvent) => void
  onResizeStart: (col: ColKey, e: React.MouseEvent) => void
  onNameFocus: (rowId: string, name: string, el: HTMLElement) => void
  onNameChange: (rowId: string, value: string, el: HTMLElement) => void
  onNameKeyDown?: (rowId: string, event: React.KeyboardEvent<HTMLInputElement>) => void
  onNameCompositionStart?: (rowId: string) => void
  onNameCompositionEnd?: (rowId: string) => void
  onNameBlur: (rowId: string) => void
  onAddRow: (tier: 'main' | 'aux') => void
  /** Display tier resolver (catalog exercise_type based); absent = flat legacy list. */
  rowTier?: (row: ExerciseRow) => 'main' | 'aux'
  onEditRow: (rowId: string, updater: (r: ExerciseRow) => ExerciseRow) => void
  onReorderRow?: (dragRowId: string, targetRowId: string, position: 'before' | 'after') => void
  onDeleteRow: (rowId: string) => void
  /** Focused week-band presentation; omitted for the legacy standalone view/tests. */
  weekBand?: WeekBandDayView
  /** SPEC-038: 学员实际完成组(按 serverRowId 对齐);absent = 无打卡数据。 */
  actualsForRow?: (row: ExerciseRow) => ActualSet[] | null
  /** pct 目标换算实际 % 用的主项 e1RM;不可得返回 null。 */
  e1rmForRow?: (row: ExerciseRow) => number | null
  shiftControl?: {
    anchorDate: string
    weekNumber: number
    dayOrdinal: number
    affectedDays: number
    completedDays: number
    periodEndDate: string
    periodEndDateAfterShift: (offsetDays: number) => string
    onShift: (offsetDays: number) => Promise<void>
  }
}

const head: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '.06em',
  color: 'var(--mut)', textTransform: 'uppercase',
}
const stop = (e: React.MouseEvent) => e.stopPropagation()

function ShiftBadge({ day }: { day: DayCol }) {
  if (!day.shiftBadge) return null
  return (
    <span
      data-shift-badge=""
      title={S.editor.shiftBadgeTitle(
        mdLabel(addDays(day.shiftBadge.originalDate, 0)),
        day.shiftBadge.days,
      )}
      style={{
        display: 'inline-flex', alignItems: 'center', flex: 'none', padding: '1px 4px',
        border: '1px solid var(--warn)', borderRadius: 'var(--r-sm)', color: 'var(--warn)',
        fontSize: 8, fontWeight: 600, lineHeight: 1.2, cursor: 'help',
      }}
    >
      {S.editor.shifted}
    </span>
  )
}

function WeekBandCalendarLabel({ weekdayLabel, dateLabel }: {
  weekdayLabel: string | null
  dateLabel: string
}) {
  return (
    <span className="dayhead-calendar" data-day-calendar-label="">
      {weekdayLabel && <span className="dayhead-weekday">{weekdayLabel}</span>}
      <span className="dayhead-date">{dateLabel}</span>
    </span>
  )
}

function ShiftArrow() {
  return (
    <svg aria-hidden="true" viewBox="0 0 12 12" width="12" height="12" fill="none">
      <path d="M2 6h7M6.5 2.5 10 6 6.5 9.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PlanShiftControl({ control, dayName }: {
  control: NonNullable<Props['shiftControl']>
  dayName: string
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('1')
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState('')
  const [panelPosition, setPanelPosition] = useState<{ top: number; left: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const offsetDays = Math.max(1, Math.min(30, Number.parseInt(draft, 10) || 1))
  const target = addDays(control.anchorDate, offsetDays)
  const periodEnd = addDays(control.periodEndDateAfterShift(offsetDays), 0)
  const clampDraft = () => setDraft(String(offsetDays))
  const changeBy = (delta: number) => setDraft(String(Math.max(1, Math.min(30, offsetDays + delta))))

  useLayoutEffect(() => {
    if (!open) return
    const updatePosition = () => {
      const rect = buttonRef.current?.closest('.dayhead')?.getBoundingClientRect()
      if (!rect) return
      setPanelPosition({
        top: rect.bottom + 6,
        left: Math.max(8, Math.min(rect.left, window.innerWidth - 348)),
      })
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open])

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="day-shift-action"
        onMouseDown={(event) => { event.preventDefault(); event.stopPropagation() }}
        onClick={(event) => {
          event.stopPropagation()
          setDraft('1')
          setError('')
          setOpen((value) => !value)
        }}
      >
        <ShiftArrow />{S.editor.shiftAction}
      </button>
      {open && panelPosition && createPortal((
        <>
          <span className="day-shift-dismiss" onClick={(event) => { event.stopPropagation(); setOpen(false) }} />
          <span
            className="day-shift-panel"
            data-plan-shift-panel=""
            style={panelPosition}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <span className="day-shift-title">
              {S.editor.shiftPanelTitle(mdLabel(addDays(control.anchorDate, 0)), control.weekNumber, control.dayOrdinal)}
            </span>
            <span className="day-shift-subtitle">{S.editor.shiftPanelSubtitle}</span>
            <span className="day-shift-stepper-row">
              <span className="day-shift-stepper">
                <button type="button" aria-label={S.editor.decreaseShiftDays} disabled={offsetDays <= 1 || applying} onClick={() => changeBy(-1)}>−</button>
                <input
                  aria-label={S.editor.shiftDaysUnit}
                  inputMode="numeric"
                  value={draft}
                  disabled={applying}
                  onChange={(event) => {
                    const digits = event.currentTarget.value.replace(/\D/g, '').slice(0, 2)
                    setDraft(digits === '' ? '' : String(Math.max(1, Math.min(30, Number(digits)))))
                  }}
                  onBlur={clampDraft}
                />
                <button type="button" aria-label={S.editor.increaseShiftDays} disabled={offsetDays >= 30 || applying} onClick={() => changeBy(1)}>+</button>
                <span>{S.editor.shiftDaysUnit}</span>
              </span>
              <span className="day-shift-range">{S.editor.shiftDaysRange}</span>
            </span>
            <span className="day-shift-preview">
              <span>{S.editor.shiftPreviewDay(
                control.weekNumber,
                control.dayOrdinal,
                dayName,
                mdLabel(target),
                dowLabel(target),
              )}</span>
              <span>{S.editor.shiftAffectedDays(control.affectedDays, control.completedDays)}</span>
              <span>{S.editor.shiftPeriodEnd(mdLabel(addDays(control.periodEndDate, 0)), mdLabel(periodEnd))}</span>
            </span>
            {control.affectedDays === 0
              ? <span className="day-shift-error">{S.editor.shiftNoTargetDays}</span>
              : <span className="day-shift-note">{S.editor.shiftStudentNotice}</span>}
            {error && <span className="day-shift-error" role="alert">{error}</span>}
            <span className="day-shift-actions">
              <button type="button" disabled={applying} onClick={() => setOpen(false)}>{S.common.cancel}</button>
              <button
                type="button"
                className="apply"
                disabled={applying || control.affectedDays === 0}
                onClick={() => {
                  setApplying(true)
                  setError('')
                  void control.onShift(offsetDays)
                    .then(() => setOpen(false))
                    .catch((caught: unknown) => {
                      const code = typeof caught === 'object' && caught !== null && 'code' in caught
                        ? String(Reflect.get(caught, 'code'))
                        : ''
                      setError(code === 'SHIFT_NO_TARGET_DAYS' ? S.editor.shiftNoTargetDays : S.editor.shiftFailed)
                    })
                    .finally(() => setApplying(false))
                }}
              >
                {S.editor.shiftSubmit(offsetDays)}
              </button>
            </span>
          </span>
        </>
      ), document.body)}
    </>
  )
}

const baseInput: React.CSSProperties = {
  background: 'transparent', border: '1px solid transparent', borderRadius: 3,
  color: 'var(--txt)', fontSize: 11, fontFamily: 'var(--font-sans)', outline: 'none',
  padding: '1px 2px', boxSizing: 'border-box', fontVariantNumeric: 'tabular-nums',
}

function setBoxesLen(boxes: ExerciseRow['boxes'], n: number) {
  if (n <= boxes.length) return boxes.slice(0, n)
  // Adding a set should preserve the prescription the coach can already see;
  // an empty invisible set used to make the displayed count differ from save.
  const last = boxes[boxes.length - 1] ?? { val: '', empty: true }
  return [...boxes, ...Array.from({ length: n - boxes.length }, () => ({ ...last }))]
}

function resizeRowSets(row: ExerciseRow, n: number): ExerciseRow {
  return {
    ...row,
    boxes: setBoxesLen(row.boxes, n),
    intensityBoxes: row.intensityBoxes ? setBoxesLen(row.intensityBoxes, n) : row.intensityBoxes,
    aux: n > 0 ? false : row.aux,
  }
}

/** Controlled input whose value passes through a character filter without breaking
 *  typing ergonomics: IME composition is committed (and filtered) only on
 *  compositionend so the candidate window keeps working, and when filtering drops
 *  characters mid-value the caret is restored to the end of the kept prefix instead
 *  of jumping to the end of the input. */
function GuardedInput({ value, filter, onValue, ...rest }: {
  value: string
  filter: (raw: string) => string
  onValue: (filtered: string) => void
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'filter'>) {
  const ref = useRef<HTMLInputElement>(null)
  const composing = useRef(false)
  const pendingCaret = useRef<number | null>(null)
  useLayoutEffect(() => {
    if (pendingCaret.current != null) {
      ref.current?.setSelectionRange(pendingCaret.current, pendingCaret.current)
      pendingCaret.current = null
    }
  })
  const commit = (el: HTMLInputElement) => {
    const raw = el.value
    const filtered = filter(raw)
    if (filtered !== raw) {
      const caret = el.selectionStart ?? raw.length
      pendingCaret.current = filter(raw.slice(0, caret)).length
    }
    onValue(filtered)
  }
  return (
    <input
      {...rest} ref={ref} value={value}
      onCompositionStart={() => { composing.current = true }}
      onCompositionEnd={(e) => { composing.current = false; commit(e.currentTarget) }}
      onChange={(e) => {
        // Mid-composition the controlled value must track the IME text verbatim,
        // otherwise React snaps the DOM back and kills the candidate window.
        // The guard predicate flags the transient text; compositionend filters it.
        if (composing.current) { onValue(e.currentTarget.value); return }
        commit(e.currentTarget)
      }}
    />
  )
}

/** Set-count field. Backed by a local draft so the digit can be deleted: an empty
 *  field is a valid transient edit state (shown blank) that commits to 0 sets on
 *  blur, instead of snapping back to the current count. Non-empty edits still
 *  commit live so the per-set boxes track the count as the coach types. */
function SetsInput({ count, disabled, aux, onCommit, onSelect, onDraftChange }: {
  count: number
  disabled?: boolean
  aux: boolean
  onCommit: (n: number) => void
  onSelect?: () => void
  onDraftChange?: (draft: string | null) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const value = draft ?? (count > 0 ? String(count) : '')
  const clamp = (raw: string) => Math.max(0, Math.min(12, parseInt(raw, 10) || 0))
  return (
    <input
      value={value} inputMode="numeric" disabled={disabled} placeholder={aux ? '—' : ''}
      onFocus={() => onSelect?.()}
      onClick={(event) => { stop(event); onSelect?.() }}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^0-9]/g, '')
        setDraft(raw)
        onDraftChange?.(raw)
        // Empty is a transient edit state (deferred to blur → 0); non-empty commits
        // live so the weight boxes appear/disappear as the count is typed.
        if (raw !== '') onCommit(clamp(raw))
      }}
      onBlur={() => {
        if (draft === null) return
        // Non-empty values already committed live on change; re-committing the
        // same count here would push a duplicate undo record (undo would need
        // two presses). Blur only needs to land the deferred empty→0 case.
        const next = draft.trim() === '' ? 0 : clamp(draft)
        if (next !== count) onCommit(next)
        setDraft(null)
        onDraftChange?.(null)
      }}
      style={{ ...baseInput, width: '100%', textAlign: 'center', color: 'var(--txt)', fontFamily: 'var(--font-mono)', fontWeight: 500 }}
    />
  )
}

/** Section divider between the main-lift block and the accessory block. */
function TierHeader({ label, accent, width, summary }: { label: string; accent?: boolean; width: number; summary: DaySectionSummary }) {
  return (
    <div className={`tierhead${accent ? ' main' : ' aux'}`} style={{ width }}>
      <span className="tierhead-bar" />
      <span className="tierhead-label">{label}</span>
      <span className="tierhead-summary" aria-label={S.editor.tierSummary(summary.sets, summary.tonnage > 0 ? compactTonnage(summary.tonnage) : undefined)}>
        <span>{S.common.countSets(summary.sets)}</span>
        {summary.tonnage > 0 && <span className="tierhead-tonnage"> · {S.editor.totalWeight} {compactTonnage(summary.tonnage)}</span>}
      </span>
    </div>
  )
}

const INTENSITY_OPTIONS: { mode: LoadMode; label: string }[] = [
  { mode: 'pct', label: '%' },
  { mode: 'rpe', label: 'RPE' },
  { mode: 'rir', label: 'RIR' },
  { mode: 'rpe_range', label: S.editor.rpeRange },
]

const PCT_ANCHOR_OPTIONS = [
  { value: 'one_rm', label: '1RM' },
  { value: 'e1rm', label: 'e1RM' },
  { value: 'top_set', label: S.editor.topSetToday },
] as const

function intensityPlaceholder(intensity: RowIntensity): string {
  switch (intensity.mode) {
    case 'pct': return '72.5'
    case 'rpe': return '8'
    case 'rir': return '2'
    case 'rpe_range': return '7'
    case 'weight_range': return '165'
    case 'fixed_weight': return ''
  }
}

/** SPEC-038 §3.2: 学员实际完成 chips,渲染在目标格正下方。
 * tone-off = 超阈红,tone-ok = 阈内黄,力竭强制红,未完成灰。 */
function ActualIntensityLine({ row, actuals, e1rm }: {
  row: ExerciseRow
  actuals: ActualSet[]
  e1rm: number | null
}) {
  return (
    <span className="actual-line" data-actuals="intensity" title={S.editor.actualRpe}>
      <span className="actual-tag">{S.editor.actual}</span>
      {actuals.map((set, position) => {
        const chip = actualIntensityChip(row, position, set, e1rm)
        const tone = set.failed ? 'off' : !set.completed ? 'missed' : chip.tone
        return (
          <span key={set.set_index} className={`actual-chip tone-${tone}`}>
            {chip.text}
          </span>
        )
      })}
    </span>
  )
}

function ActualWeightLine({ row, actuals }: { row: ExerciseRow; actuals: ActualSet[] }) {
  return (
    <span className="actual-line" data-actuals="weight" title={S.editor.actualWeightReps}>
      <span className="actual-tag">{S.editor.actual}</span>
      {actuals.map((set, position) => {
        const tone = set.failed ? 'off' : !set.completed ? 'missed' : actualWeightTone(row, position, set)
        return (
          <span key={set.set_index} className={`actual-chip tone-${tone}`}
            title={set.failed ? S.common.failure : set.completed ? undefined : S.common.notCompleted}>
            {formatActualWeight(set)}{set.failed ? ` ${S.common.failure}` : ''}
          </span>
        )
      })}
    </span>
  )
}

function EditableIntensity({ row, width, edit, selectedCell, selectCell, cellKey, readOnly, actuals, e1rm }: {
  row: ExerciseRow
  width: number
  edit: (u: (r: ExerciseRow) => ExerciseRow) => void
  selectedCell: (setIndex?: number) => boolean
  selectCell: (setIndex?: number) => void
  cellKey: (setIndex?: number) => string
  readOnly?: boolean
  actuals?: ActualSet[] | null
  e1rm?: number | null
}) {
  const actualLine = actuals && actuals.length > 0
    ? <ActualIntensityLine row={row} actuals={actuals} e1rm={e1rm ?? null} />
    : null
  if (row.aux) {
    return (
      <div className="gcell" data-c="int" style={{ width, padding: '4px 5px', display: 'flex', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ color: 'var(--mut)', fontSize: 11 }}>—</span>
        {actualLine}
      </div>
    )
  }
  const issue = getBoundRowInputIssue(row)
  const intensity = displayedRowIntensity(row)
  const singleValue = isSingleValueIntensity(intensity)
  const intensityMode = inferredIntensityMode(row)
  const intensityBoxes = rowIntensityBoxes(row)
  const pctAnchor = rowPctAnchor(row)
  const invalid = (issue?.invalidIntensity ?? false) && !singleValue
  const title = invalid && intensity ? intensityReason(intensity.mode) ?? undefined : undefined
  const updateIntensity = (updater: (current: RowIntensity | null) => RowIntensity | null) => {
    edit((current) => {
      const materialized = materializeIntensityRow(current)
      return { ...materialized, intensity: updater(rowIntensity(materialized)) }
    })
  }
  const editIntensityValue = (index: number, value: string) => edit((current) => {
    const materialized = materializeIntensityRow(current)
    const currentIntensity = rowIntensity(materialized)
    if (!isSingleValueIntensity(currentIntensity)) return materialized
    const mode = inferredIntensityMode(materialized)
    const boxes = rowIntensityBoxes(materialized).map((box, boxIndex) => (
      mode === 'uniform' || boxIndex === index ? { val: value, empty: value === '' } : box
    ))
    return {
      ...materialized,
      intensity: { ...currentIntensity, value: boxes[0]?.val ?? value },
      intensityMode: mode,
      intensityBoxes: boxes,
    }
  })
  const toggleIntensityMode = () => edit((current) => {
    const materialized = materializeIntensityRow(current)
    const currentIntensity = rowIntensity(materialized)
    if (!isSingleValueIntensity(currentIntensity)) return materialized
    const next = inferredIntensityMode(materialized) === 'uniform' ? 'per_set' : 'uniform'
    if (next === 'per_set') return {
      ...materialized,
      intensityMode: next,
      intensityBoxes: rowIntensityBoxes(materialized).map((box) => ({ ...box })),
    }
    const first = rowIntensityBoxes(materialized).find((box) => !box.empty && box.val.trim() !== '')
      ?? { val: '', empty: true }
    return {
      ...materialized,
      intensity: { ...currentIntensity, value: first.val },
      intensityMode: next,
      intensityBoxes: materialized.boxes.map(() => ({ ...first })),
    }
  })
  return (
    <div
      className={`gcell intcell plan-cell${selectedCell(singleValue ? 0 : undefined) ? ' plan-cell-selected' : ''}`}
      data-c="int" data-plan-cell="intensity"
      data-plan-cell-key={!singleValue ? cellKey() : undefined}
      onClick={(event) => { stop(event); selectCell(singleValue ? 0 : undefined) }}
      style={{ width, padding: '4px 4px', gap: 3, display: 'flex', flexWrap: 'wrap', alignItems: 'center' }}
    >
      {row.mode === 'bodyweight' ? (
        <span className="mode-badge bodyweight" title={row.hasLogs ? S.editor.rowLocked : S.editor.bodyweightNoIntensity}>{S.common.bodyweight}</span>
      ) : (
        <>
          <select
            aria-label={S.editor.intensityType}
            value={intensity?.mode ?? ''}
            disabled={readOnly || row.hasLogs}
            title={row.hasLogs ? S.editor.rowLocked : title}
            onFocus={() => selectCell(singleValue ? 0 : undefined)}
            onClick={(event) => { stop(event); selectCell(singleValue ? 0 : undefined) }}
            onChange={(event) => {
              const mode = event.currentTarget.value as LoadMode | ''
              edit((current) => {
                const materialized = clearPctAnchor(materializeIntensityRow(current))
                return {
                  ...materialized,
                  intensity: mode ? { mode, value: '', high: '' } : null,
                  ...(mode === 'pct' ? { pctAnchor: 'one_rm' as const } : {}),
                  intensityMode: mode === 'pct' || mode === 'rpe' || mode === 'rir' ? 'uniform' : undefined,
                  intensityBoxes: mode === 'pct' || mode === 'rpe' || mode === 'rir'
                    ? materialized.boxes.map(() => ({ val: '', empty: true }))
                    : undefined,
                }
              })
            }}
          >
            <option value="">{S.editor.noIntensity}</option>
            {INTENSITY_OPTIONS.map((option) => <option value={option.mode} key={option.mode}>{option.label}</option>)}
          </select>
          {singleValue && intensity && (
            <>
              <button type="button" className="intensity-mode-toggle"
                disabled={readOnly || row.hasLogs || row.boxes.length === 0}
                title={intensityMode === 'uniform' ? S.editor.switchPerSetIntensity : S.editor.switchUniformIntensity}
                onClick={(event) => { stop(event); toggleIntensityMode() }}>
                {intensityMode === 'uniform' ? S.editor.perSet : S.editor.uniformValue}
              </button>
              {(intensityMode === 'uniform' ? intensityBoxes.slice(0, 1) : intensityBoxes).map((box, index) => {
                const sourceIndex = intensityMode === 'uniform' ? 0 : index
                const boxInvalid = intensityMode === 'uniform'
                  ? (issue?.invalidIntensityIndexes.length ?? 0) > 0
                  : issue?.invalidIntensityIndexes.includes(sourceIndex) ?? false
                return (
                  <GuardedInput key={sourceIndex}
                    value={box.empty ? '' : box.val} inputMode="decimal" placeholder={intensityPlaceholder(intensity)}
                    className={`${boxInvalid ? 'guard-invalid ' : ''}plan-cell${selectedCell(sourceIndex) ? ' plan-cell-selected' : ''}`}
                    data-guard-field="intensity" data-set-index={sourceIndex}
                    data-plan-cell="intensity" data-plan-cell-key={cellKey(sourceIndex)}
                    data-input-invalid={boxInvalid ? 'true' : undefined}
                    aria-label={intensityMode === 'uniform' ? S.editor.uniformIntensityValue : S.editor.setIntensityValue(sourceIndex + 1)}
                    aria-invalid={boxInvalid || undefined} title={boxInvalid ? intensityReason(intensity.mode) ?? undefined : undefined}
                    disabled={readOnly || row.hasLogs} filter={filterStrengthInput}
                    onFocus={() => selectCell(sourceIndex)}
                    onClick={(event) => { stop(event); selectCell(sourceIndex) }}
                    onValue={(value) => editIntensityValue(sourceIndex, value)}
                  />
                )
              })}
              <span className="intensity-unit">{intensity.mode === 'pct' ? '%' : ''}</span>
              {intensity.mode === 'pct' && (readOnly || row.hasLogs) && pctAnchor !== 'one_rm' && (
                <span className="pct-anchor-label" data-pct-anchor={pctAnchor}>
                  {pctAnchor === 'e1rm' ? '×e1RM' : S.editor.topSetMultiplier}
                </span>
              )}
              {intensity.mode === 'pct' && !readOnly && !row.hasLogs && (
                <select
                  className="pct-anchor-select"
                  aria-label={S.editor.percentAnchor}
                  value={pctAnchor}
                  title={S.editor.percentReference}
                  onClick={stop}
                  onChange={(event) => {
                    const pctAnchor = event.currentTarget.value as ExerciseRow['pctAnchor']
                    edit((current) => ({ ...materializeIntensityRow(current), pctAnchor }))
                  }}
                >
                  {PCT_ANCHOR_OPTIONS.map((option) => (
                    <option value={option.value} key={option.value}>{option.label}</option>
                  ))}
                </select>
              )}
            </>
          )}
          {intensity && !singleValue && (
            <>
              <GuardedInput
                value={intensity.value} inputMode="decimal" placeholder={intensityPlaceholder(intensity)}
                className={invalid ? 'guard-invalid' : undefined}
                data-guard-field="intensity" data-input-invalid={invalid ? 'true' : undefined}
                aria-invalid={invalid || undefined} title={title}
                disabled={readOnly || row.hasLogs} filter={filterStrengthInput}
                onFocus={() => selectCell()} onClick={stop}
                onValue={(value) => updateIntensity((current) => current ? { ...current, value } : current)}
              />
              <span className="range-separator">–</span>
              <GuardedInput
                value={intensity.high} inputMode="decimal"
                placeholder="8"
                className={invalid ? 'guard-invalid' : undefined}
                data-guard-field="intensity-high" data-input-invalid={invalid ? 'true' : undefined}
                aria-invalid={invalid || undefined} title={title}
                disabled={readOnly || row.hasLogs} filter={filterStrengthInput}
                onFocus={() => selectCell()} onClick={stop}
                onValue={(high) => updateIntensity((current) => current ? { ...current, high } : current)}
              />
              <span className="intensity-unit" />
            </>
          )}
        </>
      )}
      {actualLine}
    </div>
  )
}

function EditableWeight({ row, width, edit, selectedCell, selectCell, cellKey, readOnly, actuals }: {
  row: ExerciseRow
  width: number
  edit: (u: (r: ExerciseRow) => ExerciseRow) => void
  selectedCell: (setIndex: number) => boolean
  selectCell: (setIndex: number) => void
  cellKey: (setIndex: number) => string
  readOnly?: boolean
  actuals?: ActualSet[] | null
}) {
  const actualLine = actuals && actuals.length > 0
    ? <ActualWeightLine row={row} actuals={actuals} />
    : null
  if (row.aux) {
    return (
      <div className="gcell" data-c="weight" style={{ width, padding: '4px 5px', display: 'flex', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ color: 'var(--mut)', fontSize: 11 }}>—</span>
        {actualLine}
      </div>
    )
  }
  const issue = getBoundRowInputIssue(row)
  const weights = rowWeightBoxes(row)
  const displayMode = displayedWeightMode(row)
  const displayed = displayMode === 'fixed_weight' ? weights.slice(0, 1)
    : displayMode === 'per_set' ? weights
      : []
  const editWeight = (index: number, value: string) => edit((current) => {
    const currentDisplayMode = displayedWeightMode(current)
    const materialized = materializeIntensityRow(current)
    const boxes = materialized.boxes.map((box, boxIndex) => (
      currentDisplayMode === 'fixed_weight' || boxIndex === index ? { val: value, empty: value === '' } : box
    ))
    return { ...materialized, boxes, weightMode: currentDisplayMode === 'per_set' ? 'per_set' : 'uniform' }
  })
  const setWeightMode = (next: ReturnType<typeof displayedWeightMode>) => edit((current) => {
    if (displayedWeightMode(current) === next) return current
    const materialized = materializeIntensityRow(current)
    const currentIntensity = rowIntensity(materialized)
    if (next === 'bodyweight') return { ...clearPctAnchor(materialized), mode: 'bodyweight' }
    if (next === 'weight_range') return {
      ...clearPctAnchor(materialized),
      mode: 'kg',
      intensity: { mode: 'weight_range', value: '', high: '' },
      weightMode: 'uniform',
      boxes: materialized.boxes.map(() => ({ val: '', empty: true })),
    }
    const intensity = currentIntensity?.mode === 'weight_range' || currentIntensity?.mode === 'fixed_weight'
      ? null
      : currentIntensity
    if (next === 'per_set') return { ...materialized, mode: 'kg', intensity, weightMode: 'per_set' }
    const first = materialized.boxes.find((box) => !box.empty && box.val.trim() !== '') ?? { val: '', empty: true }
    return {
      ...materialized,
      mode: 'kg',
      intensity,
      weightMode: 'uniform',
      boxes: materialized.boxes.map(() => ({ ...first })),
    }
  })
  const range = rowIntensity(row)?.mode === 'weight_range' ? rowIntensity(row) : null
  const invalidRange = issue?.invalidIntensity ?? false
  const updateRange = (field: 'value' | 'high', value: string) => edit((current) => {
    const materialized = materializeIntensityRow(current)
    const currentIntensity = rowIntensity(materialized)
    if (currentIntensity?.mode !== 'weight_range') return materialized
    return { ...materialized, intensity: { ...currentIntensity, [field]: value } }
  })
  return (
    <div className="gcell weightcell" data-c="weight" style={{ width, padding: '3px 4px', display: 'flex', flexWrap: 'wrap', alignItems: 'center' }}>
      <span className="weight-controls">
        <select
          aria-label={S.editor.weightMode}
          value={displayMode}
          disabled={readOnly || row.hasLogs}
          title={row.hasLogs ? S.editor.rowLocked : undefined}
          onClick={stop}
          onChange={(event) => setWeightMode(event.currentTarget.value as ReturnType<typeof displayedWeightMode>)}
        >
          <option value="fixed_weight">{S.editor.fixedWeight}</option>
          <option value="per_set">{S.editor.perSetWeight}</option>
          <option value="weight_range">{S.editor.weightRange}</option>
          <option value="bodyweight">{S.common.bodyweight}</option>
        </select>
      </span>
      {displayMode === 'bodyweight' && <span className="bodyweight-summary">{S.editor.eachSetBodyweight}</span>}
      {displayMode === 'weight_range' && range && (
        <span className="weight-range-inputs">
          <GuardedInput
            value={range.value} inputMode="decimal" placeholder="165"
            className={invalidRange ? 'guard-invalid' : undefined}
            data-guard-field="weight-range-low" data-input-invalid={invalidRange ? 'true' : undefined}
            data-plan-cell="weight" data-plan-cell-key={cellKey(0)}
            aria-label={S.editor.weightRangeLow} aria-invalid={invalidRange || undefined}
            title={invalidRange ? INPUT_GUARD_REASONS.weightRange : undefined}
            disabled={readOnly || row.hasLogs} filter={filterStrengthInput}
            onFocus={() => selectCell(0)} onClick={(event) => { stop(event); selectCell(0) }}
            onValue={(value) => updateRange('value', value)}
          />
          <span className="range-separator">–</span>
          <GuardedInput
            value={range.high} inputMode="decimal" placeholder="175"
            className={invalidRange ? 'guard-invalid' : undefined}
            data-guard-field="weight-range-high" data-input-invalid={invalidRange ? 'true' : undefined}
            aria-label={S.editor.weightRangeHigh} aria-invalid={invalidRange || undefined}
            title={invalidRange ? INPUT_GUARD_REASONS.weightRange : undefined}
            disabled={readOnly || row.hasLogs} filter={filterStrengthInput}
            onFocus={() => selectCell(0)} onClick={(event) => { stop(event); selectCell(0) }}
            onValue={(value) => updateRange('high', value)}
          />
          <span className="intensity-unit">kg</span>
        </span>
      )}
      {displayed.map((box, index) => {
        const sourceIndex = displayMode === 'fixed_weight' ? 0 : index
        const invalid = displayMode === 'fixed_weight'
          ? (issue?.invalidWeightIndexes.length ?? 0) !== 0
          : issue?.invalidWeightIndexes.includes(sourceIndex) ?? false
        return (
          <GuardedInput
            key={sourceIndex} value={box.empty ? '' : box.val} inputMode="decimal" placeholder="kg"
            className={`${invalid ? 'guard-invalid ' : ''}plan-cell${selectedCell(sourceIndex) ? ' plan-cell-selected' : ''}`}
            data-guard-field="weight" data-input-invalid={invalid ? 'true' : undefined}
            data-plan-cell="weight" data-set-index={sourceIndex} data-plan-cell-key={cellKey(sourceIndex)}
            aria-invalid={invalid || undefined} title={invalid ? INPUT_GUARD_REASONS.kg : undefined}
            disabled={readOnly || row.hasLogs} filter={filterStrengthInput}
            onFocus={() => selectCell(sourceIndex)} onClick={(event) => { stop(event); selectCell(sourceIndex) }}
            onValue={(value) => editWeight(sourceIndex, value)}
          />
        )
      })}
      {row.boxes.length === 0 && <span style={{ color: 'var(--mut)', fontSize: 10 }}>{S.editor.enterSets}</span>}
      {actualLine}
    </div>
  )
}

export function DayColumn({
  weekNumber = 0,
  columnLetter,
  day,
  colW,
  selected,
  selectedRowId,
  selectedRowIds,
  cellSelection,
  headerContext,
  onSelect,
  onSelectRow,
  onSelectCell,
  onSetsDraftChange,
  readOnly,
  dayMoveState,
  dayMoveDisabledHint,
  onDayMoveStart,
  onResizeStart,
  onNameFocus,
  onNameChange,
  onNameKeyDown,
  onNameCompositionStart,
  onNameCompositionEnd,
  onNameBlur,
  onAddRow,
  rowTier,
  onEditRow,
  onReorderRow,
  onDeleteRow,
  weekBand,
  actualsForRow,
  e1rmForRow,
  shiftControl,
}: Props) {
  const [dragRowId, setDragRowId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ rowId: string; position: 'before' | 'after' } | null>(null)
  const dragDisabled = day.rows.some((row) => row.hasLogs)
  const dragDisabledTitle = S.editor.dayLockedForDrag
  const dayMoveClass = dayMoveState ? ` day-move-${dayMoveState}` : ''
  const dayMoveTitle = dayMoveDisabledHint ?? S.editor.moveDayHint
  const dayMoveCursor = dayMoveDisabledHint ? 'not-allowed' : 'grab'
  const resolveTier = (row: ExerciseRow) => rowTier?.(row) ?? (row.isMain ? 'main' : 'aux')
  const displayRows = orderRowsForDisplay(day.rows, rowTier)
  const mainRowsForDay = day.rows.filter((row) => resolveTier(row) === 'main')
  const auxRowsForDay = day.rows.filter((row) => resolveTier(row) === 'aux')
  const mainDaySummary = summarizeDaySection(mainRowsForDay)
  const auxDaySummary = summarizeDaySection(auxRowsForDay)
  const dayTonnage = mainDaySummary.tonnage + auxDaySummary.tonnage
  const firstMainName = mainRowsForDay[0]?.name ?? ''
  const dayTheme = firstMainName.includes(STABLE_ZH.liftNameTokens.squat)
    ? S.editor.squatDay
    : firstMainName.includes(STABLE_ZH.liftNameTokens.bench)
      ? S.editor.benchDay
      : firstMainName.includes(STABLE_ZH.liftNameTokens.deadlift)
        ? S.editor.deadliftDay
        : S.editor.trainingDay
  const dayMeta = S.editor.dayMeta(mainDaySummary.sets, auxDaySummary.sets, compactTonnage(dayTonnage))
  const shiftAction = shiftControl ? <PlanShiftControl control={shiftControl} dayName={dayTheme} /> : null
  const isCellSelected = (rowId: string, field: PlanCellField, setIndex?: number) => samePlanCell(
    cellSelection ?? null,
    { weekNumber, dow: day.dow, rowId, field, setIndex },
  )
  const selectCell = (rowId: string, field: PlanCellField, setIndex?: number) => {
    onSelectCell?.(rowId, field, setIndex)
  }
  const rowSelectionModifiers = (event: React.MouseEvent) => ({
    toggle: event.metaKey || event.ctrlKey,
    range: event.shiftKey,
  })

  const startRowDrag = (e: React.MouseEvent, rowId: string) => {
    if (e.button !== 0 || dragDisabled) return
    e.preventDefault()
    e.stopPropagation()
    setDragRowId(rowId)

    let currentDrop: { rowId: string; position: 'before' | 'after' } | null = null
    const previousUserSelect = document.body.style.userSelect
    const previousCursor = document.body.style.cursor
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'grabbing'

    // Tier sections are derived from the catalog, so a cross-section drop would
    // snap back on re-render; constrain reordering to the dragged row's section.
    const dragRow = day.rows.find((r) => r.id === rowId)
    const dragTier = rowTier && dragRow ? rowTier(dragRow) : null

    const updateDropTarget = (clientX: number, clientY: number) => {
      const target = document.elementsFromPoint(clientX, clientY)
        .map((el) => el.closest<HTMLElement>('[data-rowid]'))
        .find((el): el is HTMLElement => el != null)
      const targetRowId = target?.dataset.rowid
      const targetRow = targetRowId ? day.rows.find((r) => r.id === targetRowId) : undefined
      if (!target || !targetRowId || targetRowId === rowId || !targetRow
        || (dragTier != null && rowTier && rowTier(targetRow) !== dragTier)) {
        currentDrop = null
        setDropTarget(null)
        return
      }
      const rect = target.getBoundingClientRect()
      const position = clientY < rect.top + rect.height / 2 ? 'before' : 'after'
      currentDrop = { rowId: targetRowId, position }
      setDropTarget(currentDrop)
    }

    // Surface invalid targets (cross-section, locked day edges) instead of failing silently.
    const syncCursor = () => {
      document.body.style.cursor = currentDrop ? 'grabbing' : 'not-allowed'
    }

    const onMove = (ev: MouseEvent) => {
      ev.preventDefault()
      updateDropTarget(ev.clientX, ev.clientY)
      syncCursor()
    }

    const cleanup = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.userSelect = previousUserSelect
      document.body.style.cursor = previousCursor
      setDragRowId(null)
      setDropTarget(null)
    }

    const onUp = (ev: MouseEvent) => {
      updateDropTarget(ev.clientX, ev.clientY)
      if (currentDrop) onReorderRow?.(rowId, currentDrop.rowId, currentDrop.position)
      cleanup()
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  if (isRestDay(day) && !weekBand) {
    return (
      <div className={`day restday${selected ? ' sel' : ''}${dayMoveClass}`} data-dow={day.dow} onClick={onSelect}>
        <div className="dayhead" data-day-move-handle="" title={dayMoveTitle} onMouseDown={onDayMoveStart}
          style={{ cursor: dayMoveCursor }}>
          <span className="dayhead-primary">{!dayMoveDisabledHint && <span className="day-move-grip" aria-hidden="true">⋮ </span>}{day.dowLabel}</span>
          <span className="dayhead-date">{day.dateLabel}</span>
          <ShiftBadge day={day} />
          {shiftAction}
        </div>
        <div className="restday-body">
          <span>{S.editor.rest}</span>
        </div>
      </div>
    )
  }

  // In the week-band view, rest is presentation derived solely from whether
  // the day has action rows. The stored flag remains readable for legacy data,
  // but cannot hide rows or force a populated day into a rest presentation.
  if (weekBand && isRestDay(day)) {
    return (
      <div className={`day restday week-band-rest-card${selected ? ' sel' : ''}${dayMoveClass}`}
        data-dow={day.dow} data-derived-rest="true" onClick={onSelect}>
        <div className="dayhead week-band-rest-line" data-day-move-handle="" title={dayMoveTitle} onMouseDown={onDayMoveStart}
          style={{ cursor: dayMoveCursor }}>
          <span className="dayhead-line">
            {!dayMoveDisabledHint && <span className="day-move-grip" aria-hidden="true">⋮</span>}
            <WeekBandCalendarLabel weekdayLabel={weekBand.weekdayLabel} dateLabel={day.dateLabel} />
            <ShiftBadge day={day} />
            {shiftAction}
            {columnLetter && <kbd className="day-column-key">{columnLetter}</kbd>}
          </span>
          <span className="week-band-rest-label">{S.editor.rest}</span>
          {headerContext}
          {!readOnly && (
            <button type="button" className="week-band-rest-add" data-add-tier="main"
              onMouseDown={stop} onClick={(event) => { stop(event); onAddRow('main') }}>
              <span aria-hidden="true">＋</span> {S.editor.addAction}
            </button>
          )}
        </div>
      </div>
    )
  }

  const frozenWidth = weekBand ? 28 : 0
  const total = COLS.reduce((s, k) => s + colW[k], 0) + frozenWidth
  let acc = frozenWidth
  const dividers = COLS.map((k) => { acc += colW[k]; return { col: k, left: acc } })

  return (
    <div className={`day${selected ? ' sel' : ''}${dayMoveClass}${weekBand ? ' week-band-day' : ''}`} data-dow={day.dow} onClick={onSelect}>
      <div className="dayhead" data-day-move-handle="" title={dayMoveTitle} onMouseDown={onDayMoveStart}
        style={{ cursor: dayMoveCursor }}>
        <span className="dayhead-line">
          {!dayMoveDisabledHint && <span className="day-move-grip" aria-hidden="true">⋮</span>}
          <span className="dayhead-primary">{weekBand ? `D${weekBand.trainingDayOrdinal}` : day.dowLabel}</span>
          {weekBand && <WeekBandCalendarLabel weekdayLabel={weekBand.weekdayLabel} dateLabel={day.dateLabel} />}
          {!weekBand && <span className="dayhead-date">{day.dateLabel}</span>}
          <ShiftBadge day={day} />
          {shiftAction}
          {columnLetter && <kbd className="day-column-key">{columnLetter}</kbd>}
        </span>
        <span className="dayhead-theme">{dayTheme}</span>
        <span className="dayhead-meta">{dayMeta}</span>
        {headerContext}
      </div>

      <div className="daygrid" style={{ width: total, fontVariantNumeric: 'tabular-nums' }}>
        <div className="gridhead" style={{ display: 'flex', alignItems: 'stretch', background: 'var(--card-bg)', borderBottom: '1px solid var(--line)' }}>
          {weekBand && <div className="gcell week-band-frozen week-band-index" data-c="index" style={{ width: 28, padding: '4px 3px', textAlign: 'center', ...head }}>#</div>}
          <div className={`gcell${weekBand ? ' week-band-frozen' : ''}`} data-c="name" style={{ width: colW.name, padding: '4px 6px', ...head }}>{S.common.action}</div>
          <div className="gcell" data-c="sets" style={{ width: colW.sets, padding: '4px 4px', textAlign: 'center', ...head }}>{S.common.sets}</div>
          <div className="gcell" data-c="reps" style={{ width: colW.reps, padding: '4px 4px', textAlign: 'center', ...head }}>{S.common.reps}</div>
          <div className="gcell" data-c="int" style={{ width: colW.int, padding: '4px 6px', ...head }}>{S.common.intensity}</div>
          <div className="gcell" data-c="weight" style={{ width: colW.weight, padding: '4px 6px', ...head }}>{S.common.weight}</div>
          <div className="gcell" data-c="note" style={{ width: colW.note, padding: '4px 6px', ...head }}>{S.common.notes}</div>
        </div>

        {(() => {
        const renderRow = (row: ExerciseRow, rowNumber?: number) => {
          const edit = (u: (r: ExerciseRow) => ExerciseRow) => onEditRow(row.id, u)
          const inputIssue = getBoundRowInputIssue(row)
          const isSelectedRow = selectedRowIds?.has(row.id) ?? selectedRowId === row.id
          const dropPosition = dropTarget?.rowId === row.id ? dropTarget.position : null
          const badge = weekBand ? weekBand.badgeFor(row) : null
          return (
            <div
              key={row.id}
              data-rowid={row.id}
              data-locked={row.hasLogs ? 'true' : 'false'}
              data-drag-disabled={dragDisabled ? 'true' : 'false'}
              className={`exrow${resolveTier(row) === 'aux' ? ' aux' : ''}${row.hasLogs ? ' locked' : ''}${(actualsForRow?.(row)?.length ?? 0) > 0 ? ' has-actuals' : ''}${isSelectedRow ? ' row-sel' : ''}${dragRowId === row.id ? ' row-dragging' : ''}${dropPosition ? ` row-drop-${dropPosition}` : ''}`}
              onMouseDownCapture={(e) => {
                if (e.button === 0) onSelectRow?.(row.id, rowSelectionModifiers(e))
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="exercise-row-main">
                {weekBand && (
                  <div className="gcell week-band-frozen week-band-index" data-c="index" style={{ width: 28 }}>
                    {rowNumber}
                  </div>
                )}
                <div
                  className={`gcell plan-cell${weekBand ? ' week-band-frozen' : ''}${isCellSelected(row.id, 'name') ? ' plan-cell-selected' : ''}`}
                  data-c="name"
                  data-plan-cell="name"
                  data-plan-cell-key={planCellKey({ weekNumber, dow: day.dow, rowId: row.id, field: 'name' })}
                  style={{ width: colW.name }}
                >
                  <span
                    className="rowdrag"
                    title={dragDisabled ? dragDisabledTitle : S.editor.dragRowHint}
                    onMouseDown={(e) => startRowDrag(e, row.id)}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (e.detail === 0) onSelectRow?.(row.id, rowSelectionModifiers(e))
                    }}
                    style={{ cursor: dragDisabled ? 'not-allowed' : undefined, opacity: dragDisabled ? 0.45 : undefined }}
                  >
                    ⋮
                  </span>
                  {badge && <span className={`week-band-badge ${badge.tone}`}>{badge.label}</span>}
                  <input
                    value={fmt.exerciseName({ name: row.name, name_en: row.nameEn })} placeholder={S.editor.exercisePlaceholder}
                    disabled={readOnly || row.hasLogs}
                    onMouseDown={stop}
                    onClick={(event) => { stop(event); selectCell(row.id, 'name') }}
                    onFocus={(e) => {
                      selectCell(row.id, 'name')
                      onNameFocus(row.id, row.name, e.currentTarget)
                    }}
                    onChange={(e) => onNameChange(row.id, e.target.value, e.currentTarget)}
                    onKeyDown={(e) => onNameKeyDown?.(row.id, e)}
                    onCompositionStart={() => onNameCompositionStart?.(row.id)}
                    onCompositionEnd={() => onNameCompositionEnd?.(row.id)}
                    onBlur={() => onNameBlur(row.id)}
                    style={{ ...baseInput, flex: 1, minWidth: 0, color: 'var(--txt)', fontWeight: 500 }}
                  />
                  {row.ku && <span className="row-mark bound">✓</span>}
                  {row.custom && <span className="row-mark custom">{S.editor.customMark}</span>}
                  {hasOpaqueSetSettings(row) && (
                    <span className="row-mark opaque-set" title={S.editor.opaqueSetSettingsHint}>≠</span>
                  )}
                  {row.hasLogs && (
                    <span className="row-mark locked" title={row.conflictMessage ?? S.editor.rowLocked}>{S.editor.lockedMark}</span>
                  )}
                  {row.conflictMessage && <span className="row-mark conflict" title={row.conflictMessage}>!</span>}
                </div>

                {/* 组 — editable on aux rows too: a zero-set (note-driven) row can't publish, so
                    typing a count here is how the coach turns it into a real tracked exercise. */}
                <div
                  className={`gcell numeric-cell plan-cell${isCellSelected(row.id, 'sets') ? ' plan-cell-selected' : ''}`}
                  data-c="sets"
                  data-plan-cell="sets"
                  data-plan-cell-key={planCellKey({ weekNumber, dow: day.dow, rowId: row.id, field: 'sets' })}
                  style={{ width: colW.sets }}
                >
                  <SetsInput count={row.boxes.length} disabled={readOnly || row.hasLogs} aux={row.aux}
                    onSelect={() => selectCell(row.id, 'sets')}
                    onDraftChange={(draft) => onSetsDraftChange?.(row.id, draft)}
                    onCommit={(n) => edit((r) => resizeRowSets(r, n))} />
                </div>

                <div
                  className={`gcell numeric-cell plan-cell${isCellSelected(row.id, 'reps') ? ' plan-cell-selected' : ''}`}
                  data-c="reps"
                  data-plan-cell="reps"
                  data-plan-cell-key={planCellKey({ weekNumber, dow: day.dow, rowId: row.id, field: 'reps' })}
                  style={{ width: colW.reps }}
                >
                  <GuardedInput value={row.reps === '—' ? '' : row.reps} inputMode="text" placeholder="—"
                    className={inputIssue?.invalidReps ? 'guard-invalid' : undefined}
                    data-guard-field="reps" data-input-invalid={inputIssue?.invalidReps ? 'true' : undefined}
                    aria-invalid={inputIssue?.invalidReps || undefined}
                    title={inputIssue?.invalidReps ? INPUT_GUARD_REASONS.reps : undefined}
                    disabled={readOnly || row.hasLogs}
                    filter={filterRepsInput}
                    onFocus={() => selectCell(row.id, 'reps')}
                    onClick={(event) => { stop(event); selectCell(row.id, 'reps') }}
                    onValue={(value) => {
                      edit((r) => ({ ...r, reps: value === '' ? '—' : value }))
                    }}
                    style={{ ...baseInput, width: '100%', textAlign: 'center', color: 'var(--txt)', fontFamily: 'var(--font-mono)', fontWeight: 500 }} />
                </div>

                <EditableIntensity
                  row={row}
                  width={colW.int}
                  edit={edit}
                  selectedCell={(setIndex) => isCellSelected(row.id, 'intensity', setIndex)}
                  selectCell={(setIndex) => selectCell(row.id, 'intensity', setIndex)}
                  cellKey={(setIndex) => planCellKey({
                    weekNumber, dow: day.dow, rowId: row.id, field: 'intensity', setIndex,
                  })}
                  readOnly={readOnly}
                  actuals={actualsForRow?.(row) ?? null}
                  e1rm={e1rmForRow?.(row) ?? null}
                />

                <EditableWeight
                  row={row}
                  width={colW.weight}
                  edit={edit}
                  selectedCell={(setIndex) => isCellSelected(row.id, 'weight', setIndex)}
                  selectCell={(setIndex) => selectCell(row.id, 'weight', setIndex)}
                  cellKey={(setIndex) => planCellKey({
                    weekNumber,
                    dow: day.dow,
                    rowId: row.id,
                    field: 'weight',
                    setIndex,
                  })}
                  readOnly={readOnly}
                  actuals={actualsForRow?.(row) ?? null}
                />

                <div className="gcell note-cell" data-c="note" style={{ width: colW.note }}>
                  <input value={row.note} inputMode="text" onClick={stop} placeholder=""
                    disabled={readOnly || row.hasLogs}
                    onChange={(e) => edit((r) => ({ ...r, note: e.target.value }))}
                    style={{ ...baseInput, width: '100%', fontSize: 10, color: 'var(--txt)', paddingRight: 14 }} />
                  {!row.hasLogs && (
                    <span className="rowdel" title={S.editor.deleteRow}
                      onClick={(e) => { e.stopPropagation(); onDeleteRow(row.id) }}>✕</span>
                  )}
                </div>
              </div>
            </div>
          )
        }
        const addRowEntry = (tier: 'main' | 'aux') => (
          <div className="popitem" data-add-tier={tier} onClick={(e) => { e.stopPropagation(); onAddRow(tier) }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderTop: '1px dashed var(--bd)', color: 'var(--mut)', cursor: 'pointer', fontSize: 11 }}>
            <span style={{ color: 'var(--ink)', fontWeight: 700 }}>＋</span> {S.editor.addAction}
          </div>
        )
        const addWeekBandRowEntry = (tier: 'main' | 'aux') => !readOnly && (
          <button type="button" className="week-band-section-add" data-add-tier={tier}
            onClick={(event) => { event.stopPropagation(); onAddRow(tier) }}>
            <span aria-hidden="true">＋</span> {tier === 'main' ? S.editor.mainOrVariation : S.common.accessoryItem}
          </button>
        )
        if (weekBand) {
          const mainRows = displayRows.filter((row) => resolveTier(row) === 'main')
          const auxRows = displayRows.filter((row) => resolveTier(row) === 'aux')
          const mainSummary = summarizeDaySection(mainRows)
          const auxSummary = summarizeDaySection(auxRows)
          let rowNumber = 0
          const renderRows = (rows: ExerciseRow[]) => rows.map((row) => {
            rowNumber += 1
            return renderRow(row, rowNumber)
          })
          return (
            <>
              {(mainRows.length > 0 || !readOnly) && <TierHeader label={S.editor.mainAndVariations} accent width={total} summary={mainSummary} />}
              {renderRows(mainRows)}
              {addWeekBandRowEntry('main')}
              {(auxRows.length > 0 || !readOnly) && <TierHeader label={S.common.accessoryItem} width={total} summary={auxSummary} />}
              {renderRows(auxRows)}
              {addWeekBandRowEntry('aux')}
            </>
          )
        }
        if (!rowTier) {
          return (
            <>
              {displayRows.map((row) => renderRow(row))}
              {selected && addRowEntry('aux')}
            </>
          )
        }
        const mainRows = displayRows.filter((r) => rowTier(r) === 'main')
        const auxRows = displayRows.filter((r) => rowTier(r) === 'aux')
        const mainSummary = summarizeDaySection(mainRows)
        const auxSummary = summarizeDaySection(auxRows)
        return (
          <>
            {(mainRows.length > 0 || selected) && <TierHeader label={S.editor.mainAndVariations} accent width={total} summary={mainSummary} />}
            {mainRows.map((row) => renderRow(row))}
            {selected && addRowEntry('main')}
            {(auxRows.length > 0 || selected) && <TierHeader label={S.common.accessoryItem} width={total} summary={auxSummary} />}
            {auxRows.map((row) => renderRow(row))}
            {selected && addRowEntry('aux')}
          </>
        )
        })()}

        {dividers.map((d) => (
          <div key={d.col} className="coldiv" style={{ left: d.left }}
            onMouseDown={(e) => onResizeStart(d.col, e)} onClick={(e) => e.stopPropagation()} />
        ))}
      </div>
    </div>
  )
}
