import type { ExerciseResponse } from '../../../api/types'
import { freeWeightEnabled } from '../intensityModel'
import { isValidReps } from '../inputGuard'
import type { ExerciseIndex } from '../exerciseIndex'
import type { DayCol, ExerciseRow, ImportDoubt, SetBox, Week } from '../types'
import { currentPlanWeek, planDayDateLabel, planDayDowLabel, planWeekRangeLabel } from '../mapping'
import { splitExerciseSpecification } from '../../../i18n/stable-zh'
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
  const row: ExerciseRow = {
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
    note: [...new Set([exercise.note, resolved && resolved.name !== exercise.rawName
      ? splitExerciseSpecification(exercise.rawName).specification : ''].map(part => part.trim()).filter(Boolean))].join(' · '),
    ...(exercise.importDoubts?.length ? { importDoubts: exercise.importDoubts } : {}),
  }
  // Q10 keeps the 015 incomplete-row rules until the new load modes are enabled.
  if (freeWeightEnabled() && resolved && !row.aux && isValidReps(row.reps)
    && boxes.every(box => box.empty)) {
    const bodyweight = !row.intensity && resolved.equipment.includes('bodyweight')
    return bodyweight
      ? { ...row, mode: 'bodyweight', autoLoadMode: true, bodyweightIntensity: true }
      : { ...row, weightMode: 'free_weight', autoLoadMode: true }
  }
  return row
}

/** Excel date serial (days since 1899-12-30) → "YYYY-MM-DD" (UTC, date-only). */
export function excelSerialToISODate(serial: number): string {
  const d = new Date(Math.round((serial - 25569) * 86400000))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

function weekStartSerial(week: ParsedWeek): number | null {
  const column = week.dateSerials.findIndex(serial => serial != null && serial >= 10_000)
  return column < 0 ? null : (week.dateSerials[column] as number) - column
}

function datedTrainingDays(weeks: ParsedWeek[]): { day: ParsedDay; serial: number }[] {
  const anchorIndex = weeks.findIndex(week => weekStartSerial(week) != null)
  if (anchorIndex < 0) return []
  const calendarStart = weekStartSerial(weeks[anchorIndex])! - anchorIndex * DAYS
  return weeks.flatMap((week, weekIndex) => {
    const weekStart = weekStartSerial(week) ?? calendarStart + weekIndex * DAYS
    return week.days.filter(day => day.exercises.length > 0)
      .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
      .map(day => ({
        day,
        // Excel dates may carry a time fraction; calendar slots are whole days.
        serial: Math.floor(week.dateSerials[day.dayOfWeek] ?? weekStart + day.dayOfWeek),
      }))
  }).sort((a, b) => a.serial - b.serial)
}

/** First prescription's source date; null for an undated or empty sheet. */
export function importStartDate(weeks: ParsedWeek[]): string | null {
  const first = datedTrainingDays(weeks)[0]
  return first ? excelSerialToISODate(first.serial) : null
}

function regroupDatedWeeks(weeks: ParsedWeek[]): ParsedWeek[] {
  const trainingDays = datedTrainingDays(weeks)
  if (trainingDays.length === 0) return weeks
  const firstSerial = trainingDays[0].serial
  // Keep explicitly selected empty-week placeholders, including their review flags.
  const emptyWeekEnds = weeks.filter(week => week.importDoubts?.includes('empty_week'))
    .map(week => Math.floor(weekStartSerial(week)!) + DAYS - 1)
  const lastSerial = Math.max(...trainingDays.map(({ serial }) => serial), ...emptyWeekEnds)
  const regrouped: ParsedWeek[] = Array.from({ length: Math.floor((lastSerial - firstSerial) / DAYS) + 1 }, (_, w) => ({
    blockIndex: w,
    dateSerials: Array.from({ length: DAYS }, (_, d) => firstSerial + w * DAYS + d),
    days: [],
  }))
  for (const { day, serial } of trainingDays) {
    const offset = serial - firstSerial
    const target = regrouped[Math.floor(offset / DAYS)]
    const existing = target.days.find(candidate => candidate.dayOfWeek === offset % DAYS)
    if (existing) existing.exercises = [...existing.exercises, ...day.exercises]
    else target.days.push({ ...day, dayOfWeek: offset % DAYS })
  }
  for (const week of weeks.filter(week => week.importDoubts?.length)) {
    const start = Math.floor(weekStartSerial(week)!)
    const first = Math.max(0, Math.floor((start - firstSerial) / DAYS))
    // A leading placeholder can precede the new calendar; keep its reminder in W1.
    const last = Math.max(0, Math.min(regrouped.length - 1, Math.floor((start + DAYS - 1 - firstSerial) / DAYS)))
    for (let w = first; w <= last; w++) {
      regrouped[w].importDoubts = [...new Set([...(regrouped[w].importDoubts ?? []), ...week.importDoubts!])]
    }
  }
  return regrouped
}

export function buildWeeks(
  parsed: ParsedWeek[], index: ExerciseIndex, startDate: string,
): { weeks: Week[]; startDate: string; droppedSourceWeeks: number } {
  // Selection and AI interpretation happen before this binder; do not truncate source content.
  const sourceWeeks = parsed
  // Mixed/undated selections retain their slots; the dialog supplies the chosen anchor.
  const dated = sourceWeeks.length > 0 && sourceWeeks.every(week => weekStartSerial(week) != null)
  const firstAnchor = sourceWeeks[0] ? weekStartSerial(sourceWeeks[0]) : null
  const effectiveStart = dated ? importStartDate(sourceWeeks) ?? startDate
    : firstAnchor == null ? startDate : excelSerialToISODate(firstAnchor)
  const curWeek = currentPlanWeek(effectiveStart)

  const weeks = (dated ? regroupDatedWeeks(sourceWeeks) : sourceWeeks).map((sourceWeek, weekIndex) => {
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
  // This branch selects the source window in the dialog, so the binder drops no source weeks.
  return { weeks, startDate: effectiveStart, droppedSourceWeeks: 0 }
}
