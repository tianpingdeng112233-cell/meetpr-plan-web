import * as XLSX from 'xlsx'
import type { ExerciseResponse } from '../../../api/types'
import type { ExerciseIndex } from '../exerciseIndex'
import type { DayCol, ExerciseRow, IntensityMode, SetBox, Week } from '../types'
import { currentPlanWeek, DOW_LABELS, planDayDateLabel, planWeekRangeLabel } from '../mapping'

export interface Cell { row: number; col: number; text: string }

export interface Grid {
  maxRow: number
  maxCol: number
  occupiedRows: number[]
  text(row: number, col: number): string
  numeric(row: number, col: number): number | null
}

export interface ParsedExercise {
  rawName: string
  reps: string
  mode: IntensityMode
  values: string[]
  note: string
}

export interface ParsedDay {
  dayOfWeek: number
  rest: boolean
  exercises: ParsedExercise[]
}

export interface ParsedWeek {
  blockIndex: number
  dateSerials: (number | null)[]
  days: ParsedDay[]
}

export interface WeekBlock {
  headerRow: number
  dateSerials: (number | null)[]
  contentRows: number[]
}

export interface ParsedSetLine {
  reps: string
  mode: IntensityMode
  values: string[]
  amrap: boolean
  note: string
}

const STRIDE = 5
const DAYS = 7
// One mesocycle. Coach sheets often hold many continuous weeks (several cycles); the
// import keeps only the latest 12, counted back from the most recent week
// (David 2026-06-27; 注意事项 page: 整个周期为12周).
const LATEST_WEEKS = 12

function parsePlainNumber(text: string): number | null {
  const cleaned = text.trim().replace(/,/g, '')
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(cleaned)) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

function makeGrid(cells: Cell[], maxRow: number, maxCol: number): Grid {
  const map = new Map<string, string>()
  const rows = new Set<number>()
  for (const cell of cells) {
    const text = cell.text.trim()
    if (!text) continue
    map.set(`${cell.row}:${cell.col}`, text)
    rows.add(cell.row)
  }
  return {
    maxRow,
    maxCol,
    occupiedRows: [...rows].sort((a, b) => a - b),
    text(row, col) {
      return map.get(`${row}:${col}`) ?? ''
    },
    numeric(row, col) {
      return parsePlainNumber(map.get(`${row}:${col}`) ?? '')
    },
  }
}

function cellText(cell: XLSX.CellObject | undefined): string {
  if (!cell || cell.v == null) return ''
  return String(cell.v).trim()
}

export function readWorkbook(buf: ArrayBuffer): { name: string; grid: Grid }[] {
  // `type: 'array'` requires a byte array; the browser xlsx build mis-parses a raw
  // ArrayBuffer (yields an empty "Sheet1"), so wrap it in a Uint8Array. `File.
  // arrayBuffer()` returns an ArrayBuffer, so this path is what the app actually uses.
  // Convert to a byte array first: real WPS-authored workbooks (the common case for
  // coach plans) mis-parse into an empty "Sheet1" when XLSX.read is handed the raw
  // ArrayBuffer that `File.arrayBuffer()` returns; wrapping in Uint8Array reads them
  // correctly. (Synthetic/SheetJS-written files happen to read either way.)
  const workbook = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: false })
  return workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name]
    const ref = sheet?.['!ref']
    if (!sheet || !ref) return { name, grid: makeGrid([], 0, 0) }

    const range = XLSX.utils.decode_range(ref)
    const cells: Cell[] = []
    for (let r = range.s.r; r <= range.e.r; r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r, c })
        const text = cellText(sheet[addr])
        if (text) cells.push({ row: r + 1, col: c + 1, text })
      }
    }
    return { name, grid: makeGrid(cells, range.e.r + 1, range.e.c + 1) }
  })
}

function dateCountAtOffset(grid: Grid, row: number, offset: number): number {
  let count = 0
  for (let day = 0; day < DAYS; day++) {
    const serial = grid.numeric(row, offset + day * STRIDE)
    if (serial != null && serial >= 10_000) count++
  }
  return count
}

function isDateHeaderRow(grid: Grid, row: number, offset: number): boolean {
  return dateCountAtOffset(grid, row, offset) >= 3
}

export function detectDayOffset(grid: Grid): number {
  let bestOffset = 1
  let bestScore = -1
  for (let offset = 1; offset <= STRIDE; offset++) {
    const score = grid.occupiedRows.reduce(
      (sum, row) => sum + (isDateHeaderRow(grid, row, offset) ? 1 : 0),
      0,
    )
    if (score > bestScore) {
      bestScore = score
      bestOffset = offset
    }
  }
  return bestOffset
}

