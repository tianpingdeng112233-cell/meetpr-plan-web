import type { PlanWithChildren, PlanExerciseResponse, PlanDayResponse } from '../../api/types'
import type { Week, DayCol, ExerciseRow, IntensityValueMode, RowIntensity, SetBox, WeightMode } from './types'

export const DOW_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

export interface CatalogEntry { name: string; custom: boolean }
export type Catalog = Map<string, CatalogEntry>

/** "82.50" -> "82.5", "80.00" -> "80", "9.00" -> "9". */
function fmtNum(s: string | number): string {
  const n = Number(s)
  if (Number.isNaN(n)) return String(s)
  return String(Number(n.toFixed(2)))
}

function optionalNum(value: string | number | null | undefined): string {
  return value == null ? '' : fmtNum(value)
}

function intensityFromSet(set: PlanExerciseResponse['sets'][number]): RowIntensity | null {
  switch (set.load_mode) {
    case 'pct': return { mode: 'pct', value: optionalNum(set.target_pct), high: '' }
    case 'rpe': return { mode: 'rpe', value: optionalNum(set.target_rpe), high: '' }
    case 'rir': return { mode: 'rir', value: optionalNum(set.rir_target), high: '' }
    case 'weight_range': return {
      mode: 'weight_range', value: optionalNum(set.weight_low), high: optionalNum(set.weight_high),
    }
    case 'rpe_range': return {
      mode: 'rpe_range', value: optionalNum(set.rpe_low), high: optionalNum(set.rpe_high),
    }
    case 'fixed_weight': return { mode: 'fixed_weight', value: '', high: '' }
    default: return null
  }
}

function singleIntensityValue(set: PlanExerciseResponse['sets'][number]): string {
  switch (set.load_mode) {
    case 'pct': return optionalNum(set.target_pct)
    case 'rpe': return optionalNum(set.target_rpe)
    case 'rir': return optionalNum(set.rir_target)
    default: return ''
  }
}

function weightModeForBoxes(boxes: SetBox[]): WeightMode {
  const values = boxes.map((box) => box.empty || box.val === '' ? '<empty>' : box.val)
  return new Set(values).size > 1 ? 'per_set' : 'uniform'
}

function intensityModeForBoxes(boxes: SetBox[]): IntensityValueMode {
  const values = boxes.map((box) => box.empty || box.val === '' ? '<empty>' : box.val)
  return new Set(values).size > 1 ? 'per_set' : 'uniform'
}

