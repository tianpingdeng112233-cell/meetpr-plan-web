import { useLayoutEffect, useRef, useState } from 'react'
import type { DayCol, ColWidths, ColKey, ExerciseRow } from '../types'
import { COLS } from '../types'
import {
  filterRepsInput,
  filterStrengthInput,
  getBoundRowInputIssue,
  INPUT_GUARD_REASONS,
} from '../inputGuard'

interface Props {
  day: DayCol
  colW: ColWidths
  selected: boolean
  selectedRowId?: string | null
  onSelect: () => void
  onRecallContext?: () => void
  onSelectRow?: (rowId: string) => void
  dayMoveState?: 'source' | 'target' | 'invalid'
  dayMoveDisabledHint?: string | null
  onDayMoveStart?: (e: React.MouseEvent) => void
  onResizeStart: (col: ColKey, e: React.MouseEvent) => void
  onNameFocus: (rowId: string, name: string, el: HTMLElement) => void
  onNameChange: (rowId: string, value: string, el: HTMLElement) => void
  onNameBlur: () => void
  onAddRow: () => void
  /** Display tier resolver (catalog exercise_type based); absent = flat legacy list. */
  rowTier?: (row: ExerciseRow) => 'main' | 'aux'
  onEditRow: (rowId: string, updater: (r: ExerciseRow) => ExerciseRow) => void
  onReorderRow?: (dragRowId: string, targetRowId: string, position: 'before' | 'after') => void
  onDeleteRow: (rowId: string) => void
}

const head: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '.06em',
  color: 'var(--fg-tertiary)', textTransform: 'uppercase',
}
const stop = (e: React.MouseEvent) => e.stopPropagation()

const baseInput: React.CSSProperties = {
  background: 'transparent', border: '1px solid transparent', borderRadius: 3,
  color: '#fff', fontSize: 11, fontFamily: 'var(--font-sans)', outline: 'none',
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

/** Section divider between the main-lift block and the accessory block. */
function TierHeader({ label, accent, width }: { label: string; accent?: boolean; width: number }) {
  return (
    <div className="tierhead" style={{
      width, boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 5,
      padding: '3px 8px', background: 'var(--surface-1)', borderTop: '1px solid var(--border)',
    }}>
      <span style={{ width: 3, height: 8, borderRadius: 1, flex: 'none', background: accent ? 'var(--brand-red)' : 'var(--fg-tertiary)' }} />
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '.08em', whiteSpace: 'nowrap',
        color: accent ? 'var(--fg-secondary)' : 'var(--fg-tertiary)',
      }}>{label}</span>
    </div>
  )
}