function rowHasDaySpanContent(grid: Grid, row: number, offset: number): boolean {
  const endCol = offset + STRIDE * (DAYS - 1) + STRIDE - 1
  for (let col = offset; col <= endCol; col++) {
    if (grid.text(row, col)) return true
  }
  return false
}

export function weekBlocks(grid: Grid, offset: number): WeekBlock[] {
  const headerRows = grid.occupiedRows.filter((row) => isDateHeaderRow(grid, row, offset))
  return headerRows.map((headerRow, index) => {
    const nextHeader = headerRows[index + 1] ?? grid.maxRow + 1
    const contentRows = grid.occupiedRows.filter(
      (row) => row > headerRow && row < nextHeader && rowHasDaySpanContent(grid, row, offset),
    )
    const dateSerials = Array.from({ length: DAYS }, (_, day) => {
      const serial = grid.numeric(headerRow, offset + day * STRIDE)
      return serial != null && serial >= 10_000 ? serial : null
    })
    return { headerRow, dateSerials, contentRows }
  })
}

export function selectSheet(sheets: { name: string; grid: Grid }[]): Grid | null {
  let selected: { grid: Grid; recency: number } | null = null
  for (const sheet of sheets) {
    const offset = detectDayOffset(sheet.grid)
    const blocks = weekBlocks(sheet.grid, offset).filter((block) => block.contentRows.length > 0)
    if (blocks.length === 0) continue
    const recency = Math.max(...blocks.flatMap((block) => block.dateSerials).filter((n): n is number => n != null))
    if (!Number.isFinite(recency)) continue
    if (!selected || recency > selected.recency) selected = { grid: sheet.grid, recency }
  }
  return selected?.grid ?? null
}

function normalizeDecimal(n: number): string {
  const rounded = Math.round((n + Number.EPSILON) * 100) / 100
  return String(Number(rounded.toFixed(2)))
}

function parseSetReps(text: string): { setCount: number; reps: string } {
  const match = text.match(/(\d{1,2})\s*(?:[*xX×]\s*|组\s*)(\d{1,2})/)
  if (!match) return { setCount: 0, reps: '—' }
  return { setCount: Number(match[1]), reps: String(Number(match[2])) }
}

function noteJoin(parts: string[]): string {
  const out: string[] = []
  const seen = new Set<string>()
  for (const part of parts) {
    const clean = part.trim()
    if (!clean || seen.has(clean)) continue
    seen.add(clean)
    out.push(clean)
  }
  return out.join(' · ')
}

function extractMarkerNotes(fields: string[]): string[] {
  const notes: string[] = []
  for (const field of fields) {
    const text = field.trim()
    if (!text) continue
    const top = text.match(/\d+(?:\.\d+)?\s*%\s*top|%top|\btop\b/i)
    if (top) notes.push(top[0].replace(/\s+/g, ''))
    const pause = text.match(/长暂停\s*\d*\s*(?:s|S|秒)?/)
    if (pause) notes.push(pause[0].replace(/\s+/g, ''))
    if (/tempo/i.test(text)) notes.push(text)
    if (/力竭/.test(text)) notes.push('力竭')
    if (/降组/.test(text)) notes.push('降组')
    if (/回组/.test(text)) notes.push('回组')
  }
  return notes
}

function cleanValueText(text: string): string {
  return text
    .replace(/\brpe\s*/gi, '')
    .replace(/\bamrap\b/gi, '')
    .replace(/kg|公斤/gi, '')
    .replace(/力竭|降组|回组/g, '')
    .replace(/长暂停\s*\d*\s*(?:s|S|秒)?/g, '')
    .trim()
}

function parseRamp(cleaned: string, setCount: number): string[] | null {
  const match = cleaned.match(/(\d+(?:\.\d+)?)\s*(?:→|->|~)\s*(\d+(?:\.\d+)?)\s*(?:\+|递增|加)\s*(\d+(?:\.\d+)?)/)
  if (!match || setCount <= 0) return null
  const start = Number(match[1])
  const end = Number(match[2])
  const rawStep = Number(match[3])
  if (![start, end, rawStep].every(Number.isFinite) || rawStep <= 0) return null
  const dir = end >= start ? 1 : -1
  const step = rawStep * dir
  return Array.from({ length: setCount }, (_, i) => {
    const next = start + step * i
    const capped = dir > 0 ? Math.min(next, end) : Math.max(next, end)
    return normalizeDecimal(capped)
  })
}

