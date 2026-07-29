import { useLayoutEffect, useRef, useState } from 'react'
import type { DayCol, ColWidths, ColKey, ExerciseRow } from '../types'
import { COLS } from '../types'
import {
  filterRepsInput,
  filterStrengthInput,
  getBoundRowInputIssue,
  INPUT_GUARD_REASONS,
} from '../inputGuard'
import { compactTonnage, summarizeDaySection, type DaySectionSummary } from '../weeklySummary'
import {
  planCellKey,
  samePlanCell,
  type PlanCellField,
  type PlanCellSelection,
} from '../selectionModel'

interface Props {
  weekNumber?: number
  columnLetter?: string
  day: DayCol
  colW: ColWidths
  selected: boolean
  selectedRowId?: string | null
  cellSelection?: PlanCellSelection | null
  onSelect: () => void
  onRecallContext?: () => void
  onSelectRow?: (rowId: string) => void
  onSelectCell?: (rowId: string, field: PlanCellField, setIndex?: number) => void
  onSetsDraftChange?: (rowId: string, draft: string | null) => void
  readOnly?: boolean
  infoTokens?: (row: ExerciseRow) => readonly string[]
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

function EditableStrength({ row, width, edit, selectedCell, selectCell, cellKey, readOnly }: {
  row: ExerciseRow
  width: number
  edit: (u: (r: ExerciseRow) => ExerciseRow) => void
  selectedCell: (setIndex: number) => boolean
  selectCell: (setIndex: number) => void
  cellKey: (setIndex: number) => string
  readOnly?: boolean
}) {
  if (row.aux) {
    return (
      <div className="gcell" data-c="int" style={{ width, padding: '4px 5px', display: 'flex', alignItems: 'center' }}>
        <span style={{ color: 'var(--mut)', fontSize: 11 }}>—</span>
      </div>
    )
  }
  const nextMode = row.mode === 'kg' ? 'rpe' : row.mode === 'rpe' ? 'bodyweight' : 'kg'
  const issue = getBoundRowInputIssue(row)
  return (
    <div className="gcell intcell" data-c="int" style={{
      width, padding: '4px 5px', lineHeight: 1.3, display: 'flex',
      flexWrap: 'wrap', alignItems: 'center', alignContent: 'center',
    }}>
      <span
        className={`mode-badge ${row.mode}`}
        title={row.hasLogs ? '学员已打卡,此行及其组不可修改' : '切换 KG / RPE / 自重'}
        onClick={(e) => { stop(e); if (!row.hasLogs) edit((r) => ({ ...r, mode: nextMode })) }}
        style={{ cursor: row.hasLogs ? 'default' : 'pointer', opacity: row.hasLogs ? 0.55 : 1 }}
      >
        {row.mode === 'rpe' ? 'RPE' : row.mode === 'bodyweight' ? '自重' : 'KG'}
      </span>
      {row.mode === 'bodyweight' && row.boxes.length > 0 && (
        row.boxes.map((_, index) => (
          <span
            key={index}
            className={`bodyweight-cell plan-cell${selectedCell(index) ? ' plan-cell-selected' : ''}`}
            data-plan-cell="intensity"
            data-set-index={index}
            data-plan-cell-key={cellKey(index)}
            onClick={(event) => { stop(event); selectCell(index) }}
          >
            BW
          </span>
        ))
      )}
      {row.mode !== 'bodyweight' && row.boxes.map((b, i) => {
        const invalid = issue?.invalidStrengthIndexes.includes(i) ?? false
        return (
          <GuardedInput
            key={i} value={b.empty ? '' : b.val} inputMode="decimal"
            className={`${invalid ? 'guard-invalid ' : ''}plan-cell${selectedCell(i) ? ' plan-cell-selected' : ''}`}
            data-guard-field="strength" data-input-invalid={invalid ? 'true' : undefined}
            data-plan-cell="intensity" data-set-index={i}
            data-plan-cell-key={cellKey(i)}
            aria-invalid={invalid || undefined}
            title={invalid ? (row.mode === 'rpe' ? INPUT_GUARD_REASONS.rpe : INPUT_GUARD_REASONS.kg) : undefined}
            disabled={readOnly || row.hasLogs}
            filter={filterStrengthInput}
            onFocus={() => selectCell(i)}
            onClick={(event) => { stop(event); selectCell(i) }}
            onValue={(value) => {
              edit((r) => ({ ...r, boxes: r.boxes.map((x, j) => j === i ? { val: value, empty: value === '' } : x) }))
            }}
            style={{
              ...baseInput, width: 36, height: 19, textAlign: 'center', margin: '0 4px 3px 0',
              color: 'var(--txt)', fontFamily: 'var(--font-mono)', fontWeight: 500,
              border: '1px solid var(--bd)', background: b.empty ? 'transparent' : 'var(--panel-bg)',
              opacity: row.hasLogs ? 0.55 : 1,
            }}
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
  cellSelection,
  onSelect,
  onRecallContext,
  onSelectRow,
  onSelectCell,
  onSetsDraftChange,
  readOnly,
  infoTokens,
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
}: Props) {
  const [dragRowId, setDragRowId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ rowId: string; position: 'before' | 'after' } | null>(null)
  const dragDisabled = day.rows.some((row) => row.hasLogs)
  const dayMoveClass = dayMoveState ? ` day-move-${dayMoveState}` : ''
  const dayMoveTitle = dayMoveDisabledHint ?? '拖动搬到本周其他日期 / 点击选中日'
  const dayMoveCursor = dayMoveDisabledHint ? 'not-allowed' : 'grab'
  // Brings the writing-context panel back after the coach dismisses it for this day.
  const contextRecall = selected && onRecallContext ? (
    <button className="context-recall" title="显示撰写上下文"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); onRecallContext() }}>▤</button>
  ) : null
  const resolveTier = (row: ExerciseRow) => rowTier?.(row) ?? (row.isMain ? 'main' : 'aux')
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

  const startRowDrag = (e: React.MouseEvent, rowId: string) => {
    if (e.button !== 0 || dragDisabled) return
    e.preventDefault()
    e.stopPropagation()
    onSelectRow?.(rowId)
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

  if (day.rest) {
    return (
      <div className={`day restday${selected ? ' sel' : ''}${dayMoveClass}`} data-dow={day.dow} onClick={onSelect}>
        <div className="dayhead" data-day-move-handle="" title={dayMoveTitle} onMouseDown={onDayMoveStart}
          style={{ cursor: dayMoveCursor }}>
          <span className="dayhead-primary">{!dayMoveDisabledHint && <span className="day-move-grip" aria-hidden="true">⋮ </span>}{day.dowLabel}</span>
          <span className="dayhead-date">{day.dateLabel}</span>
          <ShiftBadge day={day} />
          {contextRecall}
        </div>
        <div className="restday-body">
          <span>休息</span>
        </div>
      </div>
    )
  }

  const total = COLS.reduce((s, k) => s + colW[k], 0)
  let acc = 0
  const dividers = COLS.map((k) => { acc += colW[k]; return { col: k, left: acc } })

  return (
    <div className={`day${selected ? ' sel' : ''}${dayMoveClass}`} data-dow={day.dow} onClick={onSelect}>
      <div className="dayhead" data-day-move-handle="" title={dayMoveTitle} onMouseDown={onDayMoveStart}
        style={{ cursor: dayMoveCursor }}>
        <span className="dayhead-line">
          {!dayMoveDisabledHint && <span className="day-move-grip" aria-hidden="true">⋮</span>}
          <span className="dayhead-primary">{day.dowLabel}</span>
          <span className="dayhead-date">{day.dateLabel}</span>
          <ShiftBadge day={day} />
          {columnLetter && <kbd className="day-column-key">{columnLetter}</kbd>}
          {contextRecall}
        </span>
        <span className="dayhead-theme">{dayTheme}</span>
        <span className="dayhead-meta">{dayMeta}</span>
      </div>

      <div className="daygrid" style={{ width: total, fontVariantNumeric: 'tabular-nums' }}>
        <div className="gridhead" style={{ display: 'flex', alignItems: 'stretch', background: 'var(--card-bg)', borderBottom: '1px solid var(--line)' }}>
          <div className="gcell" data-c="name" style={{ width: colW.name, padding: '4px 6px', ...head }}>动作</div>
          <div className="gcell" data-c="sets" style={{ width: colW.sets, padding: '4px 4px', textAlign: 'center', ...head }}>组</div>
          <div className="gcell" data-c="reps" style={{ width: colW.reps, padding: '4px 4px', textAlign: 'center', ...head }}>次</div>
          <div className="gcell" data-c="int" style={{ width: colW.int, padding: '4px 6px', ...head }}>强度</div>
          <div className="gcell" data-c="note" style={{ width: colW.note, padding: '4px 6px', ...head }}>备注</div>
        </div>

        {(() => {
        const renderRow = (row: ExerciseRow) => {
          const edit = (u: (r: ExerciseRow) => ExerciseRow) => onEditRow(row.id, u)
          const inputIssue = getBoundRowInputIssue(row)
          const isSelectedRow = selectedRowId === row.id
          const dropPosition = dropTarget?.rowId === row.id ? dropTarget.position : null
          const tokens = infoTokens?.(row) ?? []
          return (
            <div
              key={row.id}
              data-rowid={row.id}
              data-locked={row.hasLogs ? 'true' : 'false'}
              data-drag-disabled={dragDisabled ? 'true' : 'false'}
              className={`exrow${resolveTier(row) === 'aux' ? ' aux' : ''}${row.hasLogs ? ' locked' : ''}${isSelectedRow ? ' row-sel' : ''}${dragRowId === row.id ? ' row-dragging' : ''}${dropPosition ? ` row-drop-${dropPosition}` : ''}`}
              onMouseDownCapture={(e) => { if (e.button === 0) onSelectRow?.(row.id) }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="exercise-row-main">
                <div
                  className={`gcell plan-cell${isCellSelected(row.id, 'name') ? ' plan-cell-selected' : ''}`}
                  data-c="name"
                  data-plan-cell="name"
                  data-plan-cell-key={planCellKey({ weekNumber, dow: day.dow, rowId: row.id, field: 'name' })}
                  style={{ width: colW.name }}
                >
                  <span
                    className="rowdrag"
                    title={dragDisabled ? '该日含学员已打卡动作，整天不可拖排' : '拖动调整顺序 / 点击选中动作'}
                    onMouseDown={(e) => startRowDrag(e, row.id)}
                    onClick={(e) => { e.stopPropagation(); onSelectRow?.(row.id) }}
                    style={{ cursor: dragDisabled ? 'not-allowed' : undefined, opacity: dragDisabled ? 0.45 : undefined }}
                  >
                    ⋮
                  </span>
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
                    onCommit={(n) => edit((r) => ({ ...r, boxes: setBoxesLen(r.boxes, n), aux: n > 0 ? false : r.aux }))} />
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

                <EditableStrength
                  row={row}
                  width={colW.int}
                  edit={edit}
                  selectedCell={(setIndex) => isCellSelected(row.id, 'intensity', setIndex)}
                  selectCell={(setIndex) => selectCell(row.id, 'intensity', setIndex)}
                  cellKey={(setIndex) => planCellKey({
                    weekNumber,
                    dow: day.dow,
                    rowId: row.id,
                    field: 'intensity',
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
              {tokens.length > 0 && (
                <div className="exercise-info-tokens" data-exercise-info-tokens="">
                  {tokens.map((token, index) => (
                    <span className="exercise-info-token" key={`${token}-${index}`} data-exercise-info-token="">{token}</span>
                  ))}
                </div>
              )}
            </div>
          )
        }
        const addRowEntry = (tier: 'main' | 'aux') => (
          <div className="popitem" data-add-tier={tier} onClick={(e) => { e.stopPropagation(); onAddRow(tier) }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderTop: '1px dashed var(--bd)', color: 'var(--mut)', cursor: 'pointer', fontSize: 11 }}>
            <span style={{ color: 'var(--ink)', fontWeight: 700 }}>＋</span> 加动作
          </div>
        )
        if (!rowTier) {
          return (
            <>
              {day.rows.map(renderRow)}
              {selected && addRowEntry('aux')}
            </>
          )
        }
        const mainRows = day.rows.filter((r) => rowTier(r) === 'main')
        const auxRows = day.rows.filter((r) => rowTier(r) === 'aux')
        const mainSummary = summarizeDaySection(mainRows)
        const auxSummary = summarizeDaySection(auxRows)
        return (
          <>
            {(mainRows.length > 0 || selected) && <TierHeader label="主项及变式" accent width={total} summary={mainSummary} />}
            {mainRows.map(renderRow)}
            {selected && addRowEntry('main')}
            {(auxRows.length > 0 || selected) && <TierHeader label="辅助项" width={total} summary={auxSummary} />}
            {auxRows.map(renderRow)}
            {selected && addRowEntry('aux')}
          </>
        )
        })()}
      </div>

      {dividers.map((d) => (
        <div key={d.col} className="coldiv" style={{ left: d.left }}
          onMouseDown={(e) => onResizeStart(d.col, e)} onClick={(e) => e.stopPropagation()} />
      ))}
    </div>
  )
}
