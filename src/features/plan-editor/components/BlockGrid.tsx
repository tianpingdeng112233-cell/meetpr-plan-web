import { actualShorthand } from '../actualShorthand'
import type { ActualSet, StudentAddedExercise } from '../actuals'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { buildBlockGrid, blockTargetDay, blockInsertDates, type BlockAddress } from '../blockGridModel'
import type { DayCol, ExerciseRow, Week } from '../types'
import { displayedRowIntensity, rowIntensityBoxes, rowWeightBoxes } from '../intensityModel'
import { addDays, DOW_LABELS, mdLabel } from '../mapping'
import { fmt, S } from '../../../i18n/strings'
import { orderRowsForDisplay, planDayKey, type PlanDayTarget } from '../selectionModel'
import './block-grid.css'
import type { FeedbackEntry } from '../feedbackModel'

interface Props {
  showActuals?: boolean
  actualsForRow?: (row: ExerciseRow) => ActualSet[] | null
  studentAddedByDay?: Map<string, StudentAddedExercise[]>
  exerciseName?: (id: string) => string
  addedVideoMarker?: (dayId: string | null | undefined, exerciseId: string) => ReactNode
  videoMarker?: (row: ExerciseRow) => ReactNode
  addedDayMarkers?: (day: DayCol) => ReactNode
  highlightedVideo?: FeedbackEntry | null
  weeks: Week[]
  startDate: string | null
  weekdays: readonly number[]
  extraWeekdays: readonly number[]
  editing: PlanDayTarget | null
  selectedDays: ReadonlySet<string>
  selectedRows: ReadonlySet<string>
  readOnly: boolean
  rowTier: (row: ExerciseRow) => 'main' | 'aux'
  renderDay: (week: Week, day: DayCol, dx: number, dayNumber: number) => ReactNode
  onConfirmWeekImport?: (weekNumber: number) => void
  renderCapacity: (week: Week, index: number) => ReactNode
  onOpen: (week: Week, day: DayCol, event: React.MouseEvent) => void
  onClose: () => void
  onSelectRow: (week: Week, day: DayCol, rowId: string, modifiers: { toggle: boolean; range: boolean }) => void
  onSelectRectangle: (days: PlanDayTarget[], rows: string[]) => void
  onInsert: (weekNumber: number, date: string) => void
  onFill: (source: BlockAddress, endWeek: number) => void
  onWeekday: (dx: number, weekday: number) => void
  onContext: (event: React.MouseEvent, week: Week, day: DayCol) => void
}

function shorthand(row: ExerciseRow): string {
  const intensity = displayedRowIntensity(row)
  const values = rowIntensityBoxes(row).map(box => box.empty ? '—' : box.val)
  const value = values.length && new Set(values).size === 1 ? values[0] : values.join('/')
  const load = intensity?.mode === 'pct' ? `${value || intensity.value}%`
    : intensity?.mode === 'rpe' ? `@${value || intensity.value}`
      : intensity?.mode === 'rir' ? `${value || intensity.value} RIR`
        : intensity?.mode === 'rpe_range' ? `@${intensity.value}–${intensity.high}` : ''
  const weights = rowWeightBoxes(row).map(box => box.empty ? '—' : box.val)
  const weight = row.mode === 'bodyweight' ? S.common.bodyweight
    : intensity?.mode === 'weight_range' ? `${intensity.value}–${intensity.high}`
      : weights.some(w => w !== '—') ? (new Set(weights).size === 1 ? weights[0] : weights.join('/')) : ''
  return [`${row.boxes.length || '—'}×${row.reps}`, load, weight ? `· ${weight}` : ''].filter(Boolean).join(' ')
}

