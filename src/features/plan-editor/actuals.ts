import type { StudentSetLog } from '../../api/types'
import type { ExerciseRow } from './types'
import { displayedWeightMode, rowIntensity, rowIntensityBoxes, rowWeightBoxes } from './intensityModel'
import { isLegacyBodyweightSet } from './legacyBodyweight'

/** SPEC-038 §1: intensity tolerances; weight uses the 2026-11-13 exact comparison. */
export const RPE_TOLERANCE = 1
export const PCT_TOLERANCE_PP = 5

export interface ActualSet {
  set_index: number
  weight_kg: string | null
  reps: number
  rpe: string | null
  actual_rir?: number | null
  coach_rpe: string | null
  completed: boolean
  failed: boolean
}

const num = (value: string | null | undefined): number | null => {
  if (value == null || value.trim?.() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/** Latest log wins per (exercise, set_index) — a re-log replaces, not duplicates. */
export function groupActualsByExercise(logs: StudentSetLog[]): Map<string, ActualSet[]> {
  const latest = new Map<string, Map<number, StudentSetLog>>()
  for (const log of logs) {
    if (log.plan_exercise_id == null) continue
    const sets = latest.get(log.plan_exercise_id) ?? new Map<number, StudentSetLog>()
    const existing = sets.get(log.set_index)
    if (!existing || log.logged_at >= existing.logged_at) sets.set(log.set_index, log)
    latest.set(log.plan_exercise_id, sets)
  }
  const grouped = new Map<string, ActualSet[]>()
  for (const [exerciseId, sets] of latest) {
    grouped.set(exerciseId, [...sets.values()]
      .sort((a, b) => a.set_index - b.set_index)
      .map(({ set_index, weight_kg, reps, rpe, actual_rir, coach_rpe, completed, failed }) => (
        { set_index, weight_kg, reps, rpe, actual_rir, coach_rpe, completed, failed }
      )))
  }
  return grouped
}

/** Student-reported RPE first; the coach's estimate fills in when absent. */
export function actualRpe(set: ActualSet): number | null {
  return num(set.rpe) ?? num(set.coach_rpe)
}

/** `92.5×5` — actual load × actual reps, kg trimmed of trailing zeros. */
export function formatActualWeight(set: ActualSet): string {
  const weight = num(set.weight_kg)
  return `${weight == null ? '—' : String(weight)}×${set.reps}`
}

/** 配色三态:off=偏差红,ok=达标黄,na=无从比较中性。 */
export type ActualTone = 'ok' | 'off' | 'na'

const toTone = (withinTolerance: boolean): ActualTone => withinTolerance ? 'ok' : 'off'

/** 重量:数值不同/区间外红,相等/区间内黄;自重/无目标不判。 */
export function actualWeightTone(row: ExerciseRow, position: number, set: ActualSet): ActualTone {
  const actual = num(set.weight_kg)
  if (actual == null) return 'na'
  // Preserve each published set's target even when the grid projects only the first range/mode.
  if (row.opaqueSets) {
    const target = row.opaqueSets.find(prescribed => prescribed.set_number === position + 1)
    if (!target || target.load_mode === 'bodyweight' || target.load_mode === 'free_weight'
      || isLegacyBodyweightSet(target)) return 'na'
    if (target.load_mode === 'weight_range') {
      const low = num(target.weight_low)
      const high = num(target.weight_high)
      return low == null || high == null ? 'na' : toTone(actual >= low && actual <= high)
    }
    const weight = num(target.target_weight ?? (target.load_mode == null && target.intensity_mode === 'weight' ? target.target_value : null))
    return weight == null ? 'na' : toTone(actual === weight)
  }
  if (displayedWeightMode(row) === 'bodyweight') return 'na'
  const intensity = rowIntensity(row)
  if (intensity?.mode === 'weight_range') {
    const low = num(intensity.value)
    const high = num(intensity.high)
    if (low == null || high == null) return 'na'
    return toTone(actual >= low && actual <= high)
  }
  const boxes = rowWeightBoxes(row)
  const box = boxes[position] ?? boxes[0]
  const target = box && !box.empty ? num(box.val) : null
  if (target == null) return 'na'
  return toTone(actual === target)
}

export interface IntensityChip {
  text: string
  tone: ActualTone
}

/**
 * 强度列 chip。rpe/rpe_range 逐组比 ±1;pct 在 e1RM 可得时换算实际 % 比 ±5pp,
 * 不可得时退回显示实际 RPE 不判;rir 口径不可比,只显示。
 */
export function actualIntensityChip(
  row: ExerciseRow,
  position: number,
  set: ActualSet,
  e1rm: number | null,
): IntensityChip {
  if (set.actual_rir != null) return { text: `RIR ${set.actual_rir}`, tone: 'na' }
  const intensity = rowIntensity(row)
  const rpe = actualRpe(set)
  const rpeText = rpe == null ? '—' : `@${rpe}`
  if (intensity?.mode === 'pct') {
    const actual = num(set.weight_kg)
    if (e1rm != null && e1rm > 0 && actual != null) {
      const actualPct = actual / e1rm * 100
      const targetBox = rowIntensityBoxes(row)[position]
      const target = targetBox && !targetBox.empty ? num(targetBox.val) : null
      return {
        text: `${Math.round(actualPct)}%`,
        tone: target == null ? 'na' : toTone(Math.abs(actualPct - target) <= PCT_TOLERANCE_PP),
      }
    }
    return { text: rpeText, tone: 'na' }
  }
  if (intensity?.mode === 'rpe') {
    const targetBox = rowIntensityBoxes(row)[position]
    const target = targetBox && !targetBox.empty ? num(targetBox.val) : null
    return {
      text: rpeText,
      tone: rpe == null || target == null ? 'na' : toTone(Math.abs(rpe - target) <= RPE_TOLERANCE),
    }
  }
  if (intensity?.mode === 'rpe_range') {
    const low = num(intensity.value)
    const high = num(intensity.high)
    return {
      text: rpeText,
      tone: rpe == null || low == null || high == null
        ? 'na'
        : toTone(rpe >= low - RPE_TOLERANCE && rpe <= high + RPE_TOLERANCE),
    }
  }
  return { text: rpeText, tone: 'na' }
}

/** Server prescription boundary; sparse logs must not shift the boundary. */
export function splitActualSets(actuals: ActualSet[], prescribedCount: number) {
  return {
    prescribed: actuals.filter((set) => set.set_index < prescribedCount).sort((a, b) => a.set_index - b.set_index),
    extra: actuals.filter((set) => set.set_index >= prescribedCount).sort((a, b) => a.set_index - b.set_index),
  }
}

export interface StudentAddedExercise {
  exerciseId: string
  sets: ActualSet[]
}

/** Render-only actuals, deliberately separate from the editor's plan rows. */
export function groupStudentAddedByDay(logs: StudentSetLog[]): Map<string, StudentAddedExercise[]> {
  const days = new Map<string, Map<string, Map<number, StudentSetLog>>>()
  for (const log of logs) {
    if (!log.adhoc || !log.plan_day_id) continue
    const exercises = days.get(log.plan_day_id) ?? new Map<string, Map<number, StudentSetLog>>()
    const sets = exercises.get(log.exercise_id) ?? new Map<number, StudentSetLog>()
    const existing = sets.get(log.set_index)
    if (!existing || log.logged_at >= existing.logged_at) sets.set(log.set_index, log)
    exercises.set(log.exercise_id, sets)
    days.set(log.plan_day_id, exercises)
  }
  return new Map([...days].map(([dayId, exercises]) => [dayId, [...exercises].map(([exerciseId, sets]) => ({
    exerciseId,
    sets: [...sets.values()].sort((a, b) => a.set_index - b.set_index),
  }))]))
}
