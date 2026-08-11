import type { StudentSetLog } from '../../api/types'
import type { ExerciseRow } from './types'
import { displayedWeightMode, rowIntensity, rowIntensityBoxes, rowWeightBoxes } from './intensityModel'

/** SPEC-038 §1: deviation thresholds picked by David (2026-08-11). */
export const WEIGHT_TOLERANCE_KG = 5
export const RPE_TOLERANCE = 1
export const PCT_TOLERANCE_PP = 5

export interface ActualSet {
  set_index: number
  weight_kg: string
  reps: number
  rpe: string | null
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
      .map(({ set_index, weight_kg, reps, rpe, coach_rpe, completed, failed }) => (
        { set_index, weight_kg, reps, rpe, coach_rpe, completed, failed }
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

/** 配色三态:off=超阈红,ok=阈内黄(达标确认),na=无从比较中性。 */
export type ActualTone = 'ok' | 'off' | 'na'

const toTone = (withinTolerance: boolean): ActualTone => withinTolerance ? 'ok' : 'off'

/** 重量:|实际−目标| > 5kg 红,以内黄;区间以边界外 5kg 起算;自重/无目标不判。 */
export function actualWeightTone(row: ExerciseRow, position: number, set: ActualSet): ActualTone {
  const actual = num(set.weight_kg)
  if (actual == null) return 'na'
  if (displayedWeightMode(row) === 'bodyweight') return 'na'
  const intensity = rowIntensity(row)
  if (intensity?.mode === 'weight_range') {
    const low = num(intensity.value)
    const high = num(intensity.high)
    if (low == null || high == null) return 'na'
    return toTone(actual >= low - WEIGHT_TOLERANCE_KG && actual <= high + WEIGHT_TOLERANCE_KG)
  }
  const boxes = rowWeightBoxes(row)
  const box = boxes[position] ?? boxes[0]
  const target = box && !box.empty ? num(box.val) : null
  if (target == null) return 'na'
  return toTone(Math.abs(actual - target) <= WEIGHT_TOLERANCE_KG)
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