function EditableStrength({ row, width, edit }: { row: ExerciseRow; width: number; edit: (u: (r: ExerciseRow) => ExerciseRow) => void }) {
  if (row.aux) {
    return (
      <div className="gcell" data-c="int" style={{ width, padding: '4px 5px', display: 'flex', alignItems: 'center' }}>
        <span style={{ color: 'var(--fg-tertiary)', fontSize: 11 }}>—</span>
      </div>
    )
  }
  const nextMode = row.mode === 'kg' ? 'rpe' : row.mode === 'rpe' ? 'bodyweight' : 'kg'
  const chip = row.mode === 'rpe' || row.mode === 'bodyweight'
    ? { color: '#fff', background: 'var(--surface-3)' }
    : { color: 'var(--fg-tertiary)', background: 'transparent' }
  const issue = getBoundRowInputIssue(row)
  return (
    <div className="gcell intcell" data-c="int" style={{
      width, padding: '4px 5px', lineHeight: 1.3, display: 'flex',
      flexWrap: 'wrap', alignItems: 'center', alignContent: 'center',
    }}>
      <span
        title={row.hasLogs ? '学员已打卡,此行及其组不可修改' : '切换 KG / RPE / 自重'}
        onClick={(e) => { stop(e); if (!row.hasLogs) edit((r) => ({ ...r, mode: nextMode })) }}
        style={{
          display: 'inline-flex', alignItems: 'center', fontFamily: 'var(--font-mono)', fontSize: 9,
          letterSpacing: '.04em', border: '1px solid var(--border-strong)', borderRadius: 3,
          padding: '1px 4px', margin: '0 5px 3px 0', cursor: row.hasLogs ? 'default' : 'pointer',
          userSelect: 'none', opacity: row.hasLogs ? 0.55 : 1, ...chip,
        }}
      >
        {row.mode === 'rpe' ? 'RPE' : row.mode === 'bodyweight' ? '自重' : 'KG'}
      </span>
      {row.mode === 'bodyweight' && row.boxes.length > 0 && (
        <span style={{ color: 'var(--fg-secondary)', fontSize: 11, margin: '0 4px 3px 0' }}>每组自重</span>
      )}
      {row.mode !== 'bodyweight' && row.boxes.map((b, i) => {
        const invalid = issue?.invalidStrengthIndexes.includes(i) ?? false
        return (
          <GuardedInput
            key={i} value={b.empty ? '' : b.val} inputMode="decimal" onClick={stop}
            className={invalid ? 'guard-invalid' : undefined}
            data-guard-field="strength" data-input-invalid={invalid ? 'true' : undefined}
            aria-invalid={invalid || undefined}
            title={invalid ? (row.mode === 'rpe' ? INPUT_GUARD_REASONS.rpe : INPUT_GUARD_REASONS.kg) : undefined}
            disabled={row.hasLogs}
            filter={filterStrengthInput}
            onValue={(value) => {
              edit((r) => ({ ...r, boxes: r.boxes.map((x, j) => j === i ? { val: value, empty: value === '' } : x) }))
            }}
            style={{
              ...baseInput, width: 36, height: 19, textAlign: 'center', margin: '0 4px 3px 0',
              border: '1px solid var(--border-strong)', background: b.empty ? 'transparent' : 'var(--surface-2)',
              opacity: row.hasLogs ? 0.55 : 1,
            }}
          />
        )
      })}
      {row.boxes.length === 0 && <span style={{ color: 'var(--fg-tertiary)', fontSize: 10 }}>填组数→</span>}
    </div>
  )
}