export function BlockGrid(props: Props) {
  const grid = buildBlockGrid(props.weeks, props.startDate, props.weekdays, props.extraWeekdays)
  const ref = useRef<HTMLDivElement>(null)
  const cleanup = useRef<(() => void) | null>(null)
  const suppressClick = useRef(false)
  const [fill, setFill] = useState<{ source: BlockAddress; endWeek: number } | null>(null)
  const [rectangle, setRectangle] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  const [insertMenu, setInsertMenu] = useState<string | null>(null)
  const [columnEditor, setColumnEditor] = useState<number | null>(null)
  useEffect(() => () => cleanup.current?.(), [])
  useEffect(() => {
    if (!props.editing) return
    ref.current?.querySelector<HTMLElement>('.block-cell.is-editing')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [props.editing?.wnum, props.editing?.dow])

  useEffect(() => {
    const entry = props.highlightedVideo
    if (!entry?.inPlan) return
    const target = entry.rowId ? [...(ref.current?.querySelectorAll<HTMLElement>('[data-rowid]') ?? [])].find(el => el.dataset.rowid === entry.rowId)
      : [...(ref.current?.querySelectorAll<HTMLElement>('[data-block-day-id]') ?? [])].find(el => el.dataset.blockDayId === entry.dayId)
    target?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [props.highlightedVideo])

  const startFill = (event: React.MouseEvent, source: BlockAddress) => {
    if (event.button !== 0 || props.readOnly) return
    event.preventDefault(); event.stopPropagation()
    let end = source.weekNumber
    const move = (e: MouseEvent) => {
      const target = document.elementFromPoint?.(e.clientX, e.clientY)?.closest<HTMLElement>('[data-block-week]')
      if (target) end = Math.max(source.weekNumber, Number(target.dataset.blockWeek))
      setFill({ source, endWeek: end })
    }
    const finish = () => {
      cleanup.current?.()
      suppressClick.current = true
      window.setTimeout(() => { suppressClick.current = false }, 0)
      if (end > source.weekNumber) props.onFill(source, end)
    }
    const cancel = () => { setFill(null); window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', finish); window.removeEventListener('blur', cancel); cleanup.current = null }
    cleanup.current?.(); cleanup.current = cancel
    setFill({ source, endWeek: end })
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', finish); window.addEventListener('blur', cancel)
  }

  const startRectangle = (event: React.MouseEvent) => {
    const target = event.target as HTMLElement
    if (event.button !== 0 || target.closest('input,select,button,.rowdrag,[data-student-added]')) return
    const origin = target.closest<HTMLElement>('[data-block-week]')
    if (!origin) return
    const x = event.clientX, y = event.clientY
    let moved = false
    const move = (e: MouseEvent) => {
      if (Math.hypot(e.clientX - x, e.clientY - y) < 5 && !moved) return
      e.preventDefault(); moved = true; suppressClick.current = true
      const bounds = { left: Math.min(x, e.clientX), top: Math.min(y, e.clientY), right: Math.max(x, e.clientX), bottom: Math.max(y, e.clientY) }
      setRectangle({ left: bounds.left, top: bounds.top, width: bounds.right - bounds.left, height: bounds.bottom - bounds.top })
      const intersects = (el: Element) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.left < bounds.right && r.right > bounds.left && r.top < bounds.bottom && r.bottom > bounds.top }
      const cells = [...(ref.current?.querySelectorAll<HTMLElement>('[data-block-week]') ?? [])].filter(el => el.style.visibility !== 'hidden' && intersects(el))
      const days = cells.flatMap(el => el.dataset.dow == null ? [] : [{ wnum: Number(el.dataset.blockWeek), dow: Number(el.dataset.dow) }])
      const rows = cells.length === 1 ? [...cells[0].querySelectorAll<HTMLElement>('[data-rowid]')].filter(intersects).map(el => el.dataset.rowid!) : []
      props.onSelectRectangle(days, rows)
    }
    const finish = () => { cleanup.current?.(); if (moved) window.setTimeout(() => { suppressClick.current = false }, 0) }
    const cancel = () => { setRectangle(null); window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', finish); window.removeEventListener('blur', finish); cleanup.current = null }
    cleanup.current?.(); cleanup.current = cancel
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', finish); window.addEventListener('blur', finish)
  }

  return <div className="block-grid" ref={ref} style={{ '--block-columns': grid.columns.length } as React.CSSProperties}
    onMouseDown={startRectangle} onClickCapture={event => { if (suppressClick.current) { event.stopPropagation(); event.preventDefault() } }}>
    <div className="block-column-row"><span />{grid.columns.map(column => {
      const label = DOW_LABELS[column.weekday]
      return <div className="block-column" key={column.dx}>
        <button type="button" title={label} disabled={props.readOnly || !props.startDate} onClick={() => setColumnEditor(columnEditor === column.dx ? null : column.dx)}>
          <span>{label}</span>
        </button>

        {columnEditor === column.dx && <select autoFocus aria-label={S.editor.blockWeekday} value={column.weekday}
          onChange={event => { props.onWeekday(column.dx, Number(event.target.value)); setColumnEditor(null) }} onBlur={() => setColumnEditor(null)}>
          {Array.from({ length: 7 }, (_, weekday) => <option value={weekday} key={weekday}>{DOW_LABELS[weekday]}</option>)}
        </select>}
      </div>
    })}</div>
    {grid.rows.map(({ week, cells }, index) => {
      const editingDx = cells.findIndex(cell => (cell.day ?? (grid.columns[cell.dx].patternIndex !== null ? blockTargetDay(grid, cell, props.startDate) : null))?.dow === props.editing?.dow && week.num === props.editing?.wnum)
      // At the right edge the card extends left enough to retain usable input widths.
      const editStart = editingDx < 0 ? -1 : Math.min(editingDx, Math.max(0, grid.columns.length - 3))
      const ordered = cells.filter(cell => cell.day).sort((a, b) => a.dayNumber! - b.dayNumber!)
      const insertGaps = props.readOnly || !props.startDate ? [] : Array.from({ length: ordered.length + 1 }, (_, i) => {
        const before = ordered[i - 1], after = ordered[i]
        return { before, after, dates: blockInsertDates(week, props.startDate!, before?.day?.dow ?? null, after?.day?.dow ?? null) }
      }).filter(gap => gap.dates.length > 0)
      return <div key={week.num} className="block-week weekband" data-week-slot="" data-wnum={week.num}>
        {!!week.importDoubts?.length && !week.days.some(day => day.rows.length) && <div className="import-empty-week" data-import-week={week.num}>
          {week.importDoubts.map(kind => <span key={kind} title={S.sheetImport.doubtHints[kind]}>{S.sheetImport.doubts[kind]}</span>)}
          <button disabled={props.readOnly} onClick={() => props.onConfirmWeekImport?.(week.num)}>{S.sheetImport.confirm}</button>
        </div>}
        <div className="block-week-label" tabIndex={0}>
          <b>W{week.num}</b><span>{props.startDate ? mdLabel(addDays(props.startDate, (week.num - 1) * 7)) : week.range.split(/[–—~]/)[0]}</span>
          {week.isCurrent && <mark>{S.editor.currentWeek}</mark>}
          <div className="block-capacity">{props.renderCapacity(week, index)}</div>
        </div>
        {cells.map(cell => {
          const day = cell.day ?? (grid.columns[cell.dx].patternIndex !== null ? blockTargetDay(grid, cell, props.startDate) : null)
          const editing = editingDx === cell.dx || (!cell.day && props.editing?.wnum === week.num && props.editing?.dow === day?.dow)
          const selected = !!day && props.selectedDays.has(planDayKey({ wnum: week.num, dow: day.dow }))
          const preview = fill && fill.source.dx === cell.dx && week.num > fill.source.weekNumber && week.num <= fill.endWeek
          const rows = day ? orderRowsForDisplay(day.rows, props.rowTier) : []
          const selectedCount = rows.filter(row => props.selectedRows.has(row.id)).length
          const fillRows = preview ? grid.rows.find(row => row.week.num === fill.source.weekNumber)?.cells[cell.dx]?.day?.rows ?? [] : []
          return <div key={cell.dx} className={`block-cell${!day ? ' is-blank' : ''}${selected ? ' is-selected' : ''}${editing ? ' is-editing' : ''}${preview ? ' fill-preview' : ''}`}
            data-block-day-id={day?.serverDayId ?? undefined} data-block-week={week.num} data-dx={cell.dx} data-dow={day?.dow} tabIndex={day ? 0 : -1}
            aria-label={cell.dayNumber ? `W${week.num} D${cell.dayNumber}` : `W${week.num} ${DOW_LABELS[grid.columns[cell.dx].weekday]}`}
            style={{ gridColumn: editing ? `${(editStart < 0 ? Math.min(cell.dx, Math.max(0, grid.columns.length - 3)) : editStart) + 2} / -1` : cell.dx + 2, gridRow: 1,
              visibility: editingDx >= 0 && cell.dx >= editStart && cell.dx !== editingDx ? 'hidden' : undefined }}
            onClick={event => { if (day) props.onOpen(week, day, event) }}
            onContextMenu={event => { if (day) props.onContext(event, week, day) }}
            onKeyDown={event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); event.stopPropagation(); event.currentTarget.click() } }}>
            {editing && day ? props.renderDay(week, day, cell.dx, cell.dayNumber ?? cells.filter(c => c.day && c.day.dow < day.dow).length + 1) : <>
              <div className="block-date"><span>{cell.dayNumber ? `D${cell.dayNumber} · ${day?.dateLabel}` : day?.dateLabel}</span>{day?.shiftBadge && <span data-shift-badge="">{S.editor.shifted}</span>}{(day?.completedAt || (rows.length > 0 && rows.every(row => row.hasLogs))) && <span>✓ {S.editor.blockDone}</span>}{day && !props.showActuals && props.addedDayMarkers?.(day)}</div>
              {day && rows.length === 0 && !props.readOnly && <span className="block-empty">
                <svg width="23" height="23" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                  <path d="M5 1v8M1 5h8" />
                </svg>
              </span>}
              {rows.map((row, i) => {
                const name = fmt.exerciseName({ name: row.name, name_en: row.nameEn }) || S.common.unnamed
                const actuals = props.actualsForRow?.(row)
                const actual = props.showActuals && !!actuals?.length
                const summary = actual ? actualShorthand(row, actuals!) : shorthand(row)
                return <div key={row.id} className={`block-brick${actual ? ' actual-display' : ''}${props.showActuals && !actual ? ' prescribed-muted' : ''}${props.highlightedVideo?.rowId === row.id ? ' video-highlight' : ''}${props.selectedRows.has(row.id) ? ' row-sel' : ''}${props.rowTier(row) === 'aux' ? ' aux' : ''}${i > 0 && props.rowTier(rows[i - 1]) !== props.rowTier(row) ? ' section-start' : ''}`}
                data-rowid={row.id} data-import-doubt={row.importDoubts?.length ? "true" : undefined} data-locked={row.hasLogs} role="button" tabIndex={0} title={actual ? S.block.prescription(shorthand(row)) : `${name} ${summary}${row.hasLogs ? ' ✓' : ''}`} data-hint={actual ? S.block.prescription(shorthand(row)) : undefined}
                onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); event.currentTarget.click() } }}
                onClick={event => { event.stopPropagation(); if (day) props.onSelectRow(week, day, row.id, { toggle: event.metaKey || event.ctrlKey, range: event.shiftKey }) }}>
                <span>{name}</span><div className="block-brick-summary"><code>{summary}</code><span className="block-brick-status">{row.hasLogs && <span>✓</span>}{props.videoMarker?.(row)}</span></div>
              </div>})}
              {props.showActuals && day?.serverDayId && props.studentAddedByDay?.get(day.serverDayId)?.map(added => <div key={added.exerciseId}
                className={`block-brick student-added-brick${props.highlightedVideo?.dayId === day.serverDayId && props.highlightedVideo?.addedExerciseId === added.exerciseId ? ' video-highlight' : ''}`}
                data-student-added={added.exerciseId} onMouseDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
                <span>{props.exerciseName?.(added.exerciseId) ?? added.exerciseId} <small>{S.block.added}</small></span><div className="block-brick-summary"><code>{actualShorthand(null, added.sets)}</code><span className="block-brick-status"><span>✓</span>{props.addedVideoMarker?.(day.serverDayId, added.exerciseId)}</span></div>
              </div>)}
            </>}
            {selected && !props.readOnly && <button type="button" className="block-fill-handle" aria-label={S.editor.blockFillHint} title={S.editor.blockFillHint}
              onMouseDown={event => startFill(event, cell)} onClick={event => event.stopPropagation()} />}
            {selectedCount > 1 && <div className="block-selection-hint">{S.editor.blockRowsSelected(selectedCount)}</div>}
            {preview && <div className="block-fill-ghost" aria-hidden="true">{fillRows.map(row => <div key={row.id} className="block-brick">{fmt.exerciseName({ name: row.name, name_en: row.nameEn })} <code>{shorthand(row)}</code></div>)}<small>{S.editor.blockFillPreview(fill.source.weekNumber + 1, fill.endWeek, cell.dx + 1, fillRows.length)}</small></div>}
          </div>
        })}
        {insertGaps.map(({ before, after, dates }) => {
          const id = `${week.num}:${before?.day?.dow ?? 'start'}`
          const edge = before ? before.dx + 3 : (after?.dx ?? 0) + 2
          return <div key={id} className="block-insert-gap" data-insert-week={week.num} data-insert-before={before?.day?.dow ?? 'start'}
            style={{ gridColumn: Math.min(edge, grid.columns.length + 1), gridRow: 1, justifySelf: edge > grid.columns.length + 1 ? 'end' : 'start' }}>
            <button type="button" aria-label={S.editor.blockInsertDay} aria-expanded={insertMenu === id}
              onClick={() => setInsertMenu(insertMenu === id ? null : id)}>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <path d="M5 1v8M1 5h8" />
              </svg>
            </button>
            {insertMenu === id && <div className="block-insert-menu" role="menu" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setInsertMenu(null) } }}>
              {dates.map(date => <button type="button" role="menuitem" data-insert-date={date} key={date}
                onClick={() => { props.onInsert(week.num, date); setInsertMenu(null) }}>{DOW_LABELS[(addDays(date, 0).getDay() + 6) % 7]} {mdLabel(addDays(date, 0))}</button>)}
            </div>}
          </div>
        })}
      </div>
    })}
    {rectangle && <div className="block-marquee" style={rectangle} />}
  </div>
}
