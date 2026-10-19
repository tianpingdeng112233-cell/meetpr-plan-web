import type { DayCol, ExerciseRow, Week } from './types'
import { addDays, dowLabel, mdLabel, recommendedDateForDay } from './mapping'

export interface BlockCell { weekNumber: number; dx: number; day: DayCol | null }
export interface BlockColumn { dx: number; weekday: number }
export interface BlockGrid { columns: BlockColumn[]; rows: { week: Week; cells: BlockCell[] }[] }
/** Calendar offsets remain storage coordinates; Dx is only a projection. */
export function buildBlockGrid(weeks: readonly Week[], startDate?: string | null, weekdays: readonly number[] = []): BlockGrid {
  const days = weeks.map(week => week.days.filter(day => day.rows.length > 0 || day.serverDayId).slice().sort((a, b) => {
    if (!startDate) return a.dow - b.dow
    return recommendedDateForDay(startDate, week.num, a).localeCompare(recommendedDateForDay(startDate, week.num, b)) || a.dow - b.dow
  }))
  const count = Math.max(1, weekdays.length, ...days.map(week => week.length))
  const columns = Array.from({ length: count }, (_, dx) => {
    const votes = new Map<number, number>()
    days.forEach((weekDays, index) => {
      const day = weekDays[dx]
      if (!day) return
      const weekday = startDate
        ? (addDays(recommendedDateForDay(startDate, weeks[index].num, day), 0).getDay() + 6) % 7
        : day.dow
      votes.set(weekday, (votes.get(weekday) ?? 0) + 1)
    })
    // Ties retain the first observed weekday, making irregular legacy plans stable.
    const weekday = weekdays[dx] ?? [...votes].sort((a, b) => b[1] - a[1])[0]?.[0]
      ?? (startDate ? (addDays(startDate, 0).getDay() + 6) % 7 : 0)
    return { dx, weekday }
  })
  return { columns, rows: weeks.map((week, index) => {
    const cells: BlockCell[] = columns.map(({ dx }) => ({ weekNumber: week.num, dx, day: null }))
    const unmatched: DayCol[] = []
    for (const day of days[index]) {
      const weekday = startDate
        ? (addDays(recommendedDateForDay(startDate, week.num, day), 0).getDay() + 6) % 7 : day.dow
      const slot = columns.find(column => column.weekday === weekday && !cells[column.dx].day)
      if (slot) cells[slot.dx].day = day
      else unmatched.push(day)
    }
    // Reserve matching weekdays first; irregular legacy dates fill the remaining slots in order.
    for (const day of unmatched) cells.find(cell => !cell.day)!.day = day
    return { week, cells }
  }) }
}

export interface BlockAddress { weekNumber: number; dx: number }
/** Resolve a missing Dx into an unused calendar slot without stealing another day. */
export function blockTargetDay(grid: BlockGrid, address: BlockAddress, start?: string | null): DayCol | null {
  const row = grid.rows.find(row => row.week.num === address.weekNumber)
  const column = grid.columns[address.dx]
  if (!row || !column) return null
  const existing = row.cells[address.dx]?.day
  if (existing) return existing
  const startWeekday = start ? (addDays(start, 0).getDay() + 6) % 7 : 0
  const dow = (column.weekday - startWeekday + 7) % 7
  const slot = row.week.days.find(day => day.dow === dow)
  if (slot?.rows.length || slot?.serverDayId) return null
  if (slot) return slot
  const date = start ? addDays(start, (row.week.num - 1) * 7 + dow) : null
  return { dow, dowLabel: date ? dowLabel(date) : '', dateLabel: date ? mdLabel(date) : '', rest: true, rows: [] }
}

let copySerial = 0
export function cloneBlockRows(rows: readonly ExerciseRow[]): ExerciseRow[] {
  return rows.map(row => ({
    ...structuredClone(row), id: `block-${Date.now()}-${++copySerial}`,
    serverRowId: null, serverSortOrder: null, hasLogs: false, conflictMessage: null,
  }))
}

/** Preserve logged slots and released sort orders, as required by mixed-day reconciliation. */
export function replaceBlockDay(day: DayCol, source: readonly ExerciseRow[]): DayCol {
  const copies = cloneBlockRows(source)
  let index = 0
  const released = new Set(day.releasedSortOrders ?? [])
  const rows = day.rows.flatMap(row => {
    if (row.hasLogs) return [row]
    const replacement = copies[index++]
    if (replacement) return [{ ...replacement, serverSortOrder: row.serverSortOrder }]
    if (row.serverSortOrder != null) released.add(row.serverSortOrder)
    return []
  })
  rows.push(...copies.slice(index))
  return { ...day, rows, rest: rows.length === 0, releasedSortOrders: [...released] }
}

function writeDay(weeks: Week[], weekNumber: number, day: DayCol): Week[] {
  return weeks.map(week => week.num !== weekNumber ? week : { ...week,
    days: week.days.some(slot => slot.dow === day.dow)
      ? week.days.map(slot => slot.dow === day.dow ? day : slot)
      : [...week.days, day].sort((a, b) => a.dow - b.dow),
  })
}

export function fillBlockDays(weeks: Week[], source: BlockAddress, endWeek: number, start?: string | null, weekdays: readonly number[] = []): Week[] {
  const grid = buildBlockGrid(weeks, start, weekdays)
  const sourceDay = grid.rows.find(row => row.week.num === source.weekNumber)?.cells[source.dx]?.day
  if (!sourceDay) return weeks
  return grid.rows.filter(row => row.week.num > source.weekNumber && row.week.num <= endWeek)
    .reduce((result, row) => {
      const day = blockTargetDay(grid, { weekNumber: row.week.num, dx: source.dx }, start)
      return day ? writeDay(result, row.week.num, replaceBlockDay(day, sourceDay.rows)) : result
    }, weeks)
}

