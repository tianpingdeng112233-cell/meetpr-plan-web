import type { ExerciseRow, IntensityMode, LoadMode, RowIntensity } from './types'
import { isLegacyRpeRow, rowIntensity, rowWeightBoxes } from './intensityModel'

export const KG_MAX_EXCLUSIVE = 1000
export const PCT_MIN = 20
export const PCT_MAX = 110
export const RPE_MIN = 1
export const RPE_MAX = 10
export const RPE_STEP = 0.5
export const RIR_MIN = 0
export const RIR_MAX = 9
export const REPS_MIN = 1
export const REPS_MAX = 50

export const INPUT_GUARD_REASONS = {
  kg: `重量需大于 0 小于 ${KG_MAX_EXCLUSIVE}，最多两位小数`,
  pct: `%1RM 需 ${PCT_MIN}–${PCT_MAX}，按 0.5 递增`,
  rpe: `RPE 需 ${RPE_MIN}–${RPE_MAX} 半分档`,
  rir: `RIR 需 ${RIR_MIN}–${RIR_MAX} 的整数`,
  weightRange: `重量区间需两值有效且下限小于上限`,
  rpeRange: `RPE 区间需 1–10 半分档且下限小于上限`,
  fixedWeight: '固定重量必须为每组填写重量',
  weightRangeConflict: '重量区间不能同时填写重量列',
  reps: `次数需 ${REPS_MIN}–${REPS_MAX}`,
} as const

export type InputGuardReason = typeof INPUT_GUARD_REASONS[keyof typeof INPUT_GUARD_REASONS]

const TARGET_VALUE_PATTERN = /^\d+(?:\.\d{1,2})?$/
const REPS_PATTERN = /^(\d{1,2})(?:\s*(?:(?:-|–|—|~|到|至)\s*(\d{1,2})|(\+)))?$/
const REPS_INPUT_CHARACTER = /[0-9\-–—~到至+]/

/** Keep only decimal characters, retaining the first decimal point. */
export function filterStrengthInput(raw: string): string {
  let hasDecimalPoint = false
  let filtered = ''
  for (const character of raw) {
    if (character >= '0' && character <= '9') {
      filtered += character
    } else if (character === '.' && !hasDecimalPoint) {
      filtered += character
      hasDecimalPoint = true
    }
  }
  return filtered
}

/** Keep only the repetitions syntax supported by reconciliation. */
export function filterRepsInput(raw: string): string {
  return [...raw].filter((character) => REPS_INPUT_CHARACTER.test(character)).join('')
}

function parsedDecimal(value: string): number | null {
  const trimmed = value.trim()
  if (!TARGET_VALUE_PATTERN.test(trimmed)) return null
  const numericValue = Number(trimmed)
  return Number.isFinite(numericValue) ? numericValue : null
}

function isHalfStep(value: number): boolean {
  return Number.isInteger(value * 2)
}

export function isValidWeight(value: string): boolean {
  const numericValue = parsedDecimal(value)
  return numericValue != null && numericValue > 0 && numericValue < KG_MAX_EXCLUSIVE
}

/** Compatibility helper retained for import/tests and old row shapes. */
export function isValidStrengthValue(value: string, mode: Exclude<IntensityMode, 'bodyweight'>): boolean {
  const numericValue = parsedDecimal(value)
  if (numericValue == null) return false
  if (mode === 'kg') return isValidWeight(value)
  return numericValue >= RPE_MIN && numericValue <= RPE_MAX && isHalfStep(numericValue)
}

export function isValidReps(value: string): boolean {
  const match = value.trim().match(REPS_PATTERN)
  if (!match) return false
  const values = [match[1], match[2]].filter((part): part is string => part != null).map(Number)
  return values.every((numericValue) => numericValue >= REPS_MIN && numericValue <= REPS_MAX)
}

export function intensityReason(mode: LoadMode): InputGuardReason | null {
  switch (mode) {
    case 'pct': return INPUT_GUARD_REASONS.pct
    case 'rpe': return INPUT_GUARD_REASONS.rpe
    case 'rir': return INPUT_GUARD_REASONS.rir
    case 'weight_range': return INPUT_GUARD_REASONS.weightRange
    case 'rpe_range': return INPUT_GUARD_REASONS.rpeRange
    case 'fixed_weight': return null
  }
}

export function isValidIntensity(intensity: RowIntensity): boolean {
  if (intensity.mode === 'fixed_weight') return intensity.value === '' && intensity.high === ''
  const value = parsedDecimal(intensity.value)
  if (value == null) return false
  switch (intensity.mode) {
    case 'pct': return value >= PCT_MIN && value <= PCT_MAX && isHalfStep(value)
    case 'rpe': return value >= RPE_MIN && value <= RPE_MAX && isHalfStep(value)
    case 'rir': return Number.isInteger(value) && value >= RIR_MIN && value <= RIR_MAX
    case 'weight_range': {
      const high = parsedDecimal(intensity.high)
      return high != null && isValidWeight(intensity.value) && isValidWeight(intensity.high) && value < high
    }
    case 'rpe_range': {
      const high = parsedDecimal(intensity.high)
      return high != null
        && value >= RPE_MIN && value <= RPE_MAX && isHalfStep(value)
        && high >= RPE_MIN && high <= RPE_MAX && isHalfStep(high)
        && value < high
    }
  }
}