export function DayColumn({ day, colW, selected, selectedRowId, onSelect, onRecallContext, onSelectRow, dayMoveState, dayMoveDisabledHint, onDayMoveStart, onResizeStart, onNameFocus, onNameChange, onNameBlur, onAddRow, rowTier, onEditRow, onReorderRow, onDeleteRow }: Props) {
  const [dragRowId, setDragRowId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ rowId: string; position: 'before' | 'after' } | null>(null)
  const dragDisabled = day.rows.some((row) => row.hasLogs)
  const dayMoveClass = dayMoveState ? ` day-move-${dayMoveState}` : ''
  const dayMoveTitle = dayMoveDisabledHint ?? '拖动搬到本周其他日期 / 点击选中日'
  const dayMoveCursor = dayMoveDisabledHint ? 'not-allowed' : 'grab'

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
      <div className={`day restday${selected ? ' sel' : ''}${dayMoveClass}`} data-dow={day.dow} onClick={onSelect} style={{
        flex: '0 0 auto', width: 48, borderRight: '1px solid var(--border)',
        background: 'var(--surface-1)', display: 'flex', flexDirection: 'column', cursor: 'pointer',
      }}>
        <div className="dayhead" data-day-move-handle="" title={dayMoveTitle} onMouseDown={onDayMoveStart}
          style={{ padding: '4px 2px', textAlign: 'center', color: 'var(--fg-tertiary)', borderBottom: '1px solid var(--border)', cursor: dayMoveCursor, userSelect: 'none' }}>
          <span style={{ display: 'block', fontSize: 10, fontWeight: 600 }}>{!dayMoveDisabledHint && <span className="day-move-grip" aria-hidden="true">⠿ </span>}{day.dowLabel}</span>
          <span style={{ display: 'block', marginTop: 1, fontFamily: 'var(--font-mono)', fontSize: 8 }}>{day.dateLabel}</span>
          {selected && <button className="context-recall" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onRecallContext?.() }} title="显示撰写上下文">▤</button>}
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '18px 0' }}>
          <span style={{ writingMode: 'vertical-rl', letterSpacing: 5, color: 'var(--fg-tertiary)', fontSize: 12 }}>休息</span>
        </div>
      </div>
    )
  }

  const total = COLS.reduce((s, k) => s + colW[k], 0)
  let acc = 0
  const dividers = COLS.map((k) => { acc += colW[k]; return { col: k, left: acc } })

  return (
    <div className={`day${selected ? ' sel' : ''}${dayMoveClass}`} data-dow={day.dow} onClick={onSelect}
      style={{ position: 'relative', flex: '0 0 auto', borderRight: '1px solid var(--border)', cursor: 'pointer' }}>
      <div className="dayhead" data-day-move-handle="" title={dayMoveTitle} onMouseDown={onDayMoveStart}
        style={{ display: 'flex', alignItems: 'baseline', gap: 7, padding: '5px 8px', background: 'var(--surface-1)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', overflow: 'hidden', cursor: dayMoveCursor, userSelect: 'none' }}>
        {!dayMoveDisabledHint && <span className="day-move-grip" aria-hidden="true">⠿</span>}
        <span style={{ fontWeight: 700, fontSize: 12, color: '#fff' }}>{day.dowLabel}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-tertiary)' }}>{day.dateLabel}</span>
        {selected && <button className="context-recall" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onRecallContext?.() }} title="显示撰写上下文">▤</button>}
      </div>

      <div className="daygrid" style={{ width: total, fontVariantNumeric: 'tabular-nums' }}>
        <div className="gridhead" style={{ display: 'flex', alignItems: 'stretch', background: 'var(--surface-1)', borderBottom: '1px solid var(--border)' }}>
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
          return (
            <div
              key={row.id}
              data-rowid={row.id}
              data-locked={row.hasLogs ? 'true' : 'false'}
              data-drag-disabled={dragDisabled ? 'true' : 'false'}
              className={`exrow${row.aux ? ' aux' : ''}${row.hasLogs ? ' locked' : ''}${isSelectedRow ? ' row-sel' : ''}${dragRowId === row.id ? ' row-dragging' : ''}${dropPosition ? ` row-drop-${dropPosition}` : ''}`}
              onMouseDownCapture={(e) => { if (e.button === 0) onSelectRow?.(row.id) }}
              onClick={(e) => e.stopPropagation()}
              style={{
                display: 'flex', alignItems: 'stretch', borderTop: '1px solid var(--border)',
                background: isSelectedRow ? 'rgba(255, 69, 69, 0.08)' : undefined,
                boxShadow: isSelectedRow ? 'inset 3px 0 0 var(--brand-red)' : undefined,
                opacity: row.hasLogs ? 0.78 : 1,
              }}
            >
              <div className="gcell" data-c="name" style={{ width: colW.name, padding: '4px 4px', display: 'flex', alignItems: 'center', gap: 2, overflow: 'hidden' }}>
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
                  disabled={row.hasLogs}
                  onMouseDown={stop} onClick={stop}
                  onFocus={(e) => onNameFocus(row.id, row.name, e.currentTarget)}
                  onChange={(e) => onNameChange(row.id, e.target.value, e.currentTarget)}
                  onBlur={onNameBlur}
                  style={{ ...baseInput, flex: 1, minWidth: 0, color: '#fff', fontWeight: 500 }}
                />
                {row.ku && <span style={{ color: 'var(--green)', fontSize: 9, flex: 'none' }}>✓</span>}
                {row.custom && <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg-tertiary)', fontSize: 8, flex: 'none', border: '1px solid var(--border-strong)', borderRadius: 3, padding: '0 3px' }}>定</span>}
                {row.hasLogs && (
                  <span title={row.conflictMessage ?? '学员已打卡,此行及其组不可修改'}
                    style={{ fontSize: 9, flex: 'none', cursor: 'help' }}>🔒</span>
                )}
                {row.conflictMessage && <span title={row.conflictMessage} style={{ color: 'var(--amber)', fontSize: 9, cursor: 'help' }}>⚠</span>}
              </div>

              {/* 组 — editable on aux rows too: a zero-set (note-driven) row can't publish, so
                  typing a count here is how the coach turns it into a real tracked exercise. */}
              <div className="gcell" data-c="sets" style={{ width: colW.sets, padding: '4px 2px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <input value={row.boxes.length || ''} inputMode="numeric" onClick={stop} placeholder={row.aux ? '—' : ''}
                  disabled={row.hasLogs}
                  onChange={(e) => {
                    const raw = e.target.value.trim()
                    // Do not interpret the transient empty value while editing
                    // a number as “delete every set”.
                    if (raw === '') return
                    const n = Math.max(0, Math.min(12, parseInt(raw, 10) || 0))
                    edit((r) => ({ ...r, boxes: setBoxesLen(r.boxes, n), aux: n > 0 ? false : r.aux }))
                  }}
                  style={{ ...baseInput, width: '100%', textAlign: 'center', color: 'var(--fg-secondary)' }} />
              </div>

              {/* 次 */}
              <div className="gcell" data-c="reps" style={{ width: colW.reps, padding: '4px 2px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <GuardedInput value={row.reps === '—' ? '' : row.reps} inputMode="text" onClick={stop} placeholder="—"
                  className={inputIssue?.invalidReps ? 'guard-invalid' : undefined}
                  data-guard-field="reps" data-input-invalid={inputIssue?.invalidReps ? 'true' : undefined}
                  aria-invalid={inputIssue?.invalidReps || undefined}
                  title={inputIssue?.invalidReps ? INPUT_GUARD_REASONS.reps : undefined}
                  disabled={row.hasLogs}
                  filter={filterRepsInput}
                  onValue={(value) => {
                    edit((r) => ({ ...r, reps: value === '' ? '—' : value }))
                  }}
                  style={{ ...baseInput, width: '100%', textAlign: 'center', color: 'var(--fg-secondary)' }} />
              </div>

              <EditableStrength row={row} width={colW.int} edit={edit} />

              <div className="gcell" data-c="note" style={{ width: colW.note, padding: '4px 2px', display: 'flex', alignItems: 'center', position: 'relative' }}>
                <input value={row.note} inputMode="text" onClick={stop} placeholder=""
                  disabled={row.hasLogs}
                  onChange={(e) => edit((r) => ({ ...r, note: e.target.value }))}
                  style={{ ...baseInput, width: '100%', fontSize: 10, color: 'var(--fg-tertiary)', paddingRight: 14 }} />
                {!row.hasLogs && (
                  <span className="rowdel" title="删除这一行"
                    onClick={(e) => { e.stopPropagation(); onDeleteRow(row.id) }}
                    style={{
                      position: 'absolute', right: 2, top: '50%', transform: 'translateY(-50%)',
                      width: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      borderRadius: 4, fontSize: 10, color: 'var(--fg-tertiary)', cursor: 'pointer',
                    }}>✕</span>
                )}
              </div>
            </div>
          )
        }
        if (!rowTier) return day.rows.map(renderRow)
        const mainRows = day.rows.filter((r) => rowTier(r) === 'main')
        const auxRows = day.rows.filter((r) => rowTier(r) === 'aux')
        return (
          <>
            {(mainRows.length > 0 || selected) && <TierHeader label="主项及变式" accent width={total} />}
            {mainRows.map(renderRow)}
            {(auxRows.length > 0 || selected) && <TierHeader label="辅助项" width={total} />}
            {auxRows.map(renderRow)}
          </>
        )
        })()}
        {selected && (
          <div className="popitem" onClick={(e) => { e.stopPropagation(); onAddRow() }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderTop: '1px dashed var(--border-strong)', color: 'var(--fg-tertiary)', cursor: 'pointer', fontSize: 11 }}>
            <span style={{ color: 'var(--brand-red)', fontWeight: 700 }}>＋</span> 加动作
          </div>
        )}
      </div>

      {dividers.map((d) => (
        <div key={d.col} className="coldiv" style={{ left: d.left }}
          onMouseDown={(e) => onResizeStart(d.col, e)} onClick={(e) => e.stopPropagation()} />
      ))}
    </div>
  )
}
