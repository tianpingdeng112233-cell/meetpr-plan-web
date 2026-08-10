import { useLayoutEffect, useRef, useState } from 'react'
import type { DayCol, ColWidths, ColKey, ExerciseRow } from '../types'
import { COLS, isRestDay } from '../types'
import {
  filterRepsInput,
  filterStrengthInput,
  getBoundRowInputIssue,
  INPUT_GUARD_REASONS,
  intensityReason,
} from '../inputGuard'
import {
  inferredIntensityMode,
  inferredWeightMode,
  isSingleValueIntensity,
  materializeIntensityRow,
  rowIntensity,
  rowIntensityBoxes,
  rowWeightBoxes,
} from '../intensityModel'
import type { LoadMode, RowIntensity } from '../types'
import { compactTonnage, summarizeDaySection, type DaySectionSummary } from '../weeklySummary'
import {
  orderRowsForDisplay,
  planCellKey,
  samePlanCell,
  type PlanCellField,
  type PlanCellSelection,
} from '../selectionModel'
import type { WeekBandSlot } from '../weekBandModel'

export interface WeekBandBadge {
  label: string
  tone: 'squat' | 'bench' | 'deadlift' | 'muscle' | 'neutral'
}

export interface WeekBandDayView {
  main: WeekBandSlot[]
  aux: WeekBandSlot[]
  rows: ReadonlyMap<string, ExerciseRow>
  badgeFor: (slot: WeekBandSlot) => WeekBandBadge | null
  onQuickAdd: (slot: WeekBandSlot) => void
  dayOrdinal: number
  weekdayLabel: string | null
  anchorWeekday: number | null
  anchorSaving?: boolean
  onAnchorWeekdayChange?: (weekday: number | null) => void
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
  rowReorderDisabledHint?: string | null
  onEditRow: (rowId: string, updater: (r: ExerciseRow) => ExerciseRow) => void
  onReorderRow?: (dragRowId: string, targetRowId: string, position: 'before' | 'after') => void
  onDeleteRow: (rowId: string) => void
  /** Spec 037 aligned week-band rendering; omitted for the legacy standalone view/tests. */
  weekBand?: WeekBandDayView
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
      title={`原定日期：${day.shiftBadge.originalDate}；顺延天数：${day.shiftBadge.days} 天`}
      style={{
        display: 'inline-flex', alignItems: 'center', flex: 'none', padding: '1px 4px',
        border: '1px solid var(--warn)', borderRadius: 'var(--r-sm)', color: 'var(--warn)',
        fontSize: 8, fontWeight: 600, lineHeight: 1.2, cursor: 'help',
      }}
    >
      顺延
    </span>
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
      <span className="tierhead-summary" aria-label={`${summary.sets} 组${summary.tonnage > 0 ? ` · 总重 ${compactTonnage(summary.tonnage)}` : ''}`}>
        <span>{summary.sets} 组</span>
        {summary.tonnage > 0 && <span className="tierhead-tonnage"> · 总重 {compactTonnage(summary.tonnage)}</span>}
      </span>
    </div>
  )
}

const INTENSITY_OPTIONS: { mode: LoadMode; label: string }[] = [
  { mode: 'pct', label: '%1RM' },
  { mode: 'rpe', label: 'RPE' },
  { mode: 'rir', label: 'RIR' },
  { mode: 'weight_range', label: '重量区间' },
  { mode: 'rpe_range', label: 'RPE 区间' },
  { mode: 'fixed_weight', label: '固定重量' },
]

function intensityPlaceholder(intensity: RowIntensity): string {
  switch (intensity.mode) {
    case 'pct': return '72.5'
    case 'rpe': return '8'
    case 'rir': return '2'
    case 'weight_range': return '165'
    case 'rpe_range': return '7'
    case 'fixed_weight': return ''
  }
}

