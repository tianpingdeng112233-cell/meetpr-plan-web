import type { DayCol, ColWidths, ColKey, ExerciseRow } from '../types'
import { COLS, setCount } from '../types'

interface Props {
  day: DayCol
  colW: ColWidths
  selected: boolean
  onSelect: () => void
  onResizeStart: (col: ColKey, e: React.MouseEvent) => void
  onNameClick: (rowId: string, el: HTMLElement) => void
}

const head: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '.06em',
  color: 'var(--fg-tertiary)', textTransform: 'uppercase',
}

function StrengthCell({ row, width }: { row: ExerciseRow; width: number }) {
  if (row.aux || row.boxes.length === 0) {
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
      <span style={{
        display: 'inline-flex', alignItems: 'center', fontFamily: 'var(--font-mono)',
        fontSize: 9, letterSpacing: '.04em', border: '1px solid var(--border-strong)',
        borderRadius: 3, padding: '1px 4px', margin: '0 5px 3px 0', ...chip,
      }}>
        {row.mode === 'rpe' ? 'RPE' : 'KG'}
      </span>
      {row.boxes.map((bx, i) => (
        <span key={i} style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          minWidth: 23, height: 19, padding: '0 4px', margin: '0 4px 3px 0',
          border: bx.empty ? '1px dashed var(--border-strong)' : '1px solid var(--border-strong)',
          borderRadius: 3, background: bx.empty ? 'transparent' : 'var(--surface-2)',
          color: '#fff', fontSize: 11, fontVariantNumeric: 'tabular-nums',
        }}>
          {bx.empty ? ' ' : bx.val}
        </span>
      ))}
    </div>
  )
}

export function DayColumn({ day, colW, selected, onSelect, onResizeStart, onNameClick }: Props) {
  if (day.rest) {
    return (
      <div className="day restday" data-dow={day.dow} style={{
        flex: '0 0 auto', width: 48, borderRight: '1px solid var(--border)',
        background: 'var(--surface-1)', display: 'flex', flexDirection: 'column',
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
  // cumulative offsets for the column-resize handles
  let acc = 0
  const dividers = COLS.map((k) => { acc += colW[k]; return { col: k, left: acc } })

  return (
    <div
      className={`day${selected ? ' sel' : ''}`}
      data-dow={day.dow}
      onClick={onSelect}
      style={{ position: 'relative', flex: '0 0 auto', borderRight: '1px solid var(--border)', cursor: 'pointer' }}
    >
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

        {day.rows.map((row) => (
          <div key={row.id} className={`exrow${row.aux ? ' aux' : ''}`} style={{ display: 'flex', alignItems: 'stretch', borderTop: '1px solid var(--border)' }}>
            <div
              className="gcell" data-c="name" data-namecell=""
              onClick={(e) => { e.stopPropagation(); onNameClick(row.id, e.currentTarget) }}
              style={{ width: colW.name, padding: '4px 6px', fontSize: 11, color: '#fff', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'text', display: 'flex', alignItems: 'center' }}
            >
              {row.name}
              {row.ku && <span style={{ color: 'var(--green)', fontSize: 9, marginLeft: 4 }}>✓</span>}
              {row.custom && <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg-tertiary)', fontSize: 8, marginLeft: 4, border: '1px solid var(--border-strong)', borderRadius: 3, padding: '0 3px' }}>自定义</span>}
            </div>
            <div className="gcell" data-c="sets" style={{ width: colW.sets, padding: '4px 4px', fontSize: 11, color: 'var(--fg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{setCount(row)}</div>
            <div className="gcell" data-c="reps" style={{ width: colW.reps, padding: '4px 4px', fontSize: 11, color: 'var(--fg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{row.reps}</div>
            <StrengthCell row={row} width={colW.int} />
            <div className="gcell" data-c="note" style={{ width: colW.note, padding: '4px 6px', fontSize: 10, color: 'var(--fg-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center' }}>{row.note}</div>
          </div>
        ))}
      </div>

      {dividers.map((d) => (
        <div
          key={d.col}
          className="coldiv"
          style={{ left: d.left }}
          onMouseDown={(e) => onResizeStart(d.col, e)}
          onClick={(e) => e.stopPropagation()}
        />
      ))}
    </div>
  )
}