export interface BoundRowInputIssue {
  hasIncomplete: boolean
  invalidReps: boolean
  invalidIntensity: boolean
  invalidWeightIndexes: number[]
  /** Compatibility alias for the old single-column UI/tests. */
  invalidStrengthIndexes: number[]
  reasons: InputGuardReason[]
}

/** Single source of truth for spec-034 completion and matrix validation. */
export function getBoundRowInputIssue(row: ExerciseRow): BoundRowInputIssue | null {
  if (!row.exerciseId || row.hasLogs || row.aux) return null

  const reps = row.reps.trim()
  const missingReps = reps === '' || reps === '—'
  const invalidReps = !missingReps && !isValidReps(reps)
  const missingSets = row.boxes.length === 0

  if (row.mode === 'bodyweight') {
    const hasIncomplete = missingReps || missingSets
    if (!hasIncomplete && !invalidReps) return null
    return {
      hasIncomplete,
      invalidReps,
      invalidIntensity: false,
      invalidWeightIndexes: [],
      invalidStrengthIndexes: [],
      reasons: invalidReps ? [INPUT_GUARD_REASONS.reps] : [],
    }
  }

  const intensity = rowIntensity(row)
  const intensityValid = intensity != null && isValidIntensity(intensity)
  const invalidIntensity = intensity != null && !intensityValid
  const weights = rowWeightBoxes(row)
  const invalidWeightIndexes = weights.flatMap((box, index) => (
    !box.empty && box.val.trim() !== '' && !isValidWeight(box.val) ? [index] : []
  ))
  const anyWeight = weights.some((box) => !box.empty && box.val.trim() !== '')
  const missingWeightIndexes = weights.flatMap((box, index) => (
    box.empty || box.val.trim() === '' ? [index] : []
  ))
  const rangeConflict = intensity?.mode === 'weight_range' && anyWeight
  const fixedMissingWeight = intensity?.mode === 'fixed_weight' && missingWeightIndexes.length > 0

  // A valid row-level intensity completes every set except fixed_weight, whose
  // actual prescription lives solely in the concrete-weight column.
  const intensityHasCompleteShape = intensity != null && intensity.mode !== 'fixed_weight'
    && intensity.value.trim() !== ''
    && (intensity.mode !== 'weight_range' && intensity.mode !== 'rpe_range' || intensity.high.trim() !== '')
  const legacyRpe = isLegacyRpeRow(row)
  const incompleteSet = !legacyRpe && !intensityHasCompleteShape && missingWeightIndexes.length > 0
  const legacyMissingIntensity = legacyRpe
    && row.boxes.some((box) => box.empty || box.val.trim() === '')
  const hasIncomplete = missingReps || missingSets || incompleteSet || fixedMissingWeight || legacyMissingIntensity

  // Old per-set RPE is validated in place until the coach edits it into the new
  // row-level shape, preserving old plans and import behavior without data loss.
  const legacyInvalidIndexes = legacyRpe
    ? row.boxes.flatMap((box, index) => (
      !box.empty && box.val.trim() !== '' && !isValidStrengthValue(box.val, 'rpe') ? [index] : []
    ))
    : []
  const allInvalidWeightIndexes = [...new Set([...invalidWeightIndexes, ...legacyInvalidIndexes])]

  if (!hasIncomplete && !invalidReps && !invalidIntensity && !rangeConflict && allInvalidWeightIndexes.length === 0) return null

  const reasons: InputGuardReason[] = []
  if (invalidReps) reasons.push(INPUT_GUARD_REASONS.reps)
  if (invalidIntensity && intensity) {
    const reason = intensityReason(intensity.mode)
    if (reason) reasons.push(reason)
  }
  if (legacyInvalidIndexes.length > 0) reasons.push(INPUT_GUARD_REASONS.rpe)
  if (invalidWeightIndexes.length > 0) reasons.push(INPUT_GUARD_REASONS.kg)
  if (fixedMissingWeight) reasons.push(INPUT_GUARD_REASONS.fixedWeight)
  if (rangeConflict) reasons.push(INPUT_GUARD_REASONS.weightRangeConflict)

  return {
    hasIncomplete,
    invalidReps,
    invalidIntensity,
    invalidWeightIndexes,
    invalidStrengthIndexes: allInvalidWeightIndexes,
    reasons: [...new Set(reasons)],
  }
}

export function isBoundNoSets(row: ExerciseRow): boolean {
  return getBoundRowInputIssue(row) != null
}
