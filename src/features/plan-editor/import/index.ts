import type { ExerciseResponse } from '../../../api/types'
import type { ExerciseIndex } from '../exerciseIndex'
import type { DayCol, ExerciseRow, ImportDoubt, SetBox, Week } from '../types'
import { currentPlanWeek, planDayDateLabel, planDayDowLabel, planWeekRangeLabel } from '../mapping'
export { readWorkbook, workbookToSheets, pastedToSheets, regionCells } from './sheets'
const DAYS = 7

export interface ParsedExercise {
  importDoubts?: ImportDoubt[]
  rawName: string
  setCount: number
  reps: string
  intensityKind: 'rpe' | 'rir' | 'pct' | null
  intensityValues: string[]
  weightValues: string[]
  note: string
}

export interface ParsedDay {
  dayOfWeek: number
  rest: boolean
  exercises: ParsedExercise[]
}

export interface ParsedWeek {
  importDoubts?: ImportDoubt[]
  blockIndex: number
  dateSerials: (number | null)[]
  days: ParsedDay[]
}

function rowFromParsed(exercise: ParsedExercise, resolved: ExerciseResponse | null, id: string): ExerciseRow {
  const custom = resolved?.created_by_coach_id != null
  const toBoxes = (values: string[]): SetBox[] => Array.from({ length: exercise.setCount }, (_, index) => {
    const value = values[index] ?? ''
    return { val: value, empty: value.trim() === '' }
  })
  const intensityBoxes = toBoxes(exercise.intensityValues)
  const boxes = toBoxes(exercise.weightValues)
  return {
    id,
    serverRowId: null,
    serverSortOrder: null,
    hasLogs: false,
    conflictMessage: null,
    exerciseId: resolved?.id ?? null,
    name: resolved?.name ?? exercise.rawName,
    ...(resolved?.name_en ? { nameEn: resolved.name_en } : {}),
    ku: resolved ? !custom : false,
    custom: resolved ? custom : false,
    isMain: resolved ? resolved.is_competition_lift || resolved.main_lift_family != null : false,
    aux: boxes.length === 0,
    reps: exercise.reps,
    mode: 'kg',
    ...(exercise.intensityKind && exercise.intensityValues.length > 0 ? {
      intensity: { mode: exercise.intensityKind, value: intensityBoxes[0]?.val ?? '', high: '' },
      intensityMode: new Set(intensityBoxes.map((box) => box.empty ? '<empty>' : box.val)).size > 1
        ? 'per_set' as const
        : 'uniform' as const,
      intensityBoxes,
    } : { intensity: null }),
    weightMode: new Set(boxes.map((box) => box.empty ? '<empty>' : box.val)).size > 1 ? 'per_set' : 'uniform',
    boxes,
    note: exercise.note,
    ...(exercise.importDoubts?.length ? { importDoubts: exercise.importDoubts } : {}),
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

export function buildWeeks(
  parsed: ParsedWeek[], index: ExerciseIndex, startDate: string,
): { weeks: Week[]; startDate: string } {
  // Selection and AI interpretation happen before this binder. Preserve every selected week.
  const sourceWeeks = parsed
  const effectiveStart = importStartDate(sourceWeeks.slice(0, 1)) ?? startDate
  const curWeek = currentPlanWeek(effectiveStart)

  const weeks = sourceWeeks.map((sourceWeek, weekIndex) => {
    const weekNumber = weekIndex + 1
    const byDay = new Map(sourceWeek.days.map((day) => [day.dayOfWeek, day]))
    const days: DayCol[] = []
    for (let dow = 0; dow < DAYS; dow++) {
      const parsedDay = byDay.get(dow)
      const rows = parsedDay?.exercises.map((exercise, rowIndex) => rowFromParsed(
        exercise, index.resolve(exercise.rawName), `imp-${weekNumber}-${dow}-${rowIndex}`,
      )) ?? []
      days.push({
        dow,
        dowLabel: planDayDowLabel(effectiveStart, weekNumber, dow),
        dateLabel: planDayDateLabel(effectiveStart, weekNumber, dow),
        shiftedToDate: null,
        shiftBadge: null,
        rest: rows.length === 0,
        rows,
      })
    }

    return {
      ...(sourceWeek.importDoubts?.length ? { importDoubts: sourceWeek.importDoubts } : {}),
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