function numbersFromSlashList(cleaned: string): number[] {
  if (!/[\/／]/.test(cleaned)) return []
  return cleaned
    .split(/[\/／]/)
    .map((part) => parsePlainNumber(part))
    .filter((n): n is number => n != null)
}

function parseValuesFromField(cleaned: string, setCount: number, mode: IntensityMode): string[] | null {
  if (setCount <= 0 || !cleaned || /%|top/i.test(cleaned)) return null

  const ramp = parseRamp(cleaned, setCount)
  if (ramp) return ramp

  const slashNumbers = numbersFromSlashList(cleaned)
  if (slashNumbers.length === setCount) return slashNumbers.map(normalizeDecimal)

  if (mode === 'rpe' && new RegExp(`^[1-9]{${setCount}}$`).test(cleaned)) {
    return cleaned.split('')
  }

  const single = parsePlainNumber(cleaned)
  if (single == null) return null
  if (mode === 'rpe' && (single < 1 || single > 10)) return null
  return Array.from({ length: setCount }, () => normalizeDecimal(single))
}

function unknownNoteForField(field: string): string {
  const cleaned = cleanValueText(field)
    .replace(/\d+(?:\.\d+)?\s*%\s*top|%top|\btop\b/gi, '')
    .replace(/\b\d{1,2}\s*(?:[*xX×]\s*|组\s*)\d{1,2}\b/g, '')
    .trim()
  if (!cleaned || parsePlainNumber(cleaned) != null) return ''
  return cleaned
}

export function parseSetLine(setsCell: string, intensityCell: string, float1: string, float2: string): ParsedSetLine {
  const fields = [setsCell, intensityCell, float1, float2].map((field) => field.trim()).filter(Boolean)
  const allText = fields.join(' ')
  const { setCount, reps: baseReps } = parseSetReps(allText)
  const amrap = /\bamrap\b/i.test(allText)
  const mode: IntensityMode = /\brpe\s*\d*|\brpe\b/i.test(allText) ? 'rpe' : 'kg'
  const notes = extractMarkerNotes(fields)

  let values: string[] = []
  let consumedFieldIndex = -1
  const valueFields = [intensityCell, float1, float2]
  for (let i = 0; i < valueFields.length; i++) {
    const field = valueFields[i].trim()
    if (!field) continue
    const parsed = parseValuesFromField(cleanValueText(field), setCount, mode)
    if (parsed) {
      values = parsed
      consumedFieldIndex = i
      break
    }
  }

  valueFields.forEach((field, index) => {
    if (index === consumedFieldIndex) return
    const note = unknownNoteForField(field)
    if (note && !/^rpe$/i.test(note)) notes.push(note)
  })

  return {
    reps: amrap && baseReps !== '—' && !baseReps.endsWith('+') ? `${baseReps}+` : baseReps,
    mode,
    values,
    amrap,
    note: noteJoin(notes),
  }
}

export function dayColumns(dayIndex: number, offset: number): {
  nameCol: number
  setsCol: number
  intensityCol: number
  float1: number
  float2: number
} {
  const nameCol = offset + dayIndex * STRIDE
  return { nameCol, setsCol: nameCol + 1, intensityCol: nameCol + 2, float1: nameCol + 3, float2: nameCol + 4 }
}

function appendNote(base: string, extra: string): string {
  return noteJoin([base, extra])
}

function splitNames(rawName: string): string[] {
  return rawName.split(/\r?\n/).map((part) => part.trim()).filter(Boolean)
}

export function parseDay(grid: Grid, rows: number[], dayIndex: number, offset: number): ParsedDay {
  const cols = dayColumns(dayIndex, offset)
  const exercises: ParsedExercise[] = []
  let sawRest = false

  for (const row of rows) {
    const rawName = grid.text(row, cols.nameCol)
    const sets = grid.text(row, cols.setsCol)
    const intensity = grid.text(row, cols.intensityCol)
    const float1 = grid.text(row, cols.float1)
    const float2 = grid.text(row, cols.float2)
    if (![rawName, sets, intensity, float1, float2].some((text) => text.trim())) continue

    if (/休息/.test(rawName) && ![sets, intensity, float1, float2].some((text) => text.trim())) {
      sawRest = true
      continue
    }

    const line = parseSetLine(sets, intensity, float1, float2)
    const names = splitNames(rawName)

    if (names.length === 0) {
      const last = exercises[exercises.length - 1]
      if (!last) continue
      last.values.push(...line.values)
      if (last.reps === '—' && line.reps !== '—') last.reps = line.reps
      if (line.note) last.note = appendNote(last.note, line.note)
      continue
    }

    for (const name of names) {
      exercises.push({
        rawName: name,
        reps: line.reps,
        mode: line.mode,
        values: [...line.values],
        note: line.note,
      })
    }
  }

  return { dayOfWeek: dayIndex, rest: exercises.length === 0 && sawRest, exercises }
}