function EditableIntensity({ row, width, edit, selectedCell, selectCell, cellKey, readOnly }: {
  row: ExerciseRow
  width: number
  edit: (u: (r: ExerciseRow) => ExerciseRow) => void
  selectedCell: (setIndex?: number) => boolean
  selectCell: (setIndex?: number) => void
  cellKey: (setIndex?: number) => string
  readOnly?: boolean
}) {
  if (row.aux) {
    return (
      <div className="gcell" data-c="int" style={{ width, padding: '4px 5px', display: 'flex', alignItems: 'center' }}>
        <span style={{ color: 'var(--mut)', fontSize: 11 }}>—</span>
      </div>
    )
  }
  const issue = getBoundRowInputIssue(row)
  const intensity = rowIntensity(row)
  const singleValue = isSingleValueIntensity(intensity)
  const intensityMode = inferredIntensityMode(row)
  const intensityBoxes = rowIntensityBoxes(row)
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
        <span className="mode-badge bodyweight" title={row.hasLogs ? '学员已打卡,此行及其组不可修改' : '自重动作不使用强度体系'}>自重</span>
      ) : (
        <>
          <select
            aria-label="强度类型"
            value={intensity?.mode ?? ''}
            disabled={readOnly || row.hasLogs}
            title={row.hasLogs ? '学员已打卡,此行及其组不可修改' : title}
            onFocus={() => selectCell(singleValue ? 0 : undefined)}
            onClick={(event) => { stop(event); selectCell(singleValue ? 0 : undefined) }}
            onChange={(event) => {
              const mode = event.currentTarget.value as LoadMode | ''
              edit((current) => {
                const materialized = materializeIntensityRow(current)
                return {
                  ...materialized,
                  intensity: mode ? { mode, value: '', high: '' } : null,
                  intensityMode: mode === 'pct' || mode === 'rpe' || mode === 'rir' ? 'uniform' : undefined,
                  intensityBoxes: mode === 'pct' || mode === 'rpe' || mode === 'rir'
                    ? materialized.boxes.map(() => ({ val: '', empty: true }))
                    : undefined,
                }
              })
            }}
          >
            <option value="">不设强度</option>
            {INTENSITY_OPTIONS.map((option) => <option value={option.mode} key={option.mode}>{option.label}</option>)}
          </select>
          {singleValue && intensity && (
            <>
              <button type="button" className="intensity-mode-toggle"
                disabled={readOnly || row.hasLogs || row.boxes.length === 0}
                title={intensityMode === 'uniform' ? '切换为逐组强度值' : '切换为统一强度值'}
                onClick={(event) => { stop(event); toggleIntensityMode() }}>
                {intensityMode === 'uniform' ? '逐组' : '统一值'}
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
                    aria-label={intensityMode === 'uniform' ? '统一强度值' : `第 ${sourceIndex + 1} 组强度值`}
                    aria-invalid={boxInvalid || undefined} title={boxInvalid ? intensityReason(intensity.mode) ?? undefined : undefined}
                    disabled={readOnly || row.hasLogs} filter={filterStrengthInput}
                    onFocus={() => selectCell(sourceIndex)}
                    onClick={(event) => { stop(event); selectCell(sourceIndex) }}
                    onValue={(value) => editIntensityValue(sourceIndex, value)}
                  />
                )
              })}
              <span className="intensity-unit">{intensity.mode === 'pct' ? '%' : ''}</span>
            </>
          )}
          {intensity && !singleValue && intensity.mode !== 'fixed_weight' && (
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
                placeholder={intensity.mode === 'weight_range' ? '175' : '8'}
                className={invalid ? 'guard-invalid' : undefined}
                data-guard-field="intensity-high" data-input-invalid={invalid ? 'true' : undefined}
                aria-invalid={invalid || undefined} title={title}
                disabled={readOnly || row.hasLogs} filter={filterStrengthInput}
                onFocus={() => selectCell()} onClick={stop}
                onValue={(high) => updateIntensity((current) => current ? { ...current, high } : current)}
              />
              <span className="intensity-unit">{intensity.mode === 'weight_range' ? 'kg' : ''}</span>
            </>
          )}
          {intensity?.mode === 'fixed_weight' && <span className="fixed-weight-badge">固定重量</span>}
        </>
      )}
    </div>
  )
}

