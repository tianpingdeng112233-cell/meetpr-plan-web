import * as XLSX from 'xlsx'
import type { ExerciseResponse } from '../../../api/types'
import type { ExerciseIndex } from '../exerciseIndex'
import type { DayCol, ExerciseRow, IntensityMode, SetBox, Week } from '../types'
import { currentPlanWeek, planDayDateLabel, planDayDowLabel, planWeekRangeLabel } from '../mapping'

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
  setCount: number
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
  setCount: number
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
const MAX_WORKBOOK_BYTES = 10 * 1024 * 1024
const MAX_SHEET_CELLS = 60_000

export class WorkbookImportError extends Error {
  constructor(public readonly code: 'WORKBOOK_TOO_LARGE' | 'SHEET_TOO_LARGE') {
    super(code)
  }
}

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
  if (buf.byteLength > MAX_WORKBOOK_BYTES) throw new WorkbookImportError('WORKBOOK_TOO_LARGE')
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

    // A sheet ref can cover an enormous formatted rectangle even when the
    // workbook has only a handful of values. Iterate SheetJS's sparse cell
    // map instead of allocating or visiting every coordinate in that range.
    const entries = Object.entries(sheet).filter(([address]) => /^[A-Z]+[1-9]\d*$/.test(address))
    if (entries.length > MAX_SHEET_CELLS) throw new WorkbookImportError('SHEET_TOO_LARGE')
    const cells: Cell[] = []
    let maxRow = 0
    let maxCol = 0
    for (const [address, value] of entries) {
      const coord = XLSX.utils.decode_cell(address)
      const text = cellText(value as XLSX.CellObject)
      if (!text) continue
      const row = coord.r + 1
      const col = coord.c + 1
      cells.push({ row, col, text })
      maxRow = Math.max(maxRow, row)
      maxCol = Math.max(maxCol, col)
    }
    return { name, grid: makeGrid(cells, maxRow, maxCol) }
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

function repsText(min: string, max?: string): string {
  const lo = Number(min)
  const hi = max == null ? null : Number(max)
  if (!Number.isFinite(lo)) return '—'
  if (hi == null || !Number.isFinite(hi) || hi === lo) return String(lo)
  return `${lo}-${hi}`
}

const COUNT_TOKEN = String.raw`(?:\d{1,2}|[一二两三四五六七八九十]{1,3})`

function chineseCount(token: string): number | null {
  const t = token.trim()
  if (/^\d{1,2}$/.test(t)) return Number(t)
  const digits: Record<string, number> = {
    一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
  }
  if (t === '十') return 10
  const ten = t.match(/^([一二两三四五六七八九])?十([一二两三四五六七八九])?$/)
  if (ten) return (ten[1] ? digits[ten[1]] : 1) * 10 + (ten[2] ? digits[ten[2]] : 0)
  return digits[t] ?? null
}

function isTimeSuffix(text: string, endIndex: number): boolean {
  return /^\s*(?:s|S|秒)/.test(text.slice(endIndex))
}

function parseSetReps(text: string): { setCount: number; reps: string } {
  const full = text.match(
    new RegExp(`(${COUNT_TOKEN})\\s*(?:[*＊xX×]\\s*|[组組]\\s*)(${COUNT_TOKEN})(?:\\s*(?:-|–|—|~|到|至)\\s*(${COUNT_TOKEN}))?\\s*(?:个|次)?`),
  )
  if (full && !isTimeSuffix(text, (full.index ?? 0) + full[0].length)) {
    const setCount = chineseCount(full[1])
    const reps = chineseCount(full[2])
    const repsMax = full[3] ? chineseCount(full[3]) : null
    if (setCount != null && reps != null) return { setCount, reps: repsText(String(reps), repsMax == null ? undefined : String(repsMax)) }
  }

  const setOnly = text.match(new RegExp(`(${COUNT_TOKEN})\\s*[组組]`))
  if (!setOnly) return { setCount: 0, reps: '—' }
  const setCount = chineseCount(setOnly[1]) ?? 0

  const rest = text.slice((setOnly.index ?? 0) + setOnly[0].length)
  const range = rest.match(new RegExp(`(${COUNT_TOKEN})\\s*(?:-|–|—|~|到|至)\\s*(${COUNT_TOKEN})\\s*(?:个|次)?`))
  if (range && !isTimeSuffix(rest, (range.index ?? 0) + range[0].length)) {
    const lo = chineseCount(range[1])
    const hi = chineseCount(range[2])
    if (lo != null && hi != null) return { setCount, reps: repsText(String(lo), String(hi)) }
  }

  if (!/\brpe\b/i.test(rest)) {
    const single = rest.match(new RegExp(`(${COUNT_TOKEN})\\s*(?:个|次)?`))
    if (single && !isTimeSuffix(rest, (single.index ?? 0) + single[0].length)) {
      const reps = chineseCount(single[1])
      if (reps != null) return { setCount, reps: repsText(String(reps)) }
    }
  }

  return { setCount, reps: '—' }
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
    const pauseNote = pauseDurationNote(text)
    if (pauseNote) notes.push(pauseNote)
    if (/tempo/i.test(text)) notes.push(text)
    if (/力竭/.test(text)) notes.push('力竭')
    if (/降组/.test(text)) notes.push('降组')
    if (/回组/.test(text)) notes.push('回组')
  }
  return notes
}