export function pasteBlockRows(weeks: Week[], target: BlockAddress, rows: ExerciseRow[], start?: string | null,
  tier: (row: ExerciseRow) => 'main' | 'aux' = row => row.isMain ? 'main' : 'aux'): Week[] {
  const day = blockTargetDay(buildBlockGrid(weeks, start), target, start)
  if (!day || !rows.length) return weeks
  const inserted = cloneBlockRows(rows)
  const ordered = (['main', 'aux'] as const).flatMap(section => [
    ...day.rows.filter(row => tier(row) === section), ...inserted.filter(row => tier(row) === section),
  ])
  return writeDay(weeks, target.weekNumber, { ...day, rows: ordered, rest: false })
}

function moveToOffset(week: Week, source: DayCol, dow: number, start: string): Week {
  if (source.dow === dow || source.completedAt || source.rows.some(row => row.hasLogs)) return week
  const target = week.days.find(day => day.dow === dow)
  // An exception changes only one cell: never swap or overwrite an occupied date.
  if (target && (target.rows.length || target.serverDayId || target.completedAt)) return week
  const date = addDays(start, (week.num - 1) * 7 + dow)
  const moved: DayCol = { ...target, dow, rows: source.rows, rest: false, releasedSortOrders: [], dowLabel: dowLabel(date), dateLabel: mdLabel(date), shiftedToDate: null, shiftBadge: null }
  const originalDate = addDays(start, (week.num - 1) * 7 + source.dow)
  const empty: DayCol = { ...source, dowLabel: dowLabel(originalDate), dateLabel: mdLabel(originalDate), rest: true, rows: [], releasedSortOrders: [], shiftedToDate: null, shiftBadge: null }
  return { ...week, days: [...week.days.filter(day => day.dow !== source.dow && day.dow !== dow), empty, moved].sort((a, b) => a.dow - b.dow) }
}

export function changeBlockWeekday(weeks: Week[], dx: number, weekday: number, start: string, weekdays: readonly number[] = []): Week[] {
  const grid = buildBlockGrid(weeks, start, weekdays)
  const dow = (weekday - (addDays(start, 0).getDay() + 6) % 7 + 7) % 7
  return weeks.map(week => {
    const day = grid.rows.find(row => row.week.num === week.num)?.cells[dx]?.day
    return day ? moveToOffset(week, day, dow, start) : week
  })
}

export function changeBlockDate(weeks: Week[], target: BlockAddress, date: string, start: string, weekdays: readonly number[] = []): Week[] {
  const grid = buildBlockGrid(weeks, start, weekdays)
  const row = grid.rows.find(row => row.week.num === target.weekNumber)
  const day = row?.cells[target.dx]?.day
  if (!row || !day) return weeks
  const dates = Array.from({ length: 7 }, (_, offset) => {
    const d = addDays(start, (target.weekNumber - 1) * 7 + offset)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const dow = dates.indexOf(date)
  if (dow < 0) return weeks
  const moved = moveToOffset(row.week, day, dow, start)
  return moved === row.week ? weeks : weeks.map(week => week === row.week ? moved : week)
}

/** Apply a whole pattern from one snapshot, so occupied destinations cannot swap Dx identities.
 * Logged days stay put. A collision with a stationary day rejects the entire change.
 */
export function changeBlockPattern(weeks: Week[], pattern: readonly number[], start: string, previous: readonly number[]): Week[] | null {
  const grid = buildBlockGrid(weeks, start, previous)
  const startWeekday = (addDays(start, 0).getDay() + 6) % 7
  let changed = false
  const result: Week[] = []
  for (const { week, cells } of grid.rows) {
    // Removing populated Dx has no approved deletion semantics: keep all content.
    if (cells.slice(pattern.length).some(cell => cell.day)) return null
    const moves = cells.flatMap((cell, dx) => {
      const day = cell.day
      if (!day || pattern[dx] == null || pattern[dx] === previous[dx] || day.completedAt || day.rows.some(row => row.hasLogs)) return []
      const dow = (pattern[dx] - startWeekday + 7) % 7
      return day.dow === dow ? [] : [{ day, dow }]
    })
    const sources = new Set(moves.map(move => move.day.dow))
    const targets = new Set(moves.map(move => move.dow))
    if (targets.size !== moves.length) return null
    if (moves.some(move => week.days.some(day => day.dow === move.dow
      && !sources.has(day.dow) && (day.rows.length || day.serverDayId || day.completedAt)))) return null
    if (!moves.length) { result.push(week); continue }
    changed = true
    const days = Array.from({ length: 7 }, (_, dow) => {
      const existing = week.days.find(day => day.dow === dow)
      const incoming = moves.find(move => move.dow === dow)
      if (!incoming && !sources.has(dow)) return existing
      const date = addDays(start, (week.num - 1) * 7 + dow)
      return { ...existing, dow, dowLabel: dowLabel(date), dateLabel: mdLabel(date),
        rows: incoming?.day.rows ?? [], rest: !incoming, releasedSortOrders: [], shiftedToDate: null, shiftBadge: null }
    }).filter((day): day is DayCol => !!day)
    result.push({ ...week, days })
  }
  return changed ? result : weeks
}
