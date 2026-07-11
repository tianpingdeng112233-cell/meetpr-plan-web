import type { ExerciseRow, IntensityMode } from './types'

export const KG_MAX_EXCLUSIVE = 600
export const RPE_MIN = 1
export const RPE_MAX = 10
export const RPE_STEP = 0.5
export const REPS_MIN = 1
export const REPS_MAX = 50

export const INPUT_GUARD_REASONS = {
  kg: `重量需大于 0 小于 ${KG_MAX_EXCLUSIVE}，最多两位小数`,
  rpe: `RPE 需 ${RPE_MIN}–${RPE_MAX} 半分档`,
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

export function isValidStrengthValue(value: string, mode: Exclude<IntensityMode, 'bodyweight'>): boolean {
  const trimmed = value.trim()
  if (!TARGET_VALUE_PATTERN.test(trimmed)) return false
  const numericValue = Number(trimmed)
  if (mode === 'kg') return numericValue > 0 && numericValue < KG_MAX_EXCLUSIVE
  return numericValue >= RPE_MIN
    && numericValue <= RPE_MAX
    && Number.isInteger(numericValue / RPE_STEP)
}

export function isValidReps(value: string): boolean {
  const match = value.trim().match(REPS_PATTERN)
  if (!match) return false
  const values = [match[1], match[2]].filter((part): part is string => part != null).map(Number)
  return values.every((numericValue) => numericValue >= REPS_MIN && numericValue <= REPS_MAX)
}

export interface BoundRowInputIssue {
  hasIncomplete: boolean
  invalidReps: boolean
  invalidStrengthIndexes: number[]
  reasons: InputGuardReason[]
}

/**
 * Single source of truth for editable prescription validity. Locked, unbound,
 * auxiliary and bodyweight-strength fields retain their existing exemptions.
 */
export function getBoundRowInputIssue(row: ExerciseRow): BoundRowInputIssue | null {
  if (!row.exerciseId || row.hasLogs || row.aux) return null

  const reps = row.reps.trim()
  const missingReps = reps === '' || reps === '—'
  const invalidReps = !missingReps && !isValidReps(reps)
  const missingSets = row.boxes.length === 0
  let missingStrength = false
  let invalidStrengthIndexes: number[] = []
  if (row.mode !== 'bodyweight') {
    const mode = row.mode
    missingStrength = row.boxes.some((box) => box.empty || box.val.trim() === '')
    invalidStrengthIndexes = row.boxes.flatMap((box, index) => (
      !box.empty && box.val.trim() !== '' && !isValidStrengthValue(box.val, mode) ? [index] : []
    ))
  }
  const hasIncomplete = missingReps || missingSets || missingStrength
  if (!hasIncomplete && !invalidReps && invalidStrengthIndexes.length === 0) return null

  const reasons: InputGuardReason[] = []
  if (invalidReps) reasons.push(INPUT_GUARD_REASONS.reps)
  if (invalidStrengthIndexes.length > 0) {
    reasons.push(row.mode === 'rpe' ? INPUT_GUARD_REASONS.rpe : INPUT_GUARD_REASONS.kg)
  }
  return { hasIncomplete, invalidReps, invalidStrengthIndexes, reasons }
}

export function isBoundNoSets(row: ExerciseRow): boolean {
  return getBoundRowInputIssue(row) != null
}