function pauseDurationNote(text: string): string {
  const pause = text.match(/(?:长)?暂停\s*(?:卧推|深蹲|硬拉)?\s*(\d+(?:\.\d+)?)\s*(?:s|S|秒)/)
  return pause ? `${pause[1]}s` : ''
}

/** A timed hold written in an intensity cell. The first unit is commonly omitted
 * in coach sheets ("20-40s"), so accept both that and "20s-40s". Anchoring the
 * whole field keeps pause notes such as "长暂停2s" out of this path. */
function timedPrescriptionNote(text: string): string {
  const trimmed = text.trim()
  const range = trimmed.match(/^(\d+(?:\.\d+)?)\s*(s|S|秒)?\s*(?:-|–|—|~|到|至)\s*(\d+(?:\.\d+)?)\s*(?:s|S|秒)$/)
  if (range) {
    const firstUnit = range[2] ? 's' : ''
    return `${normalizeDecimal(Number(range[1]))}${firstUnit}-${normalizeDecimal(Number(range[3]))}s`
  }
  const single = trimmed.match(/^(\d+(?:\.\d+)?)\s*(?:s|S|秒)$/)
  return single ? `${normalizeDecimal(Number(single[1]))}s` : ''
}

function cleanValueText(text: string): string {
  return text
    .replace(/\brpe\s*/gi, '')
    .replace(/\bamrap\b/gi, '')
    .replace(/kg|公斤/gi, '')
    .replace(/力竭|降组|回组/g, '')
    .replace(/(?:长)?暂停\s*(?:卧推|深蹲|硬拉)?\s*\d*\s*(?:s|S|秒)?/g, '')
    .trim()
}

function hasBodyweightCue(text: string): boolean {
  return /自重|徒手|bodyweight|弹力带|弹力绳|弹力|band|磅数/i.test(text)
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
  const values: number[] = []
  for (const part of cleaned.split(/[\/／]/)) {
    const match = part.trim().match(/^([+-]?\d+(?:\.\d+)?)\s*(?:[*＊xX×]\s*(\d{1,2}))?$/)
    if (!match) return []
    const value = Number(match[1])
    const repeat = match[2] == null ? 1 : Number(match[2])
    if (!Number.isFinite(value) || !Number.isInteger(repeat) || repeat <= 0 || repeat > 20) {
      return []
    }
    values.push(...Array.from({ length: repeat }, () => value))
  }
  return values
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
    .replace(/\b\d{1,2}\s*(?:[*＊xX×]\s*|[组組]\s*)\d{1,2}\b/g, '')
    .replace(/\d{1,2}\s*[组組]/g, '')
    .replace(/\d{1,2}\s*(?:-|–|—|~|到|至)\s*\d{1,2}\s*(?:个|次)?/g, '')
    .trim()
  if (!cleaned || parsePlainNumber(cleaned) != null) return ''
  return cleaned
}