function EditableWeight({ row, width, edit, selectedCell, selectCell, cellKey, readOnly }: {
  row: ExerciseRow
  width: number
  edit: (u: (r: ExerciseRow) => ExerciseRow) => void
  selectedCell: (setIndex: number) => boolean
  selectCell: (setIndex: number) => void
  cellKey: (setIndex: number) => string
  readOnly?: boolean
}) {
  if (row.aux) return <div className="gcell" data-c="weight" style={{ width, padding: '4px 5px' }}>—</div>
  const issue = getBoundRowInputIssue(row)
  if (row.mode === 'bodyweight') {
    return (
      <div className="gcell weightcell" data-c="weight" style={{ width, padding: '4px 4px', display: 'flex', alignItems: 'center', gap: 3 }}>
        <button
          type="button" className="weight-mode-toggle active"
          disabled={readOnly || row.hasLogs}
          title={row.hasLogs ? '学员已打卡,此行及其组不可修改' : '切回负重动作'}
          onClick={(event) => { stop(event); edit((current) => ({ ...current, mode: 'kg', intensity: current.intensity ?? null, weightMode: inferredWeightMode(current) })) }}
        >自重</button>
        <span className="bodyweight-summary">每组 BW</span>
      </div>
    )
  }

  const weights = rowWeightBoxes(row)
  const weightMode = inferredWeightMode(row)
  const matrixWarning = issue?.reasons.find((reason) => (
    reason === INPUT_GUARD_REASONS.fixedWeight || reason === INPUT_GUARD_REASONS.weightRangeConflict
  ))
  const displayed = weightMode === 'uniform' ? weights.slice(0, 1) : weights
  const editWeight = (index: number, value: string) => edit((current) => {
    const materialized = materializeIntensityRow(current)
    const boxes = materialized.boxes.map((box, boxIndex) => (
      weightMode === 'uniform' || boxIndex === index ? { val: value, empty: value === '' } : box
    ))
    return { ...materialized, boxes, weightMode }
  })
  const toggleWeightMode = () => edit((current) => {
    const materialized = materializeIntensityRow(current)
    const next = inferredWeightMode(materialized) === 'uniform' ? 'per_set' : 'uniform'
    if (next === 'per_set') return { ...materialized, weightMode: next }
    const first = materialized.boxes.find((box) => !box.empty && box.val.trim() !== '') ?? { val: '', empty: true }
    return { ...materialized, weightMode: next, boxes: materialized.boxes.map(() => ({ ...first })) }
  })
  return (
    <div className="gcell weightcell" data-c="weight" style={{ width, padding: '3px 4px', display: 'flex', flexWrap: 'wrap', alignItems: 'center' }}>
      <span className="weight-controls">
        <button type="button" className="weight-mode-toggle" disabled={readOnly || row.hasLogs || row.boxes.length === 0}
          title={weightMode === 'uniform' ? '切换为逐组标重' : '切换为统一重量'} onClick={(event) => { stop(event); toggleWeightMode() }}>
          {weightMode === 'uniform' ? '逐组标重' : '统一重量'}
        </button>
        <button type="button" className="bodyweight-toggle" disabled={readOnly || row.hasLogs}
          title="切换为自重动作" onClick={(event) => {
            stop(event)
            edit((current) => ({ ...materializeIntensityRow(current), mode: 'bodyweight' }))
          }}>自重</button>
        {matrixWarning && <span className="matrix-warning" role="alert" title={matrixWarning}>!</span>}
      </span>
      {displayed.map((box, index) => {
        const sourceIndex = weightMode === 'uniform' ? 0 : index
        const invalid = weightMode === 'uniform'
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
      {row.boxes.length === 0 && <span style={{ color: 'var(--mut)', fontSize: 10 }}>填组数→</span>}
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
  rowReorderDisabledHint,
  onEditRow,
  onReorderRow,
  onDeleteRow,
  weekBand,
}: Props) {
  const [dragRowId, setDragRowId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ rowId: string; position: 'before' | 'after' } | null>(null)
  const dragDisabled = !!rowReorderDisabledHint || day.rows.some((row) => row.hasLogs)
  const dragDisabledTitle = rowReorderDisabledHint ?? '该日含学员已打卡动作，整天不可拖排'
  const dayMoveClass = dayMoveState ? ` day-move-${dayMoveState}` : ''
  const dayMoveTitle = dayMoveDisabledHint ?? '拖动搬到本周其他日期 / 点击选中日'
  const dayMoveCursor = dayMoveDisabledHint ? 'not-allowed' : 'grab'
  const resolveTier = (row: ExerciseRow) => rowTier?.(row) ?? (row.isMain ? 'main' : 'aux')
  const displayRows = orderRowsForDisplay(day.rows, rowTier)
  const mainRowsForDay = day.rows.filter((row) => resolveTier(row) === 'main')
  const auxRowsForDay = day.rows.filter((row) => resolveTier(row) === 'aux')
  const mainDaySummary = summarizeDaySection(mainRowsForDay)
  const auxDaySummary = summarizeDaySection(auxRowsForDay)
  const dayTonnage = mainDaySummary.tonnage + auxDaySummary.tonnage
  const firstMainName = mainRowsForDay[0]?.name ?? ''
  const dayTheme = firstMainName.includes('深蹲')
    ? '深蹲日'
    : firstMainName.includes('卧推')
      ? '卧推日'
      : firstMainName.includes('硬拉')
        ? '硬拉日'
        : '训练日'
  const dayMeta = `主项 ${mainDaySummary.sets} 组 · 辅项 ${auxDaySummary.sets} 组 · 总重 ${compactTonnage(dayTonnage)}`
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
        </div>
        <div className="restday-body">
          <span>休息</span>
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
        <div className="dayhead" data-day-move-handle="" title={dayMoveTitle} onMouseDown={onDayMoveStart}
          style={{ cursor: dayMoveCursor }}>
          <span className="dayhead-line">
            {!dayMoveDisabledHint && <span className="day-move-grip" aria-hidden="true">⋮</span>}
            <span className="dayhead-primary">D{weekBand.dayOrdinal}</span>
            {weekBand.weekdayLabel && <span className="dayhead-weekday">{weekBand.weekdayLabel}</span>}
            {weekBand.dayOrdinal === 1 && (
              <select
                className="anchor-weekday-select"
                aria-label={weekBand.anchorWeekday == null ? '设置 D1 周几' : '修改 D1 周几'}
                title="D1 周几锚（仅影响标签显示）"
                value={weekBand.anchorWeekday ?? ''}
                disabled={readOnly || weekBand.anchorSaving || !weekBand.onAnchorWeekdayChange}
                onMouseDown={stop}
                onClick={stop}
                onChange={(event) => weekBand.onAnchorWeekdayChange?.(event.currentTarget.value ? Number(event.currentTarget.value) : null)}
              >
                <option value="">设周几</option>
                {['周一', '周二', '周三', '周四', '周五', '周六', '周日'].map((label, index) => (
                  <option value={index + 1} key={label}>{label}</option>
                ))}
              </select>
            )}
            <span className="dayhead-date">{day.dateLabel}</span>
            <ShiftBadge day={day} />
            {columnLetter && <kbd className="day-column-key">{columnLetter}</kbd>}
          </span>
          <span className="week-band-rest-label">休息</span>
          {headerContext}
        </div>
        {!readOnly && (
          <button type="button" className="week-band-rest-add" data-add-tier="main"
            onMouseDown={stop} onClick={(event) => { stop(event); onAddRow('main') }}>
            <span aria-hidden="true">＋</span> 加主项
          </button>
        )}
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
          <span className="dayhead-primary">{weekBand ? `D${weekBand.dayOrdinal}` : day.dowLabel}</span>
          {weekBand?.weekdayLabel && <span className="dayhead-weekday">{weekBand.weekdayLabel}</span>}
          {weekBand && weekBand.dayOrdinal === 1 && (
            <select
              className="anchor-weekday-select"
              aria-label={weekBand.anchorWeekday == null ? '设置 D1 周几' : '修改 D1 周几'}
              title="D1 周几锚（仅影响标签显示）"
              value={weekBand.anchorWeekday ?? ''}
              disabled={readOnly || weekBand.anchorSaving || !weekBand.onAnchorWeekdayChange}
              onMouseDown={stop}
              onClick={stop}
              onChange={(event) => weekBand.onAnchorWeekdayChange?.(event.currentTarget.value ? Number(event.currentTarget.value) : null)}
            >
              <option value="">设周几</option>
              {['周一', '周二', '周三', '周四', '周五', '周六', '周日'].map((label, index) => (
                <option value={index + 1} key={label}>{label}</option>
              ))}
            </select>
          )}
          <span className="dayhead-date">{day.dateLabel}</span>
          <ShiftBadge day={day} />
          {columnLetter && <kbd className="day-column-key">{columnLetter}</kbd>}
        </span>
        <span className="dayhead-theme">{dayTheme}</span>
        <span className="dayhead-meta">{dayMeta}</span>
        {headerContext}
      </div>

      <div className="daygrid" style={{ width: total, fontVariantNumeric: 'tabular-nums' }}>
        <div className="gridhead" style={{ display: 'flex', alignItems: 'stretch', background: 'var(--card-bg)', borderBottom: '1px solid var(--line)' }}>
          {weekBand && <div className="gcell week-band-frozen week-band-index" data-c="index" style={{ width: 28, padding: '4px 3px', textAlign: 'center', ...head }}>#</div>}
          <div className={`gcell${weekBand ? ' week-band-frozen' : ''}`} data-c="name" style={{ width: colW.name, padding: '4px 6px', ...head }}>动作</div>
          <div className="gcell" data-c="sets" style={{ width: colW.sets, padding: '4px 4px', textAlign: 'center', ...head }}>组</div>
          <div className="gcell" data-c="reps" style={{ width: colW.reps, padding: '4px 4px', textAlign: 'center', ...head }}>次</div>
          <div className="gcell" data-c="int" style={{ width: colW.int, padding: '4px 6px', ...head }}>强度</div>
          <div className="gcell" data-c="weight" style={{ width: colW.weight, padding: '4px 6px', ...head }}>重量</div>
          <div className="gcell" data-c="note" style={{ width: colW.note, padding: '4px 6px', ...head }}>备注</div>
        </div>

        {(() => {
        const renderRow = (row: ExerciseRow, slot?: WeekBandSlot, rowNumber?: number) => {
          const edit = (u: (r: ExerciseRow) => ExerciseRow) => onEditRow(row.id, u)
          const inputIssue = getBoundRowInputIssue(row)
          const isSelectedRow = selectedRowIds?.has(row.id) ?? selectedRowId === row.id
          const dropPosition = dropTarget?.rowId === row.id ? dropTarget.position : null
          const badge = weekBand && slot ? weekBand.badgeFor(slot) : null
          return (
            <div
              key={row.id}
              data-rowid={row.id}
              data-locked={row.hasLogs ? 'true' : 'false'}
              data-drag-disabled={dragDisabled ? 'true' : 'false'}
              className={`exrow${resolveTier(row) === 'aux' ? ' aux' : ''}${row.hasLogs ? ' locked' : ''}${isSelectedRow ? ' row-sel' : ''}${dragRowId === row.id ? ' row-dragging' : ''}${dropPosition ? ` row-drop-${dropPosition}` : ''}`}
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
                    title={dragDisabled ? dragDisabledTitle : '拖动调整顺序 / 点击选中动作'}
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
                    value={row.name} placeholder="输入动作…"
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
                  {row.custom && <span className="row-mark custom">定</span>}
                  {row.hasLogs && (
                    <span className="row-mark locked" title={row.conflictMessage ?? '学员已打卡,此行及其组不可修改'}>锁</span>
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
                />

                <div className="gcell note-cell" data-c="note" style={{ width: colW.note }}>
                  <input value={row.note} inputMode="text" onClick={stop} placeholder=""
                    disabled={readOnly || row.hasLogs}
                    onChange={(e) => edit((r) => ({ ...r, note: e.target.value }))}
                    style={{ ...baseInput, width: '100%', fontSize: 10, color: 'var(--txt)', paddingRight: 14 }} />
                  {!row.hasLogs && (
                    <span className="rowdel" title="删除这一行"
                      onClick={(e) => { e.stopPropagation(); onDeleteRow(row.id) }}>✕</span>
                  )}
                </div>
              </div>
            </div>
          )
        }
        const renderEmptySlot = (slot: WeekBandSlot, rowNumber: number) => {
          const badge = weekBand!.badgeFor(slot)
          const missingName = slot.exemplar.name.trim() === ''
          const quickAddDisabled = readOnly || missingName
          return (
            <div
              key={`empty-${slot.key}`}
              className="exrow week-band-empty-row"
              data-empty-exercise-id={slot.exerciseId ?? undefined}
              title={missingName
                ? '未命名动作不可添加，请先完善动作名称'
                : `本周无「${slot.exemplar.name}」，点击快速添加`}
              role="button"
              tabIndex={quickAddDisabled ? -1 : 0}
              aria-disabled={quickAddDisabled}
              onClick={(event) => { event.stopPropagation(); if (!quickAddDisabled) weekBand!.onQuickAdd(slot) }}
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget) return
                if (!quickAddDisabled && (event.key === 'Enter' || event.key === ' ')) {
                  event.preventDefault()
                  weekBand!.onQuickAdd(slot)
                }
              }}
            >
              <span className="exercise-row-main">
                <span className="gcell week-band-frozen week-band-index" data-c="index" style={{ width: 28 }}>{rowNumber}</span>
                <span className="gcell week-band-frozen week-band-empty-name" data-c="name" style={{ width: colW.name }}>
                  {badge && <span className={`week-band-badge ${badge.tone}`}>{badge.label}</span>}
                  <span className="week-band-empty-name-label">{slot.exemplar.name || '未命名动作'}</span>
                </span>
                <span className="week-band-empty-prescription" style={{ width: total - frozenWidth - colW.name }}>
                  {missingName ? '—　不可添加' : '—　点击添加'}
                </span>
              </span>
            </div>
          )
        }
        const addRowEntry = (tier: 'main' | 'aux') => (
          <div className="popitem" data-add-tier={tier} onClick={(e) => { e.stopPropagation(); onAddRow(tier) }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderTop: '1px dashed var(--bd)', color: 'var(--mut)', cursor: 'pointer', fontSize: 11 }}>
            <span style={{ color: 'var(--ink)', fontWeight: 700 }}>＋</span> 加动作
          </div>
        )
        const addWeekBandRowEntry = (tier: 'main' | 'aux') => !readOnly && (
          <button type="button" className="week-band-section-add" data-add-tier={tier}
            onClick={(event) => { event.stopPropagation(); onAddRow(tier) }}>
            <span aria-hidden="true">＋</span> {tier === 'main' ? '加主项' : '加辅助'}
          </button>
        )
        if (weekBand) {
          const mainSummary = summarizeDaySection(day.rows.filter((row) => resolveTier(row) === 'main'))
          const auxSummary = summarizeDaySection(day.rows.filter((row) => resolveTier(row) === 'aux'))
          let rowNumber = 0
          const renderSlots = (slots: WeekBandSlot[]) => slots.map((slot) => {
            rowNumber += 1
            const row = weekBand.rows.get(slot.key)
            return row ? renderRow(row, slot, rowNumber) : renderEmptySlot(slot, rowNumber)
          })
          return (
            <>
              {(weekBand.main.length > 0 || !readOnly) && <TierHeader label="主项及变式" accent width={total} summary={mainSummary} />}
              {renderSlots(weekBand.main)}
              {addWeekBandRowEntry('main')}
              {(weekBand.aux.length > 0 || !readOnly) && <TierHeader label="辅助项" width={total} summary={auxSummary} />}
              {renderSlots(weekBand.aux)}
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
            {(mainRows.length > 0 || selected) && <TierHeader label="主项及变式" accent width={total} summary={mainSummary} />}
            {mainRows.map((row) => renderRow(row))}
            {selected && addRowEntry('main')}
            {(auxRows.length > 0 || selected) && <TierHeader label="辅助项" width={total} summary={auxSummary} />}
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
