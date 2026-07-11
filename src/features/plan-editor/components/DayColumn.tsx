import type { DayCol, ColWidths, ColKey, ExerciseRow } from '../types'
import { COLS } from '../types'

interface Props {
  day: DayCol
  colW: ColWidths
  selected: boolean
  onSelect: () => void
  onResizeStart: (col: ColKey, e: React.MouseEvent) => void
  onNameFocus: (rowId: string, name: string, el: HTMLElement) => void
  onNameChange: (rowId: string, value: string, el: HTMLElement) => void
  onNameBlur: () => void
  onAddRow: () => void
  onEditRow: (rowId: string, updater: (r: ExerciseRow) => ExerciseRow) => void
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
  return [...boxes, ...Array.from({ length: n - boxes.length }, () => ({ val: '', empty: true }))]
}

function EditableStrength({ row, width, edit }: { row: ExerciseRow; width: number; edit: (u: (r: ExerciseRow) => ExerciseRow) => void }) {
  if (row.aux) {
    return (
      <div className="gcell" data-c="int" style={{ width, padding: '4px 5px', display: 'flex', alignItems: 'center' }}>
        <span style={{ color: 'var(--fg-tertiary)', fontSize: 11 }}>—</span>
      </div>
    )
  }
  const chip = row.mode === 'rpe'
    ? { color: '#fff', background: 'var(--surface-3)' }
    : { color: 'var(--fg-tertiary)', background: 'transparent' }
  return (
    <div className="gcell intcell" data-c="int" style={{
      width, padding: '4px 5px', lineHeight: 1.3, display: 'flex',
      flexWrap: 'wrap', alignItems: 'center', alignContent: 'center',
    }}>
      <span
        title={row.hasLogs ? '学员已打卡,此行及其组不可修改' : '切换 kg / RPE'}
        onClick={(e) => { stop(e); if (!row.hasLogs) edit((r) => ({ ...r, mode: r.mode === 'kg' ? 'rpe' : 'kg' })) }}
        style={{
          display: 'inline-flex', alignItems: 'center', fontFamily: 'var(--font-mono)', fontSize: 9,
          letterSpacing: '.04em', border: '1px solid var(--border-strong)', borderRadius: 3,
          padding: '1px 4px', margin: '0 5px 3px 0', cursor: row.hasLogs ? 'default' : 'pointer',
          userSelect: 'none', opacity: row.hasLogs ? 0.55 : 1, ...chip,
        }}
      >
        {row.mode === 'rpe' ? 'RPE' : 'KG'}
      </span>
      {row.boxes.map((b, i) => (
        <input
          key={i} value={b.empty ? '' : b.val} inputMode="decimal" onClick={stop}
          disabled={row.hasLogs}
          onChange={(e) => edit((r) => ({ ...r, boxes: r.boxes.map((x, j) => j === i ? { val: e.target.value, empty: e.target.value.trim() === '' } : x) }))}
          style={{
            ...baseInput, width: 36, height: 19, textAlign: 'center', margin: '0 4px 3px 0',
            border: '1px solid var(--border-strong)', background: b.empty ? 'transparent' : 'var(--surface-2)',
            opacity: row.hasLogs ? 0.55 : 1,
          }}
        />
      ))}
      {row.boxes.length === 0 && <span style={{ color: 'var(--fg-tertiary)', fontSize: 10 }}>填组数→</span>}
    </div>
  )
}

export function DayColumn({ day, colW, selected, onSelect, onResizeStart, onNameFocus, onNameChange, onNameBlur, onAddRow, onEditRow, onDeleteRow }: Props) {
  if (day.rest) {
    return (
      <div className={`day restday${selected ? ' sel' : ''}`} data-dow={day.dow} onClick={onSelect} style={{
        flex: '0 0 auto', width: 48, borderRight: '1px solid var(--border)',
        background: 'var(--surface-1)', display: 'flex', flexDirection: 'column', cursor: 'pointer',
      }}>
        <div style={{ padding: '5px 0', textAlign: 'center', fontSize: 10, color: 'var(--fg-tertiary)', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>
          {day.dowLabel}
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
    <div className={`day${selected ? ' sel' : ''}`} data-dow={day.dow} onClick={onSelect}
      style={{ position: 'relative', flex: '0 0 auto', borderRight: '1px solid var(--border)', cursor: 'pointer' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, padding: '5px 8px', background: 'var(--surface-1)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', overflow: 'hidden' }}>
        <span style={{ fontWeight: 700, fontSize: 12, color: '#fff' }}>{day.dowLabel}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-tertiary)' }}>{day.dateLabel}</span>
      </div>

      <div className="daygrid" style={{ width: total, fontVariantNumeric: 'tabular-nums' }}>
        <div className="gridhead" style={{ display: 'flex', alignItems: 'stretch', background: 'var(--surface-1)', borderBottom: '1px solid var(--border)' }}>
          <div className="gcell" data-c="name" style={{ width: colW.name, padding: '4px 6px', ...head }}>动作</div>
          <div className="gcell" data-c="sets" style={{ width: colW.sets, padding: '4px 4px', textAlign: 'center', ...head }}>组</div>
          <div className="gcell" data-c="reps" style={{ width: colW.reps, padding: '4px 4px', textAlign: 'center', ...head }}>次</div>
          <div className="gcell" data-c="int" style={{ width: colW.int, padding: '4px 6px', ...head }}>强度</div>
          <div className="gcell" data-c="note" style={{ width: colW.note, padding: '4px 6px', ...head }}>备注</div>
        </div>

        {day.rows.map((row) => {
          const edit = (u: (r: ExerciseRow) => ExerciseRow) => onEditRow(row.id, u)
          return (
            <div key={row.id} data-rowid={row.id} data-locked={row.hasLogs ? 'true' : 'false'}
              className={`exrow${row.aux ? ' aux' : ''}${row.hasLogs ? ' locked' : ''}`}
              style={{ display: 'flex', alignItems: 'stretch', borderTop: '1px solid var(--border)', opacity: row.hasLogs ? 0.78 : 1 }}>
              <div className="gcell" data-c="name" style={{ width: colW.name, padding: '4px 4px', display: 'flex', alignItems: 'center', gap: 2, overflow: 'hidden' }}>
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
                  onChange={(e) => { const n = Math.max(0, Math.min(12, parseInt(e.target.value, 10) || 0)); edit((r) => ({ ...r, boxes: setBoxesLen(r.boxes, n), aux: n > 0 ? false : r.aux })) }}
                  style={{ ...baseInput, width: '100%', textAlign: 'center', color: 'var(--fg-secondary)' }} />
              </div>

              {/* 次 */}
              <div className="gcell" data-c="reps" style={{ width: colW.reps, padding: '4px 2px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <input value={row.reps === '—' ? '' : row.reps} inputMode="text" onClick={stop} placeholder="—"
                  disabled={row.hasLogs}
                  onChange={(e) => edit((r) => ({ ...r, reps: e.target.value.trim() === '' ? '—' : e.target.value }))}
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
        })}
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