export function parseSetLine(setsCell: string, intensityCell: string, float1: string, float2: string): ParsedSetLine {
  const fields = [setsCell, intensityCell, float1, float2].map((field) => field.trim()).filter(Boolean)
  const allText = fields.join(' ')
  const { setCount, reps: baseReps } = parseSetReps(allText)
  const amrap = /\bamrap\b/i.test(allText)
  const hasFailure = /力竭/.test(allText)
  const timedNote = [intensityCell, float1, float2]
    .map(timedPrescriptionNote)
    .find(Boolean) ?? ''
  const mode: IntensityMode = timedNote || hasBodyweightCue(allText)
    ? 'bodyweight'
    : /\brpe\s*\d*|\brpe\b/i.test(allText) || hasFailure ? 'rpe' : 'kg'
  // Product rule: “力竭” is a to-failure (AMRAP) set at RPE 10. When a base rep
  // count exists it is encoded into reps as “n+”, so the redundant note is
  // dropped; with no base count reps stays “—” and the note keeps the
  // to-failure meaning. Never fabricate a misleading “1” rep for a failure set.
  const failureEncodedInReps = hasFailure && baseReps !== '—'
  const notes = extractMarkerNotes(fields).filter((note) => !(failureEncodedInReps && note === '力竭'))
  if (timedNote) notes.push(timedNote)

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

  if (values.length === 0 && hasFailure && setCount > 0 && mode !== 'bodyweight') {
    values = Array.from({ length: setCount }, () => '10')
  }

  valueFields.forEach((field, index) => {
    if (index === consumedFieldIndex) return
    if (timedPrescriptionNote(field)) return
    const note = unknownNoteForField(field)
    if (note && !/^rpe$/i.test(note)) notes.push(note)
  })

  return {
    setCount,
    // A to-failure set is AMRAP: encode it as “n+” when a base count exists,
    // otherwise leave reps unset (“—”) rather than inventing a fake “1”.
    reps: timedNote
      ? '1'
      : (amrap || hasFailure) && baseReps !== '—' && !baseReps.endsWith('+')
        ? `${baseReps}+`
        : baseReps,
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

function isEventOnlyRow(rawName: string, fields: string[]): boolean {
  return /(?:\bIPF\b|比赛|赛事|锦标赛|公开赛|邀请赛)/i.test(rawName)
    && !fields.some((field) => field.trim())
}

function normalizeParsedExerciseName(rawName: string): { rawName: string; note: string } {
  const trimmed = rawName.trim()
  const spoto = trimmed.match(/^spoto\s*暂停(?:卧推)?\s*(\d+(?:\.\d+)?)?\s*(?:s|S|秒)?$/i)
  if (spoto) {
    return {
      rawName: 'spoto 暂停卧推',
      note: spoto[1] ? `${spoto[1]}s` : '',
    }
  }

  const ssbTempo = trimmed.match(/^安全[杆杠]节奏(?:深)?蹲\s*([0-9０-９]{3})$/)
  if (ssbTempo) {
    const digits = ssbTempo[1].replace(/[０-９]/g, (d) => String(d.charCodeAt(0) - 0xff10))
    return {
      rawName: '安全杠节奏深蹲',
      note: `tempo ${digits.split('').join('-')}`,
    }
  }

  const tempoSuffix = trimmed.match(/^(.+?)\s+([0-9０-９]{3})$/)
  if (tempoSuffix) {
    const digits = tempoSuffix[2].replace(/[０-９]/g, (d) => String(d.charCodeAt(0) - 0xff10))
    return {
      rawName: tempoSuffix[1].trim(),
      note: `tempo ${digits.split('').join('-')}`,
    }
  }

  const match = trimmed.match(/^(?:长)?暂停\s*(卧推|深蹲|硬拉)\s*(\d+(?:\.\d+)?)?\s*(?:s|S|秒)?$/)
  if (!match) return { rawName: trimmed, note: '' }
  return {
    rawName: `暂停${match[1]}`,
    note: match[2] ? `${match[2]}s` : '',
  }
}

function normalizeParsedExercise(exercise: ParsedExercise): ParsedExercise {
  const normalized = normalizeParsedExerciseName(exercise.rawName)
  return {
    ...exercise,
    rawName: normalized.rawName,
    note: appendNote(exercise.note, normalized.note),
  }
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

    // Calendar/event labels occasionally sit inside a day column. With no
    // prescription they are not exercises and should not inflate review counts.
    if (isEventOnlyRow(rawName, [sets, intensity, float1, float2])) continue

    const line = parseSetLine(sets, intensity, float1, float2)
    const names = splitNames(rawName)

    if (names.length === 0) {
      const last = exercises[exercises.length - 1]
      if (!last) continue
      last.values.push(...line.values)
      if (last.setCount === 0 && line.setCount > 0) last.setCount = line.setCount
      if (last.reps === '—' && line.reps !== '—') last.reps = line.reps
      if (line.note) last.note = appendNote(last.note, line.note)
      continue
    }

    for (const name of names) {
      const normalized = normalizeParsedExercise({ rawName: name, setCount: line.setCount, reps: line.reps, mode: line.mode, values: [...line.values], note: line.note })
      exercises.push({
        rawName: normalized.rawName,
        setCount: normalized.setCount,
        reps: normalized.reps,
        mode: normalized.mode,
        values: normalized.values,
        note: normalized.note,
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

function expandCompositeExercise(exercise: ParsedExercise, index: ExerciseIndex): ParsedExercise[] {
  if (/^二三头自选\s*[*＊xX×]\s*2$/.test(exercise.rawName)) {
    const choices = ['二头动作自选', '三头肌自选'].map((rawName) => ({
      ...exercise,
      rawName,
      note: appendNote(exercise.note, '自选'),
    }))
    if (choices.every((choice) => resolveExercise(index, choice.rawName))) return choices
  }
  const parts = exercise.rawName.split(/[+＋]/).map((part) => part.trim()).filter(Boolean)
  if (parts.length < 2) return [exercise]
  const split = parts.map((part) => normalizeParsedExercise({ ...exercise, rawName: part }))
  if (!split.every((part) => resolveExercise(index, part.rawName))) return [exercise]
  return split
}

function rowFromParsed(exercise: ParsedExercise, resolved: ExerciseResponse | null, id: string): ExerciseRow {
  const custom = resolved?.created_by_coach_id != null
  const values = exercise.values.length > 0
    ? exercise.values
    : Array.from({ length: exercise.setCount }, () => '')
  const boxes: SetBox[] = values.map((value) => ({ val: value, empty: value.trim() === '' }))
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

/** Plan start date taken from the sheet itself: the first selected week-column
 *  anchor, so imported dates match the source even when the cycle starts mid-week.
 *  Serials run across the visible columns consecutively, so `serial − dayIndex`
 *  is the date represented by column 0 of that plan week.
 *  nil when no usable date serial is present. */
export function importStartDate(weeks: ParsedWeek[]): string | null {
  const first = weeks.find((week) => week.dateSerials.some((s) => s != null && s >= 10_000))
  if (!first) return null
  const idx = first.dateSerials.findIndex((s) => s != null && s >= 10_000)
  if (idx < 0) return null
  return excelSerialToISODate((first.dateSerials[idx] as number) - idx)
}

function latestCalendarWindow(parsed: ParsedWeek[]): ParsedWeek[] {
  const contentIndexes: number[] = []
  parsed.forEach((week, index) => {
    if (weekHasExercises(week)) contentIndexes.push(index)
  })
  if (contentIndexes.length === 0) return []

  const firstContentIndex = contentIndexes[0]
  const lastContentIndex = contentIndexes[contentIndexes.length - 1]
  const startIndex = Math.max(firstContentIndex, lastContentIndex - LATEST_WEEKS + 1)
  return parsed.slice(startIndex, lastContentIndex + 1)
}

export function buildWeeks(
  parsed: ParsedWeek[], index: ExerciseIndex, startDate: string,
): { weeks: Week[]; startDate: string } {
  // Import the latest mesocycle as a calendar window ending at the last week with content.
  // Keep empty weeks inside that window; dropping them would compress later dated content
  // (for example July rows) into earlier labels after save/reload.
  const sourceWeeks = latestCalendarWindow(parsed)
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
      const rows = parsedDay?.exercises.flatMap((exercise, rowIndex) => {
        const normalized = normalizeParsedExercise(exercise)
        return expandCompositeExercise(normalized, index).map((expanded, splitIndex) => rowFromParsed(
          expanded,
          resolveExercise(index, expanded.rawName),
          `imp-${weekNumber}-${dow}-${rowIndex}-${splitIndex}`,
        ))
      }) ?? []
      days.push({
        dow,
        dowLabel: planDayDowLabel(effectiveStart, weekNumber, dow),
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
