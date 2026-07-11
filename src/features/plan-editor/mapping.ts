import type { PlanWithChildren, PlanExerciseResponse } from '../../api/types'
import type { Week, DayCol, ExerciseRow, SetBox } from './types'

export const DOW_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

export interface CatalogEntry { name: string; custom: boolean }
export type Catalog = Map<string, CatalogEntry>

/** "82.50" -> "82.5", "80.00" -> "80", "9.00" -> "9". */
function fmtNum(s: string): string {
  const n = Number(s)
  if (Number.isNaN(n)) return s
  return String(Number(n.toFixed(2)))
}

export function addDays(iso: string, days: number): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d + days)
}
export function mdLabel(dt: Date): string { return `${dt.getMonth() + 1}/${dt.getDate()}` }

export function planDayDateLabel(startDate: string, weekNumber: number, dow: number): string {
  return mdLabel(addDays(startDate, (weekNumber - 1) * 7 + dow))
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
      aux: true, reps: '—', mode: 'kg', boxes: [], note: ex.notes ?? '',
    }
  }

  const mode = sets[0].intensity_mode === 'rpe' ? 'rpe' : 'kg'
  const boxes: SetBox[] = sets.map((s) => ({ empty: false, val: fmtNum(s.target_value) }))
  const hasAmrap = sets.some((s) => s.set_type === 'amrap' || s.target_reps_max != null)
  const baseReps = sets[0].target_reps
  const reps = hasAmrap ? `${baseReps}+` : String(baseReps)
  return {
    id: ex.id, serverRowId: ex.id, serverSortOrder: ex.sort_order,
    hasLogs: ex.has_logs ?? false, conflictMessage: null,
    exerciseId: ex.exercise_id, name, ku: !custom, custom, isMain: ex.is_main_lift,
    aux: false, reps, mode, boxes, note: ex.notes ?? '',
  }
}

export function mapPlanToWeeks(plan: PlanWithChildren, catalog: Catalog): Week[] {
  // today's week (relative to start_date), for the "current week" marker
  const curWeek = currentPlanWeek(plan.start_date)

  // index backend days by week -> day_of_week
  const byWeek = new Map<number, Map<number, PlanExerciseResponse[]>>()
  for (const day of plan.days) {
    if (!byWeek.has(day.week_number)) byWeek.set(day.week_number, new Map())
    const exs = [...day.exercises].sort((a, b) => a.sort_order - b.sort_order)
    byWeek.get(day.week_number)!.set(day.day_of_week, exs)
  }

  const weeks: Week[] = []
  for (let w = 1; w <= plan.plan_weeks; w++) {
    const dayMap = byWeek.get(w)
    const days: DayCol[] = []
    for (let dow = 0; dow < 7; dow++) {
      const dateLabel = planDayDateLabel(plan.start_date, w, dow)
      const exs = dayMap?.get(dow + 1)
      if (!exs || exs.length === 0) {
        days.push({ dow, dowLabel: DOW_LABELS[dow], dateLabel, rest: true, rows: [] })
      } else {
        days.push({ dow, dowLabel: DOW_LABELS[dow], dateLabel, rest: false, rows: exs.map((e) => mapExercise(e, catalog)) })
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
