import type { ExerciseStatsOverview, LiftFamily, StudentOnboardingProfile } from '../../api/types'
import type { ExerciseRow, Week } from './types'
import { parseTargetReps } from './weeklySummary'

export interface ExerciseInfoMetadata {
  mainLiftFamily: LiftFamily | null
  isCompetitionLift: boolean
}

export interface ExerciseInfoContext {
  weeks: readonly Week[]
  weekIndex: number
  row: ExerciseRow
  metadata: ExerciseInfoMetadata | null
  onboarding?: StudentOnboardingProfile | null
  statsOverview?: ExerciseStatsOverview | null
}

function finitePositive(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

export function roundToHalfKg(value: number): number | null {
  return Number.isFinite(value) && value > 0 ? Math.round(value * 2) / 2 : null
}

/** Epley estimate at @RPE8: add two reps in reserve, then round to 0.5 kg. */
export function estimateE1rmAtRpe8(weightKg: number, performedReps: number): number | null {
  if (!Number.isFinite(weightKg) || weightKg <= 0) return null
  if (!Number.isFinite(performedReps) || performedReps < 0) return null
  return roundToHalfKg(weightKg * (1 + (performedReps + 2) / 30))
}

function rowMatches(left: ExerciseRow, right: ExerciseRow): boolean {
  if (left.exerciseId && right.exerciseId) return left.exerciseId === right.exerciseId
  return left.name.trim() !== '' && left.name.trim() === right.name.trim()
}

function filledValues(row: ExerciseRow): number[] {
  return row.boxes
    .filter((box) => !box.empty && box.val.trim() !== '')
    .map((box) => Number(box.val))
    .filter((value) => Number.isFinite(value) && value > 0)
}

function previousWeekRow(weeks: readonly Week[], weekIndex: number, row: ExerciseRow): ExerciseRow | null {
  if (weekIndex <= 0) return null
  const rows = weeks[weekIndex - 1].days.flatMap((day) => day.rows)
  return [...rows].reverse().find((candidate) => rowMatches(candidate, row)) ?? null
}

function bestPreviousPrescription(
  weeks: readonly Week[],
  weekIndex: number,
  row: ExerciseRow,
): { weight: number; reps: number } | null {
  let best: { weight: number; reps: number } | null = null
  for (const week of weeks.slice(0, weekIndex)) for (const day of week.days) for (const candidate of day.rows) {
    if (!rowMatches(candidate, row) || candidate.mode !== 'kg') continue
    const reps = parseTargetReps(candidate.reps)
    const weight = Math.max(0, ...filledValues(candidate))
    if (reps == null || weight <= 0) continue
    if (!best || weight > best.weight || (weight === best.weight && reps > best.reps)) best = { weight, reps }
  }
  return best
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '')
}

function lastWeekToken(row: ExerciseRow | null): string | null {
  if (!row || row.boxes.length === 0) return null
  const reps = parseTargetReps(row.reps)
  if (reps == null) return null
  if (row.mode === 'bodyweight') return `上周 ${row.boxes.length} × ${reps} @自重`
  const values = filledValues(row)
  if (values.length === 0) return null
  const top = Math.max(...values)
  return row.mode === 'rpe'
    ? `上周 ${row.boxes.length} × ${reps} @RPE ${formatNumber(top)}`
    : `上周 ${row.boxes.length} × ${reps} @${formatNumber(top)}`
}

function oneRmForFamily(
  family: LiftFamily | null,
  onboarding?: StudentOnboardingProfile | null,
  overview?: ExerciseStatsOverview | null,
): number | null {
  if (!family) return null
  const profileValue = {
    squat: onboarding?.squat_1rm_kg,
    bench: onboarding?.bench_1rm_kg,
    deadlift: onboarding?.deadlift_1rm_kg,
  }[family]
  const statsValue = overview?.one_rm[family]
  return finitePositive(profileValue) ?? finitePositive(statsValue)
}

/**
 * Derive the compact fourth-line tokens without making any network request.
 * A missing datum removes that token entirely, so rows never render empty shells.
 */
export function buildExerciseInfoTokens(context: ExerciseInfoContext): string[] {
  const previous = previousWeekRow(context.weeks, context.weekIndex, context.row)
  const previousToken = lastWeekToken(previous)
  const tokens: string[] = []

  if (context.metadata?.isCompetitionLift) {
    const oneRm = oneRmForFamily(
      context.metadata.mainLiftFamily,
      context.onboarding,
      context.statsOverview,
    )
    if (oneRm != null) tokens.push(`1RM ${formatNumber(oneRm)}`)

    if (previous?.mode === 'kg') {
      const reps = parseTargetReps(previous.reps)
      const top = Math.max(0, ...filledValues(previous))
      const estimate = reps == null ? null : estimateE1rmAtRpe8(top, reps)
      if (estimate != null) tokens.push(`e1RM ${formatNumber(estimate)}`)
    }
  } else {
    const best = bestPreviousPrescription(context.weeks, context.weekIndex, context.row)
    if (best) tokens.push(`最佳 ${formatNumber(best.weight)} × ${best.reps}`)
  }

  if (previousToken) tokens.push(previousToken)
  return tokens
}