function weekHasExercises(week: ParsedWeek): boolean {
  return week.days.some((day) => day.exercises.length > 0)
}

function resolveExercise(index: ExerciseIndex, name: string): ExerciseResponse | null {
  return index.resolve(name)
}

function rowFromParsed(exercise: ParsedExercise, resolved: ExerciseResponse | null, id: string): ExerciseRow {
  const custom = resolved?.created_by_coach_id != null
  const boxes: SetBox[] = exercise.values.map((value) => ({ val: value, empty: value.trim() === '' }))
  return {
    id,
    exerciseId: resolved?.id ?? null,
    name: resolved?.name ?? exercise.rawName,
    ku: resolved ? !custom : false,
    custom: resolved ? custom : false,
    isMain: resolved ? resolved.is_competition_lift || resolved.main_lift_family != null : false,
    aux: boxes.length === 0,
    reps: exercise.reps,
    mode: exercise.mode,
    boxes,
    note: exercise.note,
  }
}

/** Excel date serial (days since 1899-12-30) → "YYYY-MM-DD" (UTC, date-only). */
export function excelSerialToISODate(serial: number): string {
  const d = new Date(Math.round((serial - 25569) * 86400000))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

/** Plan start date taken from the sheet itself: Monday of the first week that has
 *  exercises, so imported dates match the source (spec 002 — keep original dates).
 *  Serials run Mon..Sun consecutively, so `serial − dayIndex` is that week's Monday.
 *  nil when no usable date serial is present. */
export function importStartDate(weeks: ParsedWeek[]): string | null {
  const first = weeks.find(weekHasExercises)
  if (!first) return null
  const idx = first.dateSerials.findIndex((s) => s != null && s >= 10_000)
  if (idx < 0) return null
  return excelSerialToISODate((first.dateSerials[idx] as number) - idx)
}

export function buildWeeks(
  parsed: ParsedWeek[], index: ExerciseIndex, planWeeks: number, startDate: string,
): { weeks: Week[]; startDate: string } {
  // Latest mesocycle first (last LATEST_WEEKS of the plan), then fit into the current
  // plan's week count.
  const sourceWeeks = parsed
    .filter(weekHasExercises)
    .slice(-LATEST_WEEKS)
    .slice(0, Math.max(0, planWeeks))
  // Date the plan from the sheet itself so imported dates match the source (spec 002
  // option A); fall back to the plan's own start_date only when the sheet has no dates.
  const effectiveStart = importStartDate(sourceWeeks) ?? startDate
  const curWeek = currentPlanWeek(effectiveStart)

  const weeks = sourceWeeks.map((sourceWeek, weekIndex) => {
    const weekNumber = weekIndex + 1
    const byDay = new Map(sourceWeek.days.map((day) => [day.dayOfWeek, day]))
    const days: DayCol[] = []
    for (let dow = 0; dow < DAYS; dow++) {
      const parsedDay = byDay.get(dow)
      const rows = parsedDay?.exercises.map((exercise, rowIndex) => (
        rowFromParsed(exercise, resolveExercise(index, exercise.rawName), `imp-${weekNumber}-${dow}-${rowIndex}`)
      )) ?? []
      days.push({
        dow,
        dowLabel: DOW_LABELS[dow],
        dateLabel: planDayDateLabel(effectiveStart, weekNumber, dow),
        rest: rows.length === 0 || parsedDay?.rest === true,
        rows,
      })
    }

    return {
      num: weekNumber,
      num2: String(weekNumber).padStart(2, '0'),
      range: planWeekRangeLabel(effectiveStart, weekNumber),
      isCurrent: weekNumber === curWeek,
      vol: '',
      days,
    }
  })
  // startDate = the plan start derived from the sheet, so the caller can PATCH the
  // backend plan's start_date and the imported dates survive a reload.
  return { weeks, startDate: effectiveStart }
}