export function addDays(iso: string, days: number): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d + days)
}
export function isoDate(dt: Date): string {
  const y = dt.getFullYear()
  const m = String(dt.getMonth() + 1).padStart(2, '0')
  const d = String(dt.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
export function shiftISODate(iso: string, days: number): string { return isoDate(addDays(iso, days)) }
export function mdLabel(dt: Date): string { return `${dt.getMonth() + 1}/${dt.getDate()}` }

export function dowLabel(dt: Date): string {
  const mondayFirstIndex = (dt.getDay() + 6) % 7
  return DOW_LABELS[mondayFirstIndex]
}

export function planDayDate(startDate: string, weekNumber: number, dow: number): Date {
  return addDays(startDate, (weekNumber - 1) * 7 + dow)
}

export function planDayDateLabel(startDate: string, weekNumber: number, dow: number): string {
  return mdLabel(planDayDate(startDate, weekNumber, dow))
}

export function planDayDowLabel(startDate: string, weekNumber: number, dow: number): string {
  return dowLabel(planDayDate(startDate, weekNumber, dow))
}

export function planWeekRangeLabel(startDate: string, weekNumber: number): string {
  return `${planDayDateLabel(startDate, weekNumber, 0)} – ${planDayDateLabel(startDate, weekNumber, 6)}`
}

export function currentPlanWeek(startDate: string): number {
  const start = addDays(startDate, 0)
  const today = new Date()
  const dayDiff = Math.floor((today.getTime() - start.getTime()) / 86_400_000)
  return dayDiff >= 0 ? Math.floor(dayDiff / 7) + 1 : -1
}

function dateOnlyDiff(from: string, to: string): number {
  const [fromYear, fromMonth, fromDay] = from.split('-').map(Number)
  const [toYear, toMonth, toDay] = to.split('-').map(Number)
  return Math.round((
    Date.UTC(toYear, toMonth - 1, toDay) - Date.UTC(fromYear, fromMonth - 1, fromDay)
  ) / 86_400_000)
}

export function relabelWeeksForStartDate(weeks: Week[], startDate: string): Week[] {
  const curWeek = currentPlanWeek(startDate)
  return weeks.map((week) => ({
    ...week,
    range: planWeekRangeLabel(startDate, week.num),
    isCurrent: week.num === curWeek,
    days: week.days.map((day) => ({
      ...day,
      dowLabel: planDayDowLabel(startDate, week.num, day.dow),
      dateLabel: planDayDateLabel(startDate, week.num, day.dow),
      shiftedToDate: null,
      shiftBadge: null,
    })),
  }))
}

function emptyWeek(startDate: string, num: number): Week {
  return {
    num,
    num2: String(num).padStart(2, '0'),
    range: planWeekRangeLabel(startDate, num),
    isCurrent: num === currentPlanWeek(startDate),
    vol: '',
    days: Array.from({ length: 7 }, (_, dow) => ({
      dow,
      dowLabel: planDayDowLabel(startDate, num, dow),
      dateLabel: planDayDateLabel(startDate, num, dow),
      shiftedToDate: null,
      shiftBadge: null,
      rest: true,
      rows: [],
    })),
  }
}

/** Resize only the grid's week shell. Existing day/row objects are preserved;
 * newly added weeks are empty and calendar-labelled from Day 1. */
export function resizeWeeksForCount(weeks: Week[], count: number, startDate: string): Week[] {
  const bounded = Math.max(1, Math.min(52, count))
  if (bounded <= weeks.length) return weeks.slice(0, bounded)
  const next = [...weeks]
  for (let num = weeks.length + 1; num <= bounded; num++) next.push(emptyWeek(startDate, num))
  return next
}

function mapExercise(ex: PlanExerciseResponse, catalog: Catalog): ExerciseRow {
  const entry = catalog.get(ex.exercise_id)
  const name = entry?.name ?? '未知动作'
  const custom = entry?.custom ?? false
  const sets = [...ex.sets].sort((a, b) => a.set_number - b.set_number)

  if (sets.length === 0) {
    // notes-only accessory
    return {
      id: ex.id, serverRowId: ex.id, serverSortOrder: ex.sort_order,
      hasLogs: ex.has_logs ?? false, conflictMessage: null,
      exerciseId: ex.exercise_id, name, ku: !custom, custom, isMain: ex.is_main_lift,
      aux: true, reps: '—', mode: 'kg', intensity: null, weightMode: 'uniform', boxes: [], note: ex.notes ?? '',
    }
  }

  const bodyweight = sets.every((s) => /自重|bodyweight/i.test(s.coach_note ?? ''))
  const legacyRpeSource = !bodyweight && sets.every((set) => (
    set.load_mode == null && set.intensity_mode === 'rpe'
  ))
  const loadMode = sets[0].load_mode ?? null
  const uniformLoadMode = sets.every((set) => (set.load_mode ?? null) === loadMode)
  const singleValueMode = loadMode === 'pct' || loadMode === 'rpe' || loadMode === 'rir'
  const intensityBoxes: SetBox[] = sets.map((set) => {
    const value = legacyRpeSource ? optionalNum(set.target_value) : singleIntensityValue(set)
    return { empty: value === '', val: value }
  })
  const boxes: SetBox[] = sets.map((s) => {
    if (bodyweight) return { empty: true, val: '' }
    const weight = s.target_weight ?? (s.load_mode == null && s.intensity_mode === 'weight' ? s.target_value : null)
    return { empty: weight == null, val: optionalNum(weight) }
  })
  const baseReps = sets[0].target_reps
  const repsMax = sets[0].target_reps_max
  const hasAmrap = sets.some((s) => s.set_type === 'amrap')
  const reps = repsMax != null && repsMax > baseReps
    ? `${baseReps}-${repsMax}`
    : hasAmrap ? `${baseReps}+` : String(baseReps)
  return {
    id: ex.id, serverRowId: ex.id, serverSortOrder: ex.sort_order,
    hasLogs: ex.has_logs ?? false, conflictMessage: null,
    exerciseId: ex.exercise_id, name, ku: !custom, custom, isMain: ex.is_main_lift,
    aux: false,
    reps,
    // `mode: rpe` is provenance only: reconcile keeps load_mode=null until an
    // explicit row edit materializes the first-class intensity fields.
    mode: bodyweight ? 'bodyweight' : legacyRpeSource ? 'rpe' : 'kg',
    ...(!bodyweight && (legacyRpeSource || singleValueMode) ? {
      intensityMode: intensityModeForBoxes(intensityBoxes),
      intensityBoxes,
    } : {}),
    ...(legacyRpeSource ? {} : {
      intensity: bodyweight || !uniformLoadMode ? null : intensityFromSet(sets[0]),
    }),
    weightMode: weightModeForBoxes(boxes),
    boxes,
    note: ex.notes ?? '',
  }
}

export function mapPlanToWeeks(plan: PlanWithChildren, catalog: Catalog): Week[] {
  // today's week (relative to start_date), for the "current week" marker
  const curWeek = currentPlanWeek(plan.start_date)

  // index backend days by week -> day_of_week
  const byWeek = new Map<number, Map<number, PlanDayResponse>>()
  for (const day of plan.days) {
    if (!byWeek.has(day.week_number)) byWeek.set(day.week_number, new Map())
    byWeek.get(day.week_number)!.set(day.day_of_week, {
      ...day,
      exercises: [...day.exercises].sort((a, b) => a.sort_order - b.sort_order),
    })
  }

  const weeks: Week[] = []
  for (let w = 1; w <= plan.plan_weeks; w++) {
    const dayMap = byWeek.get(w)
    const days: DayCol[] = []
    for (let dow = 0; dow < 7; dow++) {
      const originalDate = isoDate(planDayDate(plan.start_date, w, dow))
      const serverDay = dayMap?.get(dow + 1)
      const shiftedToDate = serverDay?.shifted_to_date != null
        && serverDay.shifted_to_date !== originalDate
        ? serverDay.shifted_to_date
        : null
      const displayDate = shiftedToDate ? addDays(shiftedToDate, 0) : planDayDate(plan.start_date, w, dow)
      const dateLabel = mdLabel(displayDate)
      const displayDowLabel = dowLabel(displayDate)
      const shiftBadge = shiftedToDate
        ? { originalDate, days: dateOnlyDiff(originalDate, shiftedToDate) }
        : null
      const exs = serverDay?.exercises
      if (!exs || exs.length === 0) {
        days.push({ dow, dowLabel: displayDowLabel, dateLabel, shiftedToDate, shiftBadge, rest: true, rows: [] })
      } else {
        days.push({
          dow, dowLabel: displayDowLabel, dateLabel, shiftedToDate, shiftBadge,
          rest: false, rows: exs.map((e) => mapExercise(e, catalog)),
        })
      }
    }
    weeks.push({
      num: w,
      num2: String(w).padStart(2, '0'),
      range: planWeekRangeLabel(plan.start_date, w),
      isCurrent: w === curWeek,
      vol: '',
      days,
    })
  }
  return weeks
}
